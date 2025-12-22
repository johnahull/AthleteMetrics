/**
 * Derived Metric Calculator Service
 *
 * Automatically calculates derived metric values from source measurements.
 * Handles date matching strategies, direct measurement priority, and recalculation.
 */

import type { db as dbType } from '../db';
import {
  measurements,
  siteMetrics,
  users,
  type Measurement,
  type InsertMeasurement,
  type SiteMetric,
} from '@shared/schema';
import { eq, and, gte, lte, sql, or, desc, asc } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';

// Type for Drizzle transaction
type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof import('@shared/schema'),
  ExtractTablesWithRelations<typeof import('@shared/schema')>
>;
import { evaluateFormula } from './formula-service';

// ============================================================================
// Metric Config Cache - Performance Optimization
// ============================================================================

/**
 * In-memory cache for metric configurations to avoid repeated database queries.
 *
 * **Performance Impact:**
 * - Without cache: Bulk CSV import with 1000 measurements = 1000 DB queries = 10-50s overhead
 * - With cache: After warmup, queries reduced to ~0ms (95%+ cache hit rate expected)
 *
 * **Cache Strategy:**
 * - TTL: 5 minutes (metric configs rarely change)
 * - Invalidation: Manual via invalidate() method when metrics are updated
 * - Warmup: Pre-populate cache on server startup for best performance
 */
class MetricConfigCache {
  private cache = new Map<string, { higherIsBetter: boolean; cachedAt: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get metric configurations from cache or database.
   *
   * @param metricCodes - Array of metric codes to fetch (will be normalized to uppercase)
   * @param db - Database connection or transaction
   * @returns Map of uppercase metric codes to { higherIsBetter: boolean }
   */
  async get(
    metricCodes: string[],
    db: typeof dbType | DbTransaction
  ): Promise<Map<string, { higherIsBetter: boolean }>> {
    const now = Date.now();
    const result = new Map<string, { higherIsBetter: boolean }>();
    const missing: string[] = [];

    // Check cache first
    for (const code of metricCodes) {
      const upperCode = code.toUpperCase();
      const cached = this.cache.get(upperCode);

      if (cached && now - cached.cachedAt < this.TTL) {
        // Cache hit - use cached value
        result.set(upperCode, { higherIsBetter: cached.higherIsBetter });
      } else {
        // Cache miss or expired - need to fetch from DB
        missing.push(upperCode);
      }
    }

    // Fetch missing metric configs from database
    if (missing.length > 0) {
      const metricConfigs = await db
        .select({
          code: siteMetrics.code,
          metricType: siteMetrics.metricType,
        })
        .from(siteMetrics)
        .where(
          sql`UPPER(${siteMetrics.code}) = ANY(ARRAY[${sql.join(
            missing.map(code => sql`${code}`),
            sql`, `
          )}]::text[])`
        );

      // Update cache and result
      for (const config of metricConfigs) {
        const upperCode = config.code.toUpperCase();
        const higherIsBetter = config.metricType === 'higher_is_better';

        // Store in cache with timestamp
        this.cache.set(upperCode, {
          higherIsBetter,
          cachedAt: now,
        });

        // Add to result
        result.set(upperCode, { higherIsBetter });
      }
    }

    return result;
  }

  /**
   * Invalidate cached metric configuration.
   * Call this when metrics are created, updated, or deleted.
   *
   * @param metricCode - Optional specific metric code to invalidate. If omitted, clears entire cache.
   */
  invalidate(metricCode?: string): void {
    if (metricCode) {
      this.cache.delete(metricCode.toUpperCase());
    } else {
      this.cache.clear();
    }
  }

  /**
   * Pre-warm the cache with all active metrics.
   * Call this on server startup for optimal performance.
   *
   * @param db - Database connection
   */
  async warmup(db: typeof dbType): Promise<void> {
    try {
      const allMetrics = await db
        .select({
          code: siteMetrics.code,
          metricType: siteMetrics.metricType,
        })
        .from(siteMetrics)
        .where(eq(siteMetrics.isActive, true));

      const now = Date.now();
      for (const metric of allMetrics) {
        this.cache.set(metric.code.toUpperCase(), {
          higherIsBetter: metric.metricType === 'higher_is_better',
          cachedAt: now,
        });
      }

      console.log(`✅ MetricConfigCache warmed up with ${allMetrics.length} metrics`);
    } catch (error) {
      console.error('Failed to warmup MetricConfigCache:', error);
    }
  }
}

// ============================================================================
// Types for Audit Trail and Recalculation Options
// ============================================================================

/**
 * Context about what triggered a derived metric calculation.
 * Used for audit trail and debugging.
 */
export type TriggerContext = {
  event: 'measurement_insert' | 'measurement_update' | 'measurement_delete' | 'manual_recalculation' | 'bulk_import';
  userId?: string;              // Who triggered the calculation (if applicable)
  sourceMeasurementId?: string; // Source measurement that triggered the calculation
};

/**
 * Options for the recalculateForAthlete method.
 */
export interface RecalculateOptions {
  useTransaction?: boolean;     // Default: false (avoids long-running transactions)
  triggerContext?: TriggerContext;
}

/**
 * Current version of the calculation algorithm.
 * Increment this when making changes to calculation logic.
 */
const CALCULATION_VERSION = '1.0.0';

export class DerivedMetricCalculator {
  private metricConfigCache: MetricConfigCache;

