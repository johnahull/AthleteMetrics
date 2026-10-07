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
  customOrgMetrics,
  userOrganizations,
  users,
  type Measurement,
  type InsertMeasurement,
  type SiteMetric,
  type CustomOrgMetric,
  events,
} from '@shared/schema';
import { eq, and, gte, lte, sql, or, desc, asc, inArray } from 'drizzle-orm';
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
import type { DerivedCalcFailure } from './derived-total-warnings';

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
   * @param organizationId - Optional organization ID to also check custom org metrics
   * @returns Map of uppercase metric codes to { higherIsBetter: boolean }
   */
  async get(
    metricCodes: string[],
    db: typeof dbType | DbTransaction,
    organizationId?: string
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
      // First, fetch from site metrics
      const siteMetricConfigs = await db
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

      // Update cache and result from site metrics
      const foundCodes = new Set<string>();
      for (const config of siteMetricConfigs) {
        const upperCode = config.code.toUpperCase();
        const higherIsBetter = config.metricType === 'higher_is_better';

        // Store in cache with timestamp
        this.cache.set(upperCode, {
          higherIsBetter,
          cachedAt: now,
        });

        // Add to result
        result.set(upperCode, { higherIsBetter });
        foundCodes.add(upperCode);
      }

      // If organizationId is provided, also check custom org metrics for remaining codes
      if (organizationId) {
        const stillMissing = missing.filter(code => !foundCodes.has(code));
        if (stillMissing.length > 0) {
          const customMetricConfigs = await db
            .select({
              code: customOrgMetrics.code,
              metricType: customOrgMetrics.metricType,
            })
            .from(customOrgMetrics)
            .where(
              and(
                eq(customOrgMetrics.organizationId, organizationId),
                eq(customOrgMetrics.isActive, true),
                sql`UPPER(${customOrgMetrics.code}) = ANY(ARRAY[${sql.join(
                  stillMissing.map(code => sql`${code}`),
                  sql`, `
                )}]::text[])`
              )
            );

          // Update cache and result from custom org metrics
          for (const config of customMetricConfigs) {
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
  // Organization of the measurement that triggered the recalculation. A missing total
  // is only created for site derived metrics and this org's custom derived metrics
  // (as in processNewMeasurement); other orgs' existing totals are still recalculated.
  organizationId?: string | null;
}

/**
 * Current version of the calculation algorithm.
 * Increment this when making changes to calculation logic.
 */
const CALCULATION_VERSION = '1.0.0';

export class DerivedMetricCalculator {
  private metricConfigCache: MetricConfigCache;
  // Per-derived-metric failures that were logged and swallowed (so one failing total does
  // not block the others). Callers read them via getFailures() to warn the client (#526).
  private failures: DerivedCalcFailure[] = [];

  /** Failures swallowed by processNewMeasurement / recalculateForAthlete on this instance. */
  getFailures(): DerivedCalcFailure[] {
    return [...this.failures];
  }

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
      // Find all active derived site metrics
      const siteDerivedMetrics = await tx
        .select()
        .from(siteMetrics)
        .where(
          and(
            eq(siteMetrics.isDerived, true),
            eq(siteMetrics.isActive, true)
          )
        );

      // Also find active derived custom org metrics for the measurement's organization
      let customDerivedMetrics: CustomOrgMetric[] = [];
      if (measurement.organizationId) {
        customDerivedMetrics = await tx
          .select()
          .from(customOrgMetrics)
          .where(
            and(
              eq(customOrgMetrics.organizationId, measurement.organizationId),
              eq(customOrgMetrics.isDerived, true),
              eq(customOrgMetrics.isActive, true)
            )
          );
      }

      // Filter to only those that depend on this measurement's metric
      // Case-insensitive comparison to handle mixed-case dependent_metrics config
      const measurementMetricUpper = measurement.metric.toUpperCase();

      // Filter site derived metrics
      const dependentSiteDerivedMetrics = siteDerivedMetrics.filter(
        (metric: SiteMetric) =>
          metric.dependentMetrics &&
          metric.dependentMetrics.some(dep => dep.toUpperCase() === measurementMetricUpper)
      );

      // Filter custom org derived metrics
      const dependentCustomDerivedMetrics = customDerivedMetrics.filter(
        (metric: CustomOrgMetric) =>
          metric.dependentMetrics &&
          metric.dependentMetrics.some(dep => dep.toUpperCase() === measurementMetricUpper)
      );

      // Combine both lists - use a unified type with common fields
      type DerivedMetricInfo = {
        code: string;
        formula: string | null;
        dependentMetrics: string[] | null;
        calculationConfig: { dateMatchStrategy: 'same_date' | 'latest_before' | 'closest'; maxDateDifference?: number; missingSourceBehavior: 'skip' | 'error'; sourceSelection?: 'latest_event' } | null;
        unit: string | null;
        isCustomOrg: boolean;
      };

      const allDependentDerivedMetrics: DerivedMetricInfo[] = [
        ...dependentSiteDerivedMetrics.map(m => ({
          code: m.code,
          formula: m.formula,
          dependentMetrics: m.dependentMetrics,
          calculationConfig: m.calculationConfig,
          unit: m.unit,
          isCustomOrg: false,
        })),
        ...dependentCustomDerivedMetrics.map(m => ({
          code: m.code,
          formula: m.formula,
          dependentMetrics: m.dependentMetrics,
          calculationConfig: m.calculationConfig,
          unit: m.unit,
          isCustomOrg: true,
        })),
      ];

      if (allDependentDerivedMetrics.length === 0) {
        return [];
      }

      const calculatedMeasurements: Measurement[] = [];

      // Fetch metric configurations for all dependent metrics to enable best value selection
      // Build a Map of metric code -> { higherIsBetter }
      const allDependentMetrics = new Set<string>();
      for (const derivedMetric of allDependentDerivedMetrics) {
        for (const depMetric of (derivedMetric.dependentMetrics || [])) {
          allDependentMetrics.add(depMetric.toUpperCase());
        }
      }

      // Fetch metric configurations for best value selection (including custom org metrics)
      const metricCodes = Array.from(allDependentMetrics);
      const metricConfigsMap = await this.fetchMetricConfigs(tx, metricCodes, measurement.organizationId || undefined);

      // Process each derived metric (both site and custom org)
      // NOTE: Sequential processing pattern (potential N+1 queries)
      // For typical use cases (1-2 derived metrics per source measurement), this performs well.
      // If scaling issues arise (many derived metrics triggered per source measurement),
      // consider batch-fetching all source measurements upfront or implementing a calculation queue.
      // Current implementation prioritizes code clarity and transaction safety over premature optimization.
      // Sorted so concurrent calculations take the per-metric advisory locks in the same order
      allDependentDerivedMetrics.sort((a, b) => a.code.localeCompare(b.code));
      for (const derivedMetric of allDependentDerivedMetrics) {
        try {
          const createdMeasurement = await this.computeAndUpsertDerived(
            tx,
            derivedMetric,
            measurement.userId,
            measurement.date,
            metricConfigsMap,
            triggerContext || { event: 'measurement_insert' },
            measurement
          );
          if (createdMeasurement) {
            calculatedMeasurements.push(createdMeasurement);
          }
        } catch (error) {
          // Log error but continue processing other derived metrics
          console.error(`Error calculating derived metric ${derivedMetric.code}:`, {
            userId: measurement.userId,
            metric: derivedMetric.code,
            date: measurement.date,
            error,
          });
          this.failures.push({ metric: derivedMetric.code, date: measurement.date, userId: measurement.userId });
        }
      }

      return calculatedMeasurements;
    });
  }

  /**
   * Calculate one derived metric for (userId, date) and create or update its
   * calculated measurement. Shared by processNewMeasurement and by
   * recalculateForAthlete when no calculated row exists yet for that date (e.g. a
   * source moved onto the date, or the remaining same-date sources became the set).
   *
   * Concurrency: takes a transaction-scoped advisory lock on
   * (athlete, derived metric, date) so concurrent calculations serialize and the
   * second one updates the row the first one inserted instead of duplicating it.
   * Duplicate calculated rows left over from before the lock existed are collapsed
   * here: the most recently created row (ties broken by id) is updated and the
   * others are deleted, so one calculated row remains per (athlete, metric, date).
   *
   * @param contextMeasurement - Source measurement whose team/org/season context a
   *   newly created calculated row inherits; defaults to the most recently created
   *   source measurement used by the formula.
   * @param deleteWhenUncomputable - Recalculation mode (recalculateForAthlete): all
   *   existing calculated rows are deleted when a direct measurement exists for the
   *   date, its sources are missing, or the formula result is invalid.
   * @param allowCreate - When false, only an existing calculated row is updated.
   * @returns the created/updated calculated measurement, or null when it cannot be
   *   calculated (direct measurement exists, sources missing, invalid result)
   */
  private async computeAndUpsertDerived(
    tx: DbTransaction,
    derivedMetric: {
      code: string;
      formula: string | null;
      dependentMetrics: string[] | null;
      calculationConfig: { dateMatchStrategy: 'same_date' | 'latest_before' | 'closest'; maxDateDifference?: number; missingSourceBehavior: 'skip' | 'error'; sourceSelection?: 'latest_event' } | null;
      unit: string | null;
    },
    userId: string,
    date: string,
    metricConfigsMap: Map<string, { higherIsBetter: boolean }>,
    triggerContext: TriggerContext | undefined,
    contextMeasurement?: Measurement,
    deleteWhenUncomputable = false,
    allowCreate = true
  ): Promise<Measurement | null> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`derived:${userId}:${derivedMetric.code}:${date}`}, 0))`
    );

    // Check if calculated measurement already exists (update scenario). Newest first:
    // duplicates can predate the advisory lock, and the update below keeps the most
    // recently created row (ties broken by id) and deletes the rest.
    const existingCalculated = await tx
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, userId),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.date, date),
          eq(measurements.isCalculated, true)
        )
      )
      .orderBy(desc(measurements.createdAt), desc(measurements.id));

    if (!allowCreate && existingCalculated.length === 0) {
      return null;
    }

    const deleteExisting = async () => {
      if (deleteWhenUncomputable && existingCalculated.length > 0) {
        await tx.delete(measurements).where(
          inArray(measurements.id, existingCalculated.map(m => m.id))
        );
      }
      return null;
    };

    // Check if athlete already has a direct (non-calculated) measurement for this derived metric on this date
    const [directMeasurement] = await tx
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, userId),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.date, date),
          eq(measurements.isCalculated, false)
        )
      )
      .limit(1);

    if (directMeasurement) {
      // Direct measurements take priority - skip calculation; when recalculating,
      // also remove a calculated row that coexists with the direct one.
      return deleteExisting();
    }

    // Find source measurements for the formula
    const sourceMeasurementsMap = await this.findSourceMeasurementsInTransaction(
      tx,
      userId,
      derivedMetric.dependentMetrics || [],
      date,
      derivedMetric.calculationConfig || {
        dateMatchStrategy: 'same_date',
        missingSourceBehavior: 'skip',
      },
      metricConfigsMap
    );

    if (!sourceMeasurementsMap) {
      // Missing source measurements - skip based on missingSourceBehavior.
      // With latest_event selection the newest event is incomplete, so a total
      // calculated from an older event is stale: remove it in either mode.
      if (derivedMetric.calculationConfig?.sourceSelection === 'latest_event' && existingCalculated.length > 0) {
        await tx.delete(measurements).where(
          inArray(measurements.id, existingCalculated.map(m => m.id))
        );
        return null;
      }
      return deleteExisting();
    }
    if (sourceMeasurementsMap.size === 0) {
      // An empty map (no dependent metrics) has no source to inherit context from.
      return null;
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

    // Formula evaluation failed, or invalid result (Infinity, NaN)
    if (calculatedValue === null || !isFinite(calculatedValue)) {
      return deleteExisting();
    }

    // Get user info for age calculation
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return null;
    }

    // Calculate age at measurement date
    const measurementDate = new Date(date);
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

    const calculationMetadata = {
      formula: derivedMetric.formula || '',
      sourceValues,
      calculatedAt: new Date().toISOString(),
      calculationVersion: CALCULATION_VERSION,
      triggeredBy: triggerContext || { event: 'measurement_insert' as const },
    };

    const newestSource = Array.from(sourceMeasurementsMap.values()).reduce((latest, m) =>
      new Date(m.createdAt).getTime() > new Date(latest.createdAt).getTime() ? m : latest
    );
    // latest_event: the total belongs to the chosen event's sources (possibly another
    // org than the measurement that triggered the calculation), so it takes their context.
    const isLatestEvent = derivedMetric.calculationConfig?.sourceSelection === 'latest_event';
    const context = isLatestEvent ? newestSource : contextMeasurement ?? newestSource;

    if (existingCalculated.length > 0) {
      // Update the survivor (newest calculated row) and delete any duplicates
      const [survivor, ...duplicates] = existingCalculated;
      if (duplicates.length > 0) {
        await tx.delete(measurements).where(
          inArray(measurements.id, duplicates.map(m => m.id))
        );
      }
      const [updated] = await tx
        .update(measurements)
        .set({
          value: calculatedValue.toFixed(3),
          calculatedFromMeasurementIds: sourceMeasurementIds,
          calculationMetadata,
          // The chosen event may have changed: refresh the context columns too
          ...(isLatestEvent
            ? {
                submittedBy: context.submittedBy,
                isVerified: context.isVerified,
                teamId: context.teamId,
                season: context.season,
                teamContextAuto: context.teamContextAuto,
                teamNameSnapshot: context.teamNameSnapshot,
                organizationId: context.organizationId,
              }
            : {}),
        })
        .where(eq(measurements.id, survivor.id))
        .returning();

      return updated;
    }

    // Create new calculated measurement
    const [newMeasurement] = await tx
      .insert(measurements)
      .values({
        userId,
        submittedBy: context.submittedBy,
        date,
        metric: derivedMetric.code,
        value: calculatedValue.toFixed(3),
        units: derivedMetric.unit || '',
        age,
        isVerified: context.isVerified,
        teamId: context.teamId,
        season: context.season,
        teamContextAuto: context.teamContextAuto,
        teamNameSnapshot: context.teamNameSnapshot,
        organizationId: context.organizationId,
        isCalculated: true,
        calculatedFromMeasurementIds: sourceMeasurementIds,
        calculationMetadata,
      })
      .returning();

    return newMeasurement;
  }

  /**
   * Fetch metric configurations for dependent metrics to enable best value selection.
   * Returns a map of metric codes (uppercase) to their metricType configuration.
   *
   * Uses MetricConfigCache for performance optimization during bulk operations.
   *
   * @param dbOrTx - Database connection or transaction
   * @param metricCodes - Array of metric codes to fetch configs for (will be normalized to uppercase)
   * @param organizationId - Optional organization ID to also check custom org metrics
   * @returns Map of uppercase metric codes to { higherIsBetter: boolean }
   */
  private async fetchMetricConfigs(
    dbOrTx: typeof dbType | DbTransaction,
    metricCodes: string[],
    organizationId?: string
  ): Promise<Map<string, { higherIsBetter: boolean }>> {
    if (metricCodes.length === 0) {
      return new Map<string, { higherIsBetter: boolean }>();
    }

    // Use cache for performance optimization (with org support)
    return await this.metricConfigCache.get(metricCodes, dbOrTx, organizationId);
  }

  /**
   * Recalculate derived measurements for an athlete when source changes.
   * Called after measurement update or delete.
   *
   * @param userId - The athlete's user ID
   * @param metricCode - The source metric code that changed, or several codes: each
   *   derived metric depending on any of them is then recalculated once
   * @param date - Optional date filter (if omitted, recalculates all dates)
   * @param options - Optional configuration for transaction and audit trail
   * @param options.useTransaction - If true, wraps operation in a transaction (default: false).
   *   Each derived (metric, date) is still written in its own nested transaction, which
   *   inside the outer one is a savepoint; the per-(athlete, metric, date) advisory locks
   *   it takes are transaction-scoped, so they are then held until the OUTER transaction
   *   commits rather than released per metric. No caller uses this mode today.
   * @param options.triggerContext - Context for audit trail
   */
  async recalculateForAthlete(
    userId: string,
    metricCode: string | string[],
    date?: string,
    options?: RecalculateOptions
  ): Promise<void> {
    const { useTransaction = false, triggerContext, organizationId } = options || {};

    if (useTransaction) {
      await this.db.transaction(async (tx) => {
        await this.recalculateForAthleteInternal(tx, userId, metricCode, date, triggerContext, organizationId);
      });
    } else {
      await this.recalculateForAthleteInternal(this.db, userId, metricCode, date, triggerContext, organizationId);
    }
  }

  /**
   * Internal implementation of recalculateForAthlete that accepts a db or transaction.
   * This allows the same logic to run inside or outside a transaction.
   */
  private async recalculateForAthleteInternal(
    dbOrTx: typeof dbType | DbTransaction,
    userId: string,
    metricCode: string | string[],
    date?: string,
    triggerContext?: TriggerContext,
    triggeringOrganizationId?: string | null
  ): Promise<void> {
    // Find all derived site metrics that depend on this source metric
    const siteDerivedMetrics = await dbOrTx
      .select()
      .from(siteMetrics)
      .where(
        and(
          eq(siteMetrics.isDerived, true),
          eq(siteMetrics.isActive, true)
        )
      );

    // Find the user's organizations to also check custom org derived metrics
    const userOrgRecords = await dbOrTx
      .select({ organizationId: userOrganizations.organizationId })
      .from(userOrganizations)
      .where(eq(userOrganizations.userId, userId));

    const userOrgIds = userOrgRecords.map(r => r.organizationId);

    // Find custom org derived metrics for all user's organizations
    let customDerivedMetrics: CustomOrgMetric[] = [];
    if (userOrgIds.length > 0) {
      customDerivedMetrics = await dbOrTx
        .select()
        .from(customOrgMetrics)
        .where(
          and(
            sql`${customOrgMetrics.organizationId} = ANY(ARRAY[${sql.join(
              userOrgIds.map(id => sql`${id}`),
              sql`, `
            )}]::text[])`,
            eq(customOrgMetrics.isDerived, true),
            eq(customOrgMetrics.isActive, true)
          )
        );
    }

    // Case-insensitive comparison to handle mixed-case dependent_metrics config
    const metricCodesUpper = new Set((Array.isArray(metricCode) ? metricCode : [metricCode]).map(c => c.toUpperCase()));

    // Filter site derived metrics
    const dependentSiteDerivedMetrics = siteDerivedMetrics.filter(
      (metric: SiteMetric) =>
        metric.dependentMetrics &&
        metric.dependentMetrics.some(dep => metricCodesUpper.has(dep.toUpperCase()))
    );

    // Filter custom org derived metrics
    const dependentCustomDerivedMetrics = customDerivedMetrics.filter(
      (metric: CustomOrgMetric) =>
        metric.dependentMetrics &&
        metric.dependentMetrics.some(dep => metricCodesUpper.has(dep.toUpperCase()))
    );

    // Combine both lists - use a unified type with common fields
    type DerivedMetricInfo = {
      code: string;
      formula: string | null;
      dependentMetrics: string[] | null;
      calculationConfig: { dateMatchStrategy: 'same_date' | 'latest_before' | 'closest'; maxDateDifference?: number; missingSourceBehavior: 'skip' | 'error'; sourceSelection?: 'latest_event' } | null;
      unit: string | null;
      organizationId?: string;
    };

    const allDependentDerivedMetrics: DerivedMetricInfo[] = [
      ...dependentSiteDerivedMetrics.map(m => ({
        code: m.code,
        formula: m.formula,
        dependentMetrics: m.dependentMetrics,
        calculationConfig: m.calculationConfig,
        unit: m.unit,
        organizationId: undefined,
      })),
      ...dependentCustomDerivedMetrics.map(m => ({
        code: m.code,
        formula: m.formula,
        dependentMetrics: m.dependentMetrics,
        calculationConfig: m.calculationConfig,
        unit: m.unit,
        organizationId: m.organizationId,
      })),
    ];

    if (allDependentDerivedMetrics.length === 0) {
      return;
    }

    // Fetch metric configurations for all dependent metrics to enable best value selection
    const allDependentMetrics = new Set<string>();
    for (const derivedMetric of allDependentDerivedMetrics) {
      for (const depMetric of (derivedMetric.dependentMetrics || [])) {
        allDependentMetrics.add(depMetric.toUpperCase());
      }
    }

    // Fetch metric configurations for best value selection
    // Pass the first org ID for custom metric config lookup (can be improved to pass all)
    const metricCodes = Array.from(allDependentMetrics);
    const metricConfigsMap = await this.fetchMetricConfigs(dbOrTx, metricCodes, userOrgIds[0]);

    // For each derived metric, recalculate or delete calculated measurements.
    // Sorted so concurrent calculations take the per-metric advisory locks in the same order.
    allDependentDerivedMetrics.sort((a, b) => a.code.localeCompare(b.code));
    for (const derivedMetric of allDependentDerivedMetrics) {
      try {
        // Dates to recalculate: the given date (which also creates a total that does
        // not exist yet, e.g. a source was moved onto it, or the remaining same-date
        // sources now form a complete set), else every date with a calculated row.
        let dates: string[];
        if (date) {
          dates = [date];
        } else {
          const calculatedMeasurements = await dbOrTx
            .select({ date: measurements.date })
            .from(measurements)
            .where(
              and(
                eq(measurements.userId, userId),
                eq(measurements.metric, derivedMetric.code),
                eq(measurements.isCalculated, true)
              )
            );
          dates = Array.from(new Set(calculatedMeasurements.map(m => m.date)));
        }

        // computeAndUpsertDerived is the single write path: it reads the sources and
        // writes (or deletes) the total under the per-(athlete, metric, date) advisory
        // lock, so concurrent source edits cannot leave a stale total.
        const allowCreate =
          !derivedMetric.organizationId || derivedMetric.organizationId === triggeringOrganizationId;
        for (const targetDate of dates) {
          await dbOrTx.transaction((tx) =>
            this.computeAndUpsertDerived(
              tx, derivedMetric, userId, targetDate, metricConfigsMap, triggerContext, undefined, true, allowCreate
            )
          );
        }
      } catch (error) {
        console.error(`Error recalculating derived metric ${derivedMetric.code}:`, {
          userId,
          metric: derivedMetric.code,
          date,
          error,
        });
        this.failures.push({ metric: derivedMetric.code, date: date ?? null, userId });
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
      sourceSelection?: 'latest_event';
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
      sourceSelection?: 'latest_event';
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
      sourceSelection?: 'latest_event';
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
      sourceSelection?: 'latest_event';
    },
    metricConfigs?: Map<string, { higherIsBetter: boolean }>
  ): Promise<Map<string, Measurement> | null> {
    return this.findSourceMeasurementsImpl(this.db, userId, dependentMetrics, targetDate, config, metricConfigs);
  }

  /**
   * 'latest_event' source selection (AM-FEAT-015 decision 11), same_date only.
   *
   * Considers the athlete's VERIFIED measurements of the dependent metrics on `targetDate`
   * (unverified rows are ignored before grouping, so "latest event" means the latest event
   * that has verified scores), groups them by event (eventId; measurements without an event
   * form one group) and picks the single most recent group by event chronology:
   *   1. any event outranks the no-event group;
   *   2. events.start_date (full timestamp; the event date snapshot if the event row is gone);
   *   3. events.created_at; 4. newest measurement created_at; 5. eventId.
   * Entry order therefore never decides between two events. ALL dependent metrics must come
   * from that one group: scores are never mixed across events, and an older complete event
   * is never used while the latest group is incomplete (the caller then removes the total).
   */
  private async findLatestEventSources(
    dbOrTx: typeof dbType | DbTransaction,
    userId: string,
    dependentMetrics: string[],
    targetDate: string,
    config: { missingSourceBehavior: 'skip' | 'error' }
  ): Promise<Map<string, Measurement> | null> {
    const codes = dependentMetrics.map((c) => c.toUpperCase());
    const candidates = await dbOrTx
      .select({
        measurement: measurements,
        eventStartDate: events.startDate,
        eventCreatedAt: events.createdAt,
      })
      .from(measurements)
      .leftJoin(events, eq(measurements.eventId, events.id))
      .where(
        and(
          eq(measurements.userId, userId),
          inArray(measurements.metric, codes),
          eq(measurements.date, targetDate),
          // Intentional: only verified scores count toward a total. Failure mode: a fully
          // entered set that contains an unverified score yields NO total, silently (the
          // incomplete-group rule above applies, and an existing total is removed). In
          // practice MQ scores are always verified: coach/org_admin/site_admin writes are
          // auto-verified and athletes cannot enter MQ scores. A direct DB write, backfill
          // or new write path that stores unverified MQ scores would hit this.
          eq(measurements.isVerified, true)
        )
      );

    type Group = { eventId: string | null; rows: Measurement[]; rank: number[] };
    const groups = new Map<string, Group>();
    for (const c of candidates) {
      const m = c.measurement;
      const key = m.eventId ?? '';
      let group = groups.get(key);
      if (!group) {
        const start = c.eventStartDate
          ? new Date(c.eventStartDate).getTime()
          : m.eventDateSnapshot
            ? new Date(m.eventDateSnapshot).getTime()
            : 0;
        group = {
          eventId: m.eventId,
          rows: [],
          rank: [
            m.eventId ? 1 : 0,
            start,
            c.eventCreatedAt ? new Date(c.eventCreatedAt).getTime() : 0,
            0,
          ],
        };
        groups.set(key, group);
      }
      group.rows.push(m);
      group.rank[3] = Math.max(group.rank[3], new Date(m.createdAt).getTime());
    }

    const compare = (a: Group, b: Group): number => {
      for (let i = 0; i < a.rank.length; i++) {
        if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
      }
      return (a.eventId ?? '').localeCompare(b.eventId ?? '');
    };

    let latestGroup: Group | undefined;
    for (const group of groups.values()) {
      if (!latestGroup || compare(group, latestGroup) > 0) latestGroup = group;
    }
    const latest = latestGroup?.rows;
    const newest = (list: Measurement[]) =>
      list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));

    const result = new Map<string, Measurement>();
    for (let i = 0; i < dependentMetrics.length; i++) {
      const matching = (latest ?? []).filter((m) => m.metric === codes[i]);
      if (matching.length === 0) {
        if (config.missingSourceBehavior === 'skip') return null;
        throw new Error(`Missing source measurement for metric: ${dependentMetrics[i]}`);
      }
      result.set(dependentMetrics[i], newest(matching));
    }
    return result;
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
      sourceSelection?: 'latest_event';
    },
    metricConfigs?: Map<string, { higherIsBetter: boolean }>
  ): Promise<Map<string, Measurement> | null> {
    if (config.sourceSelection === 'latest_event' && config.dateMatchStrategy === 'same_date') {
      return this.findLatestEventSources(dbOrTx, userId, dependentMetrics, targetDate, config);
    }

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
   * Detect circular dependencies between derived metrics.
   * A circular dependency exists when metric A depends on metric B AND metric B depends on metric A.
   *
   * For example:
   * - APPROACH_REACH depends on APPROACH_JUMP
   * - APPROACH_JUMP depends on APPROACH_REACH
   *
   * @param derivedMetrics - Array of derived metric definitions
   * @returns Map where key is metric code and value is the metric it's mutually dependent with
   */
  private detectCircularDependencies(derivedMetrics: SiteMetric[]): Map<string, string> {
    const circularPairs = new Map<string, string>();

    for (const metricA of derivedMetrics) {
      for (const metricB of derivedMetrics) {
        if (metricA.code === metricB.code) continue;

        // Check if A depends on B AND B depends on A
        const aDependsOnB = metricA.dependentMetrics?.some(
          dep => dep.toUpperCase() === metricB.code.toUpperCase()
        );
        const bDependsOnA = metricB.dependentMetrics?.some(
          dep => dep.toUpperCase() === metricA.code.toUpperCase()
        );

        if (aDependsOnB && bDependsOnA) {
          // Only add if not already tracked (to avoid duplicates)
          if (!circularPairs.has(metricA.code)) {
            circularPairs.set(metricA.code, metricB.code);
            circularPairs.set(metricB.code, metricA.code);
          }
        }
      }
    }

    return circularPairs;
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
   * **Circular Dependency Handling:**
   * - Detects metrics that mutually depend on each other (e.g., APPROACH_JUMP ↔ APPROACH_REACH)
   * - Only calculates the metric if the user has a DIRECT measurement for the partner metric
   * - Prevents redundant calculated entries for circular pairs
   *
   * @param options - Filter options
   * @param options.organizationId - Only recalculate for this organization
   * @param options.metricCode - Only recalculate this specific derived metric
   * @param options.dryRun - If true, return what would be recalculated without making changes
   * @param options.batchSize - Number of measurements to process per transaction (default: 500)
   * @param options.createMissing - If true, also create derived measurements that don't exist yet (default: true)
   * @returns Summary of recalculation results
   */
  async recalculateAllDerivedMetrics(options?: {
    organizationId?: string;
    metricCode?: string;
    dryRun?: boolean;
    batchSize?: number;
    createMissing?: boolean;
  }): Promise<{
    total: number;
    recalculated: number;
    created: number;
    skipped: number;
    errors: string[];
  }> {
    const { organizationId, metricCode, dryRun = false, batchSize = 500, createMissing = true } = options || {};

    const result = {
      total: 0,
      recalculated: 0,
      created: 0,
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

    // Detect circular dependencies (e.g., APPROACH_JUMP ↔ APPROACH_REACH)
    // We need to fetch ALL derived metrics for circular detection, not just the filtered ones
    const allDerivedMetrics = metricCode
      ? await this.db.select().from(siteMetrics).where(and(eq(siteMetrics.isDerived, true), eq(siteMetrics.isActive, true)))
      : derivedMetrics;
    const circularPairs = this.detectCircularDependencies(allDerivedMetrics);

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
              // Check for circular dependency - skip if partner metric doesn't have a direct entry
              const circularPartner = circularPairs.get(derivedMetric.code);
              if (circularPartner) {
                // Check if user has a direct measurement for the partner metric on this date
                const [directPartner] = await tx
                  .select()
                  .from(measurements)
                  .where(
                    and(
                      eq(measurements.userId, calcMeasurement.userId),
                      eq(measurements.metric, circularPartner),
                      eq(measurements.date, calcMeasurement.date),
                      eq(measurements.isCalculated, false)
                    )
                  )
                  .limit(1);

                // If no direct partner exists, skip - let the partner metric handle this
                if (!directPartner) {
                  result.skipped++;
                  continue;
                }
              }

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

    // Phase 2: Create missing derived measurements (if createMissing is enabled)
    if (createMissing) {
      for (const derivedMetric of derivedMetrics) {
        // Skip if metricCode filter is specified and doesn't match
        if (metricCode && derivedMetric.code !== metricCode) {
          continue;
        }

        if (!derivedMetric.dependentMetrics || derivedMetric.dependentMetrics.length === 0) {
          continue;
        }

        // Get the primary dependent metric (first one) to find potential source data
        // Normalize to uppercase to match database metric codes
        const primaryDepMetric = derivedMetric.dependentMetrics[0].toUpperCase();

        // Find all unique (userId, date) combinations with the primary source metric
        // that don't already have a derived measurement
        const sourceConditions = [
          eq(measurements.metric, primaryDepMetric),
          eq(measurements.isVerified, true),
          eq(measurements.isCalculated, false), // Only use non-calculated source data
        ];

        if (organizationId) {
          sourceConditions.push(eq(measurements.organizationId, organizationId));
        }

        // Get distinct (userId, date, organizationId) combinations with source data
        const potentialSources = await this.db
          .selectDistinct({
            userId: measurements.userId,
            date: measurements.date,
            organizationId: measurements.organizationId,
          })
          .from(measurements)
          .where(and(...sourceConditions));

        if (potentialSources.length === 0) {
          continue;
        }

        // Find existing derived measurements to exclude
        const existingConditions = [
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true),
        ];

        if (organizationId) {
          existingConditions.push(eq(measurements.organizationId, organizationId));
        }

        const existingDerived = await this.db
          .select({
            userId: measurements.userId,
            date: measurements.date,
            organizationId: measurements.organizationId,
          })
          .from(measurements)
          .where(and(...existingConditions));

        // Create a Set of existing (userId, date, organizationId) combinations for fast lookup
        // Including organizationId prevents cross-org matching issues
        const existingSet = new Set(
          existingDerived.map(e => `${e.userId}|${e.date}|${e.organizationId}`)
        );

        // Filter to only sources that don't have a derived measurement yet
        const missingSources = potentialSources.filter(
          s => !existingSet.has(`${s.userId}|${s.date}|${s.organizationId}`)
        );

        if (missingSources.length === 0) {
          continue;
        }

        // Process in batches
        for (let i = 0; i < missingSources.length; i += batchSize) {
          const batch = missingSources.slice(i, i + batchSize);

          if (dryRun) {
            // In dry run mode, just count what would be created
            result.created += batch.length;
            result.total += batch.length;
            continue;
          }

          // Process batch in a transaction
          await this.db.transaction(async (tx) => {
            for (const source of batch) {
              try {
                // Check for circular dependency - skip if partner metric doesn't have a direct entry
                const circularPartner = circularPairs.get(derivedMetric.code);
                if (circularPartner) {
                  // Check if user has a direct measurement for the partner metric on this date
                  const [directPartner] = await tx
                    .select()
                    .from(measurements)
                    .where(
                      and(
                        eq(measurements.userId, source.userId),
                        eq(measurements.metric, circularPartner),
                        eq(measurements.date, source.date),
                        eq(measurements.isCalculated, false)
                      )
                    )
                    .limit(1);

                  // If no direct partner exists, skip - let the partner metric handle this
                  if (!directPartner) {
                    result.skipped++;
                    result.total++;
                    continue;
                  }
                }

                // Find all required source measurements for this (user, date)
                const sourceMeasurementsMap = await this.findSourceMeasurementsWithDb(
                  tx,
                  source.userId,
                  derivedMetric.dependentMetrics || [],
                  source.date,
                  derivedMetric.calculationConfig || {
                    dateMatchStrategy: 'same_date',
                    missingSourceBehavior: 'skip',
                  },
                  metricConfigs
                );

                if (!sourceMeasurementsMap) {
                  // Not all required source measurements are available
                  result.skipped++;
                  result.total++;
                  continue;
                }

                // Build source values for formula evaluation
                const sourceValues: Record<string, number> = {};
                const sourceMeasurementIds: string[] = [];
                let referenceMeasurement: Measurement | undefined;

                for (const [code, sourceMeasurement] of sourceMeasurementsMap.entries()) {
                  sourceValues[code.toLowerCase()] = parseFloat(sourceMeasurement.value);
                  sourceMeasurementIds.push(sourceMeasurement.id);
                  // Use the first source measurement as reference for metadata
                  if (!referenceMeasurement) {
                    referenceMeasurement = sourceMeasurement;
                  }
                }

                if (!referenceMeasurement) {
                  result.skipped++;
                  result.total++;
                  continue;
                }

                // Evaluate the formula
                const calculatedValue = evaluateFormula(
                  derivedMetric.formula || '',
                  sourceValues
                );

                if (calculatedValue === null || !isFinite(calculatedValue)) {
                  result.skipped++;
                  result.total++;
                  continue;
                }

                // Calculate age from user's birth date if available
                let age: number = 0;
                const [userRecord] = await tx
                  .select({ birthDate: users.birthDate })
                  .from(users)
                  .where(eq(users.id, source.userId))
                  .limit(1);

                if (userRecord?.birthDate) {
                  const birthDate = new Date(userRecord.birthDate);
                  const measurementDate = new Date(source.date);
                  age = measurementDate.getFullYear() - birthDate.getFullYear();
                  // Adjust if birthday hasn't occurred yet in measurement year
                  if (measurementDate < new Date(measurementDate.getFullYear(), birthDate.getMonth(), birthDate.getDate())) {
                    age--;
                  }
                }

                // Create the derived measurement using reference measurement for metadata
                await tx.insert(measurements).values({
                  userId: source.userId,
                  submittedBy: referenceMeasurement.submittedBy,
                  organizationId: source.organizationId,
                  metric: derivedMetric.code,
                  value: calculatedValue.toFixed(3),
                  units: derivedMetric.unit || '',
                  age,
                  date: source.date,
                  isVerified: true,
                  isCalculated: true,
                  teamId: referenceMeasurement.teamId,
                  season: referenceMeasurement.season,
                  teamContextAuto: referenceMeasurement.teamContextAuto,
                  teamNameSnapshot: referenceMeasurement.teamNameSnapshot,
                  calculatedFromMeasurementIds: sourceMeasurementIds,
                  calculationMetadata: {
                    formula: derivedMetric.formula || '',
                    sourceValues,
                    calculatedAt: new Date().toISOString(),
                    calculationVersion: CALCULATION_VERSION,
                    triggeredBy: { event: 'manual_recalculation' as const },
                  },
                });

                result.created++;
                result.total++;
              } catch (error) {
                const errorMsg = `Error creating ${derivedMetric.code} for user ${source.userId} on ${source.date}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                result.errors.push(errorMsg);
                console.error(errorMsg);
                result.total++;
              }
            }
          });

          // Yield to event loop between batches
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }

    return result;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Shared singleton instance to ensure MetricConfigCache is shared across all calculator instances.
 * This is critical for cache invalidation to work correctly - all parts of the application
 * must use the same cache instance.
 */
let singletonCache: MetricConfigCache | null = null;

/**
 * Get the shared MetricConfigCache instance.
 * Used internally by getDerivedMetricCalculator().
 */
function getSharedCache(): MetricConfigCache {
  if (!singletonCache) {
    singletonCache = new MetricConfigCache();
  }
  return singletonCache;
}

/**
 * Get a DerivedMetricCalculator instance with the shared cache.
 * This ensures cache invalidation works across all calculator instances.
 *
 * @param db - Database connection
 * @returns DerivedMetricCalculator instance with shared cache
 */
export function getDerivedMetricCalculator(db: typeof dbType): DerivedMetricCalculator {
  const calculator = new DerivedMetricCalculator(db);
  // Replace the instance's cache with the shared singleton
  (calculator as any).metricConfigCache = getSharedCache();
  return calculator;
}
