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
  constructor(private db: typeof dbType) {}

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

      const metricConfigsMap = new Map<string, { higherIsBetter: boolean }>();
      if (allDependentMetrics.size > 0) {
        const metricCodes = Array.from(allDependentMetrics);
        const metricConfigs = await tx
          .select({
            code: siteMetrics.code,
            metricType: siteMetrics.metricType,
          })
          .from(siteMetrics)
          .where(
            sql`UPPER(${siteMetrics.code}) = ANY(ARRAY[${sql.join(metricCodes.map(code => sql`${code}`), sql`, `)}]::text[])`
          );

        for (const config of metricConfigs) {
          // Use uppercase key for consistent lookups with normalizedMetricCode
          metricConfigsMap.set(config.code.toUpperCase(), {
            higherIsBetter: config.metricType === 'higher_is_better',
          });
        }
      }

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

    const metricConfigsMap = new Map<string, { higherIsBetter: boolean }>();
    if (allDependentMetrics.size > 0) {
      const metricCodes = Array.from(allDependentMetrics);
      const metricConfigs = await dbOrTx
        .select({
          code: siteMetrics.code,
          metricType: siteMetrics.metricType,
        })
        .from(siteMetrics)
        .where(
          sql`UPPER(${siteMetrics.code}) = ANY(ARRAY[${sql.join(metricCodes.map(code => sql`${code}`), sql`, `)}]::text[])`
        );

      for (const config of metricConfigs) {
        // Use uppercase key for consistent lookups with normalizedMetricCode
        metricConfigsMap.set(config.code.toUpperCase(), {
          higherIsBetter: config.metricType === 'higher_is_better',
        });
      }
    }

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
   * @param options - Filter options
   * @param options.organizationId - Only recalculate for this organization
   * @param options.metricCode - Only recalculate this specific derived metric
   * @param options.dryRun - If true, return what would be recalculated without making changes
   * @returns Summary of recalculation results
   */
  async recalculateAllDerivedMetrics(options?: {
    organizationId?: string;
    metricCode?: string;
    dryRun?: boolean;
  }): Promise<{
    total: number;
    recalculated: number;
    skipped: number;
    errors: string[];
  }> {
    const { organizationId, metricCode, dryRun = false } = options || {};

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

      // Recalculate each measurement
      for (const calcMeasurement of calculatedMeasurements) {
        try {
          if (dryRun) {
            result.recalculated++;
            continue;
          }

          // Find source measurements using the new best-value logic
          const sourceMeasurementsMap = await this.findSourceMeasurementsWithDb(
            this.db,
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
          await this.db
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
    }

    return result;
  }
}