  constructor(private db: typeof dbType) {
    this.metricConfigCache = new MetricConfigCache();
  }

  /**
   * Warm up the metric config cache with all active metrics.
   * Call this on server startup for optimal performance.
   */
  async warmupCache(): Promise<void> {
    await this.metricConfigCache.warmup(this.db);
  }

  /**
   * Invalidate the metric config cache.
   * Call this when metrics are created, updated, or deleted.
   *
   * @param metricCode - Optional specific metric code to invalidate
   */
  invalidateCache(metricCode?: string): void {
    this.metricConfigCache.invalidate(metricCode);
  }

  /**
   * Called after a measurement is created/updated.
   * Finds derived metrics that depend on this measurement's metric
   * and calculates their values if possible.
   *
   * RACE CONDITION FIX: Wrapped in transaction to prevent duplicate calculations
   * when multiple measurements are submitted concurrently.
   *
   * @param measurement - The source measurement that was created/updated
   * @param triggerContext - Optional context about what triggered this calculation (for audit trail)
   */
  async processNewMeasurement(
    measurement: Measurement,
    triggerContext?: TriggerContext
  ): Promise<Measurement[]> {
    // RACE CONDITION FIX: Wrap entire operation in transaction
    return await this.db.transaction(async (tx) => {
      // Find all active derived metrics
      const derivedMetrics = await tx
        .select()
        .from(siteMetrics)
        .where(
          and(
            eq(siteMetrics.isDerived, true),
            eq(siteMetrics.isActive, true)
          )
        );

      // Filter to only those that depend on this measurement's metric
      // Case-insensitive comparison to handle mixed-case dependent_metrics config
      const measurementMetricUpper = measurement.metric.toUpperCase();
      const dependentDerivedMetrics = derivedMetrics.filter(
        (metric: SiteMetric) =>
          metric.dependentMetrics &&
          metric.dependentMetrics.some(dep => dep.toUpperCase() === measurementMetricUpper)
      );

      if (dependentDerivedMetrics.length === 0) {
        return [];
      }

      const calculatedMeasurements: Measurement[] = [];

      // Fetch metric configurations for all dependent metrics to enable best value selection
      // Build a Map of metric code -> { higherIsBetter }
      const allDependentMetrics = new Set<string>();
      for (const derivedMetric of dependentDerivedMetrics) {
        for (const depMetric of (derivedMetric.dependentMetrics || [])) {
          allDependentMetrics.add(depMetric.toUpperCase());
        }
      }

      // Fetch metric configurations for best value selection
      const metricCodes = Array.from(allDependentMetrics);
      const metricConfigsMap = await this.fetchMetricConfigs(tx, metricCodes);

      // Process each derived metric
      // NOTE: Sequential processing pattern (potential N+1 queries)
      // For typical use cases (1-2 derived metrics per source measurement), this performs well.
      // If scaling issues arise (many derived metrics triggered per source measurement),
      // consider batch-fetching all source measurements upfront or implementing a calculation queue.
      // Current implementation prioritizes code clarity and transaction safety over premature optimization.
      for (const derivedMetric of dependentDerivedMetrics) {
        try {
          // Check if athlete already has a direct (non-calculated) measurement for this derived metric on this date
          const [directMeasurement] = await tx
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, measurement.userId),
                eq(measurements.metric, derivedMetric.code),
                eq(measurements.date, measurement.date),
                eq(measurements.isCalculated, false)
              )
            )
            .limit(1);

          if (directMeasurement) {
            // Direct measurements take priority - skip calculation
            continue;
          }

          // Find source measurements for the formula
          const sourceMeasurementsMap = await this.findSourceMeasurementsInTransaction(
            tx,
            measurement.userId,
            derivedMetric.dependentMetrics || [],
            measurement.date,
            derivedMetric.calculationConfig || {
              dateMatchStrategy: 'same_date',
              missingSourceBehavior: 'skip',
            },
            metricConfigsMap
          );

          if (!sourceMeasurementsMap) {
            // Missing source measurements - skip based on missingSourceBehavior
            continue;
          }

          // Build source values for formula evaluation
          // Keys are normalized to lowercase to match formula service's variable normalization
          const sourceValues: Record<string, number> = {};
          const sourceMeasurementIds: string[] = [];

          for (const [metricCode, sourceMeasurement] of sourceMeasurementsMap.entries()) {
            sourceValues[metricCode.toLowerCase()] = parseFloat(sourceMeasurement.value);
            sourceMeasurementIds.push(sourceMeasurement.id);
          }

          // Evaluate the formula
          const calculatedValue = evaluateFormula(
            derivedMetric.formula || '',
            sourceValues
          );

          if (calculatedValue === null) {
            // Formula evaluation failed
            continue;
          }

          // Check for invalid results (Infinity, NaN)
          if (!isFinite(calculatedValue)) {
            continue;
          }

          // Get user info for age calculation
          const [user] = await tx
            .select()
            .from(users)
            .where(eq(users.id, measurement.userId));

          if (!user) {
            continue;
          }

          // Calculate age at measurement date
          const measurementDate = new Date(measurement.date);
          let age = 0;
          if (user.birthDate) {
            const birthDate = new Date(user.birthDate);
            age = measurementDate.getFullYear() - birthDate.getFullYear();
            const birthdayThisYear = new Date(
              measurementDate.getFullYear(),
              birthDate.getMonth(),
              birthDate.getDate()
            );
            if (measurementDate < birthdayThisYear) {
              age -= 1;
            }
          }

          // Check if calculated measurement already exists (update scenario)
          const existingCalculated = await tx
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, measurement.userId),
                eq(measurements.metric, derivedMetric.code),
                eq(measurements.date, measurement.date),
                eq(measurements.isCalculated, true)
              )
            );

