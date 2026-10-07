/**
 * Reconciliation of derived totals (issue #526).
 *
 * Derived totals (e.g. MQI_TOTAL) are recalculated after the source write commits; if
 * that recalculation fails nothing retries it. reconcileDerivedTotals finds
 * (athlete, date) pairs whose total is missing or out of step with its sources and
 * repairs them with the idempotent, advisory-locked recalculateForAthlete.
 *
 * Detection (detectDrift) is a cheap, necessary-not-sufficient pre-filter; the
 * calculator remains the single source of truth for what the total should be, and the
 * result of each repair is compared before/after so only real changes count as repaired.
 *
 * Scope: active SITE derived metrics using the same_date strategy (incl. latest_event
 * selection, e.g. MQI_TOTAL). Custom org derived metrics and latest_before/closest
 * strategies are not reconciled.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { db as dbType } from '../db';
import { measurements, siteMetrics } from '@shared/schema';
import { DerivedMetricCalculator } from './derived-metric-calculator';

export type DriftReason = 'missing_total' | 'orphaned_total' | 'stale_total' | 'duplicate_totals';

export interface DriftSource {
  id: string;
  metric: string;
  value: string;
}

export interface DriftTotal {
  id: string;
  value: string;
  calculatedFromMeasurementIds: string[] | null;
  calculationMetadata?: { sourceValues?: Record<string, number> } | null;
}

export function detectDrift(input: {
  dependentMetrics: string[];
  sources: DriftSource[];
  totals: DriftTotal[];
  hasDirectTotal: boolean;
}): DriftReason | null {
  const deps = input.dependentMetrics.map((d) => d.toUpperCase());
  if (deps.length === 0) return null;

  const present = new Set(input.sources.map((s) => s.metric.toUpperCase()));
  const complete = deps.every((d) => present.has(d));

  if (input.totals.length > 1) return 'duplicate_totals';

  if (input.totals.length === 0) {
    return complete && !input.hasDirectTotal ? 'missing_total' : null;
  }

  // One calculated total exists
  if (!complete || input.hasDirectTotal) return 'orphaned_total';

  const total = input.totals[0];
  const refs = total.calculatedFromMeasurementIds ?? [];
  if (refs.length === 0) return 'stale_total';

  const sourcesById = new Map(input.sources.map((s) => [s.id, s]));
  const recorded = total.calculationMetadata?.sourceValues ?? {};
  for (const id of refs) {
    const source = sourcesById.get(id);
    if (!source) return 'stale_total';
    const was = recorded[source.metric.toLowerCase()];
    if (was !== undefined && Number(was) !== Number(source.value)) return 'stale_total';
  }
  // A source the total does not reference may be a better retest (or a legitimate
  // non-selected row); the calculator decides, so this is only a candidate.
  const refSet = new Set(refs);
  if (input.sources.some((s) => !refSet.has(s.id))) return 'stale_total';

  return null;
}

export interface ReconcileOptions {
  organizationId?: string;
  metricCode?: string;
  dryRun?: boolean;
  /** Max repairs attempted per run (default 500). Remaining drift is reported, not repaired. */
  limit?: number;
  /** Recorded in the calculation audit trail. */
  triggeredBy?: string;
}

export interface ReconcileFinding {
  userId: string;
  metric: string;
  date: string;
  reason: DriftReason;
  outcome: 'repaired' | 'unchanged' | 'failed' | 'detected';
}

export interface ReconcileResult {
  metricsChecked: string[];
  skippedMetrics: string[];
  drifted: number;
  repaired: number;
  unchanged: number;
  failed: number;
  truncated: boolean;
  dryRun: boolean;
  findings: ReconcileFinding[];
}

const DEFAULT_LIMIT = 500;

const snapshot = (rows: Array<{ value: string; calculatedFromMeasurementIds: string[] | null }>) =>
  JSON.stringify(
    rows
      .map((r) => `${r.value}:${[...(r.calculatedFromMeasurementIds ?? [])].sort().join(',')}`)
      .sort()
  );