          let createdMeasurement: Measurement;

          if (existingCalculated.length > 0) {
            // Update existing calculated measurement
            const [updated] = await tx
              .update(measurements)
              .set({
                value: calculatedValue.toFixed(3),
                calculatedFromMeasurementIds: sourceMeasurementIds,
                calculationMetadata: {
                  formula: derivedMetric.formula || '',
                  sourceValues,
                  calculatedAt: new Date().toISOString(),
                  calculationVersion: CALCULATION_VERSION,
                  triggeredBy: triggerContext || { event: 'measurement_insert' },
                },
              })
              .where(eq(measurements.id, existingCalculated[0].id))
              .returning();

            createdMeasurement = updated;
          } else {
            // Create new calculated measurement
            const [newMeasurement] = await tx
              .insert(measurements)
              .values({
                userId: measurement.userId,
                submittedBy: measurement.submittedBy,
                date: measurement.date,
                metric: derivedMetric.code,
                value: calculatedValue.toFixed(3),
                units: derivedMetric.unit || '',
                age,
                isVerified: measurement.isVerified,
                teamId: measurement.teamId,
                season: measurement.season,
                teamContextAuto: measurement.teamContextAuto,
                teamNameSnapshot: measurement.teamNameSnapshot,
                organizationId: measurement.organizationId,
                isCalculated: true,
                calculatedFromMeasurementIds: sourceMeasurementIds,
                calculationMetadata: {
                  formula: derivedMetric.formula || '',
                  sourceValues,
                  calculatedAt: new Date().toISOString(),
                  calculationVersion: CALCULATION_VERSION,
                  triggeredBy: triggerContext || { event: 'measurement_insert' },
                },
              })
              .returning();

            createdMeasurement = newMeasurement;
          }