export async function reconcileDerivedTotals(
  database: typeof dbType,
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const result: ReconcileResult = {
    metricsChecked: [],
    skippedMetrics: [],
    drifted: 0,
    repaired: 0,
    unchanged: 0,
    failed: 0,
    truncated: false,
    dryRun: !!options.dryRun,
    findings: [],
  };

  const derivedMetrics = await database
    .select()
    .from(siteMetrics)
    .where(and(eq(siteMetrics.isDerived, true), eq(siteMetrics.isActive, true)));

  const calculator = new DerivedMetricCalculator(database);
  let attempted = 0;

  for (const metric of derivedMetrics) {
    if (options.metricCode && metric.code.toUpperCase() !== options.metricCode.toUpperCase()) continue;
    const deps = (metric.dependentMetrics ?? []).map((d) => d.toUpperCase());
    const strategy = metric.calculationConfig?.dateMatchStrategy ?? 'same_date';
    if (deps.length === 0 || strategy !== 'same_date') {
      result.skippedMetrics.push(metric.code);
      continue;
    }
    result.metricsChecked.push(metric.code);

    const orgFilter = options.organizationId
      ? eq(measurements.organizationId, options.organizationId)
      : undefined;

    const sourceRows = await database
      .select({
        id: measurements.id,
        userId: measurements.userId,
        date: measurements.date,
        metric: measurements.metric,
        value: measurements.value,
        organizationId: measurements.organizationId,
      })
      .from(measurements)
      .where(
        and(
          inArray(sql`UPPER(${measurements.metric})`, deps),
          eq(measurements.isCalculated, false),
          // latest_event selection only counts verified scores (see findLatestEventSources)
          metric.calculationConfig?.sourceSelection === 'latest_event'
            ? eq(measurements.isVerified, true)
            : undefined,
          orgFilter
        )
      );

    const totalRows = await database
      .select()
      .from(measurements)
      .where(eq(measurements.metric, metric.code));

    // Group by athlete|date
    const groups = new Map<
      string,
      {
        userId: string;
        date: string;
        organizationId: string | null;
        sources: DriftSource[];
        totals: DriftTotal[];
        hasDirectTotal: boolean;
      }
    >();
    const group = (userId: string, date: string, organizationId: string | null = null) => {
      const key = `${userId}|${date}`;
      let g = groups.get(key);
      if (!g) {
        g = { userId, date, organizationId, sources: [], totals: [], hasDirectTotal: false };
        groups.set(key, g);
      }
      return g;
    };
    for (const s of sourceRows) {
      group(s.userId, s.date, s.organizationId).sources.push({ id: s.id, metric: s.metric, value: s.value });
    }
    for (const t of totalRows) {
      const g = groups.get(`${t.userId}|${t.date}`);
      // A total whose sources are all gone (orphan) has no source group yet: create one,
      // but an org-scoped run only considers totals of that org.
      const inScope = !options.organizationId || t.organizationId === options.organizationId;
      const target = g ?? (inScope ? group(t.userId, t.date, t.organizationId) : undefined);
      if (!target) continue;
      if (t.isCalculated) {
        target.totals.push({
          id: t.id,
          value: t.value,
          calculatedFromMeasurementIds: t.calculatedFromMeasurementIds,
          calculationMetadata: t.calculationMetadata as DriftTotal['calculationMetadata'],
        });
      } else {
        target.hasDirectTotal = true;
      }
    }

    for (const g of groups.values()) {
      const reason = detectDrift({
        dependentMetrics: deps,
        sources: g.sources,
        totals: g.totals,
        hasDirectTotal: g.hasDirectTotal,
      });
      if (!reason) continue;
      result.drifted++;

      const finding: ReconcileFinding = {
        userId: g.userId,
        metric: metric.code,
        date: g.date,
        reason,
        outcome: 'detected',
      };

      if (!options.dryRun) {
        if (attempted >= limit) {
          result.truncated = true;
          result.findings.push(finding);
          continue;
        }
        attempted++;
        const before = snapshot(g.totals);
        try {
          const failuresBefore = calculator.getFailures().length;
          await calculator.recalculateForAthlete(g.userId, deps, g.date, {
            triggerContext: { event: 'manual_recalculation', userId: options.triggeredBy },
            organizationId: g.organizationId,
          });
          if (calculator.getFailures().length > failuresBefore) {
            finding.outcome = 'failed';
            result.failed++;
          } else {
            const after = await database
              .select({
                value: measurements.value,
                calculatedFromMeasurementIds: measurements.calculatedFromMeasurementIds,
              })
              .from(measurements)
              .where(
                and(
                  eq(measurements.userId, g.userId),
                  eq(measurements.metric, metric.code),
                  eq(measurements.date, g.date),
                  eq(measurements.isCalculated, true)
                )
              );
            if (snapshot(after) !== before) {
              finding.outcome = 'repaired';
              result.repaired++;
            } else {
              finding.outcome = 'unchanged';
              result.unchanged++;
            }
          }
        } catch (error) {
          finding.outcome = 'failed';
          result.failed++;
          console.error('Derived total reconciliation failed', {
            userId: g.userId,
            metric: metric.code,
            date: g.date,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      result.findings.push(finding);
    }
  }

  return result;
}