          calculatedMeasurements.push(createdMeasurement);
        } catch (error) {
          // Log error but continue processing other derived metrics
          console.error(
            `Error calculating derived metric ${derivedMetric.code}:`,
            error
          );
        }
      }

      return calculatedMeasurements;
    });
  }

  /**
   * Fetch metric configurations for dependent metrics to enable best value selection.
   * Returns a map of metric codes (uppercase) to their metricType configuration.
   *
   * Uses MetricConfigCache for performance optimization during bulk operations.
   *
   * @param dbOrTx - Database connection or transaction
   * @param metricCodes - Array of metric codes to fetch configs for (will be normalized to uppercase)
   * @returns Map of uppercase metric codes to { higherIsBetter: boolean }
   */
  private async fetchMetricConfigs(
    dbOrTx: typeof dbType | DbTransaction,
    metricCodes: string[]
  ): Promise<Map<string, { higherIsBetter: boolean }>> {
    if (metricCodes.length === 0) {
      return new Map<string, { higherIsBetter: boolean }>();
    }

    // Use cache for performance optimization
    return await this.metricConfigCache.get(metricCodes, dbOrTx);
  }

  /**
   * Recalculate derived measurements for an athlete when source changes.
   * Called after measurement update or delete.
   *
   * @param userId - The athlete's user ID
   * @param metricCode - The source metric code that changed
   * @param date - Optional date filter (if omitted, recalculates all dates)
   * @param options - Optional configuration for transaction and audit trail
   * @param options.useTransaction - If true, wraps operation in a transaction (default: false)
   * @param options.triggerContext - Context for audit trail
   */
  async recalculateForAthlete(
    userId: string,
    metricCode: string,
    date?: string,
    options?: RecalculateOptions
  ): Promise<void> {
    const { useTransaction = false, triggerContext } = options || {};

    if (useTransaction) {
      await this.db.transaction(async (tx) => {
        await this.recalculateForAthleteInternal(tx, userId, metricCode, date, triggerContext);
      });
    } else {
      await this.recalculateForAthleteInternal(this.db, userId, metricCode, date, triggerContext);
    }
  }

  /**
   * Internal implementation of recalculateForAthlete that accepts a db or transaction.
   * This allows the same logic to run inside or outside a transaction.
   */
  private async recalculateForAthleteInternal(
    dbOrTx: typeof dbType | DbTransaction,
    userId: string,
    metricCode: string,
    date?: string,
    triggerContext?: TriggerContext
  ): Promise<void> {
    // Find all derived metrics that depend on this source metric
    const derivedMetrics = await dbOrTx
      .select()
      .from(siteMetrics)
      .where(
        and(
          eq(siteMetrics.isDerived, true),
          eq(siteMetrics.isActive, true)
        )
      );

    // Case-insensitive comparison to handle mixed-case dependent_metrics config
    const metricCodeUpper = metricCode.toUpperCase();
    const dependentDerivedMetrics = derivedMetrics.filter(
      (metric: SiteMetric) =>
        metric.dependentMetrics &&
        metric.dependentMetrics.some(dep => dep.toUpperCase() === metricCodeUpper)
    );

    if (dependentDerivedMetrics.length === 0) {
      return;
    }

    // Fetch metric configurations for all dependent metrics to enable best value selection
    const allDependentMetrics = new Set<string>();
    for (const derivedMetric of dependentDerivedMetrics) {
      for (const depMetric of (derivedMetric.dependentMetrics || [])) {
        allDependentMetrics.add(depMetric.toUpperCase());
      }
    }

    // Fetch metric configurations for best value selection
    const metricCodes = Array.from(allDependentMetrics);
    const metricConfigsMap = await this.fetchMetricConfigs(dbOrTx, metricCodes);

    // For each derived metric, recalculate or delete calculated measurements
    for (const derivedMetric of dependentDerivedMetrics) {
      try {
        // Find all calculated measurements for this derived metric and athlete
        // Build conditions array based on whether date is specified
        const conditions = [
          eq(measurements.userId, userId),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        ];

        if (date) {
          conditions.push(eq(measurements.date, date));
        }

        const calculatedMeasurements = await dbOrTx
          .select()
          .from(measurements)
          .where(and(...conditions));

        for (const calculatedMeasurement of calculatedMeasurements) {
          // Try to find source measurements
          const sourceMeasurementsMap = await this.findSourceMeasurementsWithDb(
            dbOrTx,
            userId,
            derivedMetric.dependentMetrics || [],
            calculatedMeasurement.date,
            derivedMetric.calculationConfig || {
              dateMatchStrategy: 'same_date',
              missingSourceBehavior: 'skip',
            },
            metricConfigsMap
          );

          if (!sourceMeasurementsMap) {
            // Source measurements no longer available - delete calculated measurement
            await dbOrTx
              .delete(measurements)
              .where(eq(measurements.id, calculatedMeasurement.id));
            continue;
          }

          // Build source values for formula evaluation
          // Keys are normalized to lowercase to match formula service's variable normalization
          const sourceValues: Record<string, number> = {};
          const sourceMeasurementIds: string[] = [];

          for (const [metricCode, sourceMeasurement] of sourceMeasurementsMap.entries()) {
            sourceValues[metricCode.toLowerCase()] = parseFloat(sourceMeasurement.value);
            sourceMeasurementIds.push(sourceMeasurement.id);
          }

          // Evaluate the formula
          const calculatedValue = evaluateFormula(
            derivedMetric.formula || '',
            sourceValues
          );

          if (calculatedValue === null || !isFinite(calculatedValue)) {
            // Formula evaluation failed - delete calculated measurement
            await dbOrTx
              .delete(measurements)
              .where(eq(measurements.id, calculatedMeasurement.id));
            continue;
          }

          // Update calculated measurement
          await dbOrTx
            .update(measurements)
            .set({
              value: calculatedValue.toFixed(3),
              calculatedFromMeasurementIds: sourceMeasurementIds,
              calculationMetadata: {
                formula: derivedMetric.formula || '',
                sourceValues,
                calculatedAt: new Date().toISOString(),
                calculationVersion: CALCULATION_VERSION,
                triggeredBy: triggerContext,
              },
            })
            .where(eq(measurements.id, calculatedMeasurement.id));
        }
      } catch (error) {
        console.error(
          `Error recalculating derived metric ${derivedMetric.code}:`,
          error
        );
      }
    }
  }

  /**
   * Find source measurements using a specific db or transaction context.
   * Used by recalculateForAthleteInternal to support both transaction and non-transaction modes.
   */
  private async findSourceMeasurementsWithDb(
    dbOrTx: typeof dbType | DbTransaction,
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: {
      dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
      maxDateDifference?: number;
      missingSourceBehavior: 'skip' | 'error';
    },
    metricConfigs?: Map<string, { higherIsBetter: boolean }>
  ): Promise<Map<string, Measurement> | null> {
    return this.findSourceMeasurementsImpl(dbOrTx, userId, dependentMetrics, targetDate, config, metricConfigs);
  }

  /**
   * Public method for finding source measurements (used for calculation preview in UI)
   *
   * This is a wrapper around the private findSourceMeasurements method that allows
   * external code (e.g., API routes) to preview what source measurements would be used
   * for a derived metric calculation without actually performing the calculation.
   *
   * Use this when you need to:
   * - Show a calculation preview in the measurement form UI
   * - Validate that source data exists before allowing derived metric creation
   * - Debug which source measurements are being selected by date matching strategies
   *
   * Use the private findSourceMeasurementsInTransaction when:
   * - Operating within an existing database transaction (e.g., during measurement creation)
   * - You need transaction isolation to prevent race conditions
   *
   * @param userId - The user ID who owns the measurements
   * @param dependentMetrics - Array of source metric codes required for calculation
   * @param targetDate - The target date for matching source measurements (YYYY-MM-DD)
   * @param config - Configuration for date matching and missing data handling
   * @param config.dateMatchStrategy - How to find source measurements by date ('same_date', 'latest_before', or 'closest')
   * @param config.maxDateDifference - For 'closest' strategy, max days difference allowed
   * @param config.missingSourceBehavior - What to do if source data is missing ('skip' returns null, 'error' throws)
   * @returns Map of metric code to measurement, or null if any required source is missing (when behavior is 'skip')
   * @throws Error if required source measurements are missing and behavior is 'error'
   */
  async findSourceMeasurementsPublic(
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: {
      dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
      maxDateDifference?: number;
      missingSourceBehavior: 'skip' | 'error';
    },
    metricConfigs?: Map<string, { higherIsBetter: boolean }>
  ): Promise<Map<string, Measurement> | null> {
    return this.findSourceMeasurements(userId, dependentMetrics, targetDate, config, metricConfigs);
  }

  /**
   * Transaction-aware version of findSourceMeasurements
   * Used within processNewMeasurement transaction to prevent deadlocks
   */
  private async findSourceMeasurementsInTransaction(
    tx: DbTransaction,
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: {
      dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
      maxDateDifference?: number;
      missingSourceBehavior: 'skip' | 'error';
    },
    metricConfigs?: Map<string, { higherIsBetter: boolean }>
  ): Promise<Map<string, Measurement> | null> {
    return this.findSourceMeasurementsImpl(tx, userId, dependentMetrics, targetDate, config, metricConfigs);
  }

  /**
   * Find source measurements for a formula using date matching strategy.
   * @returns Map of metric code to measurement, or null if any source is missing
   */
  private async findSourceMeasurements(
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: {
      dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
      maxDateDifference?: number;
      missingSourceBehavior: 'skip' | 'error';
    },
    metricConfigs?: Map<string, { higherIsBetter: boolean }>
  ): Promise<Map<string, Measurement> | null> {
    return this.findSourceMeasurementsImpl(this.db, userId, dependentMetrics, targetDate, config, metricConfigs);
  }

  /**
   * Core implementation for finding source measurements using date matching strategies.
   * This method is used by all three public/private variants (findSourceMeasurements,
   * findSourceMeasurementsInTransaction, findSourceMeasurementsWithDb) to avoid code duplication.
   *
   * @param dbOrTx - Database connection or transaction context
   * @param userId - The user ID who owns the measurements
   * @param dependentMetrics - Array of source metric codes to find
   * @param targetDate - The target date for date matching (YYYY-MM-DD)
   * @param config - Date matching and missing data handling configuration
   * @returns Map of metric code to measurement, or null if any required source is missing
   */
  private async findSourceMeasurementsImpl(
    dbOrTx: typeof dbType | DbTransaction,
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: {
      dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
      maxDateDifference?: number;
      missingSourceBehavior: 'skip' | 'error';
    },
    metricConfigs?: Map<string, { higherIsBetter: boolean }>
  ): Promise<Map<string, Measurement> | null> {
    const sourceMeasurementsMap = new Map<string, Measurement>();

    for (const metricCode of dependentMetrics) {
      // Normalize metric code to uppercase to match database convention
      const normalizedMetricCode = metricCode.toUpperCase();
      let sourceMeasurement: Measurement | undefined;

      // Determine if this metric prefers higher values (for sorting best value first)
      // Default to true (higher is better) if not specified
      const higherIsBetter = metricConfigs?.get(normalizedMetricCode)?.higherIsBetter ?? true;

      switch (config.dateMatchStrategy) {
        case 'same_date':
          // Only use exact date matches
          // Order by best value (based on higherIsBetter), then by most recent as tie-breaker
          const [exactMatch] = await dbOrTx
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, userId),
                eq(measurements.metric, normalizedMetricCode),
                eq(measurements.date, targetDate),
                eq(measurements.isVerified, true)
              )
            )
            .orderBy(
              higherIsBetter ? desc(measurements.value) : asc(measurements.value),
              desc(measurements.createdAt)
            )
            .limit(1);

          sourceMeasurement = exactMatch;
          break;

        case 'latest_before':
          // Use most recent measurement on or before target date
          // First priority: date (most recent), then best value, then created time
          const [latestBefore] = await dbOrTx
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, userId),
                eq(measurements.metric, normalizedMetricCode),
                lte(measurements.date, targetDate),
                eq(measurements.isVerified, true)
              )
            )
            .orderBy(
              desc(measurements.date),
              higherIsBetter ? desc(measurements.value) : asc(measurements.value),
              desc(measurements.createdAt)
            )
            .limit(1);

          sourceMeasurement = latestBefore;
          break;

        case 'closest':
          // Use closest measurement within maxDateDifference days
          const maxDays = config.maxDateDifference || 7;

          // Calculate date range
          const targetDateObj = new Date(targetDate);
          const minDate = new Date(targetDateObj);
          minDate.setDate(minDate.getDate() - maxDays);
          const maxDate = new Date(targetDateObj);
          maxDate.setDate(maxDate.getDate() + maxDays);

          // Get all measurements within range
          const candidateMeasurements = await dbOrTx
            .select()
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, userId),
                eq(measurements.metric, normalizedMetricCode),
                gte(measurements.date, minDate.toISOString().split('T')[0]),
                lte(measurements.date, maxDate.toISOString().split('T')[0]),
                eq(measurements.isVerified, true)
              )
            )
            .orderBy(measurements.date);

          // Find closest by calculating absolute date difference
          // When multiple measurements are equally close, pick the best value
          if (candidateMeasurements.length > 0) {
            const targetTime = targetDateObj.getTime();
            let closestMeasurement = candidateMeasurements[0];
            let closestDiff = Math.abs(
              new Date(closestMeasurement.date).getTime() - targetTime
            );

            for (const candidate of candidateMeasurements) {
              const diff = Math.abs(
                new Date(candidate.date).getTime() - targetTime
              );
              if (diff < closestDiff) {
                closestDiff = diff;
                closestMeasurement = candidate;
              } else if (diff === closestDiff) {
                // Same date distance - pick the better value
                const currentValue = parseFloat(closestMeasurement.value);
                const candidateValue = parseFloat(candidate.value);
                if (higherIsBetter ? candidateValue > currentValue : candidateValue < currentValue) {
                  closestMeasurement = candidate;
                }
              }
            }

            sourceMeasurement = closestMeasurement;
          }
          break;
      }

      if (!sourceMeasurement) {
        // Missing source measurement
        if (config.missingSourceBehavior === 'skip') {
          return null;
        } else {
          throw new Error(
            `Missing source measurement for metric: ${metricCode}`
          );
        }
      }

      sourceMeasurementsMap.set(metricCode, sourceMeasurement);
    }

    return sourceMeasurementsMap;
  }

  /**
   * Check if athlete has a direct (non-calculated) measurement for the derived metric.
   * Direct measurements take priority over calculated ones.
   */
  private async hasDirectMeasurement(
    userId: string,
    metricCode: string,
    date: string
  ): Promise<boolean> {
    const [directMeasurement] = await this.db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, userId),
          eq(measurements.metric, metricCode),
          eq(measurements.date, date),
          eq(measurements.isCalculated, false)
        )
      )
      .limit(1);

    return !!directMeasurement;
  }

  /**
   * Recalculate all derived metrics, optionally filtered by organization or metric code.
   * This is useful for bulk recalculation after fixing calculation logic.
   *
   * **Performance Optimization:**
   * - Uses transaction batching to prevent memory exhaustion and connection pool issues
   * - Default batch size: 500 measurements per transaction
   * - Event loop yielding between batches prevents blocking
   * - Estimated performance: 150K measurements: 30-60 min → 5-10 min with batching
   *
   * @param options - Filter options
   * @param options.organizationId - Only recalculate for this organization
   * @param options.metricCode - Only recalculate this specific derived metric
   * @param options.dryRun - If true, return what would be recalculated without making changes
   * @param options.batchSize - Number of measurements to process per transaction (default: 500)
   * @returns Summary of recalculation results
   */
  async recalculateAllDerivedMetrics(options?: {
    organizationId?: string;
    metricCode?: string;
    dryRun?: boolean;
    batchSize?: number;
  }): Promise<{
    total: number;
    recalculated: number;
    skipped: number;
    errors: string[];
  }> {
    const { organizationId, metricCode, dryRun = false, batchSize = 500 } = options || {};

    const result = {
      total: 0,
      recalculated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Find all active derived metrics (optionally filtered by code)
    const derivedMetricsQuery = this.db
      .select()
      .from(siteMetrics)
      .where(
        and(
          eq(siteMetrics.isDerived, true),
          eq(siteMetrics.isActive, true),
          metricCode ? eq(siteMetrics.code, metricCode) : undefined
        )
      );

    const derivedMetrics = await derivedMetricsQuery;

    if (derivedMetrics.length === 0) {
      return result;
    }

    // Build metric configs map for best value selection
    const allMetricCodes = new Set<string>();
    for (const dm of derivedMetrics) {
      if (dm.dependentMetrics) {
        for (const dep of dm.dependentMetrics) {
          allMetricCodes.add(dep.toUpperCase());
        }
      }
    }

    const metricConfigsArray = await this.db
      .select({
        code: siteMetrics.code,
        metricType: siteMetrics.metricType,
      })
      .from(siteMetrics)
      .where(sql`UPPER(${siteMetrics.code}) = ANY(ARRAY[${sql.join(
        Array.from(allMetricCodes).map(c => sql`${c}`),
        sql`, `
      )}]::text[])`);

    const metricConfigs = new Map<string, { higherIsBetter: boolean }>();
    for (const mc of metricConfigsArray) {
      metricConfigs.set(mc.code.toUpperCase(), {
        higherIsBetter: mc.metricType === 'higher_is_better',
      });
    }

    // For each derived metric, find all calculated measurements
    for (const derivedMetric of derivedMetrics) {
      // Build conditions for finding calculated measurements
      const conditions = [
        eq(measurements.metric, derivedMetric.code),
        eq(measurements.isCalculated, true),
      ];

      if (organizationId) {
        conditions.push(eq(measurements.organizationId, organizationId));
      }

      const calculatedMeasurements = await this.db
        .select({
          id: measurements.id,
          userId: measurements.userId,
          date: measurements.date,
          value: measurements.value,
        })
        .from(measurements)
        .where(and(...conditions));

      result.total += calculatedMeasurements.length;

      // Process in batches with transaction wrapping
      // This prevents memory exhaustion and connection pool issues for large datasets
      for (let i = 0; i < calculatedMeasurements.length; i += batchSize) {
        const batch = calculatedMeasurements.slice(i, i + batchSize);

        if (dryRun) {
          // In dry run mode, just count what would be recalculated
          result.recalculated += batch.length;
          continue;
        }

        // Process batch in a transaction for atomicity
        await this.db.transaction(async (tx) => {
          for (const calcMeasurement of batch) {
            try {
              // Find source measurements using the new best-value logic
              const sourceMeasurementsMap = await this.findSourceMeasurementsWithDb(
                tx,
                calcMeasurement.userId,
                derivedMetric.dependentMetrics || [],
                calcMeasurement.date,
                derivedMetric.calculationConfig || {
                  dateMatchStrategy: 'same_date',
                  missingSourceBehavior: 'skip',
                },
                metricConfigs
              );

              if (!sourceMeasurementsMap) {
                // Source measurements no longer available - skip
                result.skipped++;
                continue;
              }

              // Build source values for formula evaluation
              const sourceValues: Record<string, number> = {};
              const sourceMeasurementIds: string[] = [];

              for (const [code, sourceMeasurement] of sourceMeasurementsMap.entries()) {
                sourceValues[code.toLowerCase()] = parseFloat(sourceMeasurement.value);
                sourceMeasurementIds.push(sourceMeasurement.id);
              }

              // Evaluate the formula
              const calculatedValue = evaluateFormula(
                derivedMetric.formula || '',
                sourceValues
              );

              if (calculatedValue === null || !isFinite(calculatedValue)) {
                result.skipped++;
                continue;
              }

              // Update the measurement
              await tx
                .update(measurements)
                .set({
                  value: calculatedValue.toFixed(3),
                  calculatedFromMeasurementIds: sourceMeasurementIds,
                  calculationMetadata: {
                    formula: derivedMetric.formula || '',
                    sourceValues,
                    calculatedAt: new Date().toISOString(),
                    calculationVersion: CALCULATION_VERSION,
                    triggeredBy: { event: 'manual_recalculation' as const },
                  },
                })
                .where(eq(measurements.id, calcMeasurement.id));

              result.recalculated++;
            } catch (error) {
              const errorMsg = `Error recalculating ${derivedMetric.code} for user ${calcMeasurement.userId} on ${calcMeasurement.date}: ${error instanceof Error ? error.message : 'Unknown error'}`;
              result.errors.push(errorMsg);
              console.error(errorMsg);
            }
          }
        });

        // Yield to event loop between batches to prevent blocking
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return result;
  }
}
