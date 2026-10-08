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
import { events, measurements, siteMetrics } from '@shared/schema';
import { DerivedMetricCalculator } from './derived-metric-calculator';

export type DriftReason = 'missing_total' | 'orphaned_total' | 'stale_total' | 'duplicate_totals';

export interface DriftSource {
  id: string;
  metric: string;
  value: string;
  /** ms epoch; tie-breaker for equal values (newest wins), as in the calculator */
  createdAt?: number;
  /** latest_event selection only */
  eventId?: string | null;
  eventStart?: number;
  eventCreatedAt?: number;
}

export interface DriftTotal {
  id: string;
  value: string;
  calculatedFromMeasurementIds: string[] | null;
  calculationMetadata?: { sourceValues?: Record<string, number> } | null;
}

/**
 * Mirrors the calculator's source selection (verified sources only are passed in):
 * per dependent metric the best value (direction per metric, default higher is better),
 * ties broken by newest createdAt. With latest_event, the sources come from the latest
 * event group only and every dependent metric must be present in it.
 * Returns null when the set is incomplete.
 */
function expectedSources(
  deps: string[],
  sources: DriftSource[],
  higherIsBetter: Record<string, boolean>,
  latestEvent: boolean
): DriftSource[] | null {
  let pool = sources;
  if (latestEvent) {
    const groups = new Map<string, DriftSource[]>();
    for (const s of sources) {
      const key = s.eventId ?? '';
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    const rank = (rows: DriftSource[]) => [
      rows[0].eventId ? 1 : 0,
      rows[0].eventStart ?? 0,
      rows[0].eventCreatedAt ?? 0,
      Math.max(...rows.map((r) => r.createdAt ?? 0)),
    ];
    let latest: DriftSource[] | undefined;
    for (const rows of groups.values()) {
      if (!latest) {
        latest = rows;
        continue;
      }
      const ra = rank(rows);
      const rb = rank(latest);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] !== rb[i]) {
          if (ra[i] > rb[i]) latest = rows;
          break;
        }
      }
    }
    pool = latest ?? [];
  }

  const chosen: DriftSource[] = [];
  for (const dep of deps) {
    const candidates = pool.filter((s) => s.metric.toUpperCase() === dep);
    if (candidates.length === 0) return null;
    const higher = higherIsBetter[dep] ?? true;
    chosen.push(
      candidates.reduce((best, c) => {
        const diff = Number(c.value) - Number(best.value);
        if (diff !== 0) return (higher ? diff > 0 : diff < 0) ? c : best;
        return (c.createdAt ?? 0) > (best.createdAt ?? 0) ? c : best;
      })
    );
  }
  return chosen;
}

/**
 * Pre-filter: compares the existing calculated total with what the calculator would
 * select from the verified source rows. The calculator remains the authority; the
 * before/after comparison in reconcileDerivedTotals confirms real repairs.
 */
export function detectDrift(input: {
  dependentMetrics: string[];
  /** Verified, non-calculated source rows for this athlete and date */
  sources: DriftSource[];
  totals: DriftTotal[];
  hasDirectTotal: boolean;
  /** Per dependent metric (uppercase code); missing = higher is better */
  higherIsBetter?: Record<string, boolean>;
  latestEvent?: boolean;
}): DriftReason | null {
  const deps = input.dependentMetrics.map((d) => d.toUpperCase());
  if (deps.length === 0) return null;

  if (input.totals.length > 1) return 'duplicate_totals';

  const expected = expectedSources(deps, input.sources, input.higherIsBetter ?? {}, !!input.latestEvent);

  if (input.totals.length === 0) {
    return expected && !input.hasDirectTotal ? 'missing_total' : null;
  }

  // One calculated total exists
  if (!expected || input.hasDirectTotal) return 'orphaned_total';

  const total = input.totals[0];
  const refs = total.calculatedFromMeasurementIds ?? [];
  if (refs.length === 0) return 'stale_total';

  const expectedIds = new Set(expected.map((e) => e.id));
  if (refs.length !== expectedIds.size || !refs.every((id) => expectedIds.has(id))) return 'stale_total';

  const recorded = total.calculationMetadata?.sourceValues ?? {};
  for (const source of expected) {
    const was = recorded[source.metric.toLowerCase()];
    if (was !== undefined && Number(was) !== Number(source.value)) return 'stale_total';
  }
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
  // The findings list is capped at `limit` (also in dryRun); counts stay exact
  // 'unchanged' outcomes are only counted, not listed (they can be numerous false positives)
  const addFinding = (finding: ReconcileFinding) => {
    if (finding.outcome === 'unchanged') return;
    if (result.findings.length < limit) result.findings.push(finding);
    else result.truncated = true;
  };

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

    const latestEvent = metric.calculationConfig?.sourceSelection === 'latest_event';

    // Per-metric direction used by the calculator's best-value selection
    const depConfigs = await database
      .select({ code: siteMetrics.code, metricType: siteMetrics.metricType })
      .from(siteMetrics)
      .where(inArray(sql`UPPER(${siteMetrics.code})`, deps));
    const higherIsBetter: Record<string, boolean> = {};
    for (const c of depConfigs) higherIsBetter[c.code.toUpperCase()] = c.metricType === 'higher_is_better';

    // Verified sources only, for every strategy: the calculator ignores unverified rows
    const sourceRows = await database
      .select({
        id: measurements.id,
        userId: measurements.userId,
        date: measurements.date,
        metric: measurements.metric,
        value: measurements.value,
        organizationId: measurements.organizationId,
        createdAt: measurements.createdAt,
        eventId: measurements.eventId,
        eventStart: events.startDate,
        eventCreatedAt: events.createdAt,
      })
      .from(measurements)
      .leftJoin(events, eq(measurements.eventId, events.id))
      .where(
        and(
          inArray(sql`UPPER(${measurements.metric})`, deps),
          eq(measurements.isCalculated, false),
          eq(measurements.isVerified, true),
          orgFilter
        )
      );

    const totalRows = await database
      .select({
        id: measurements.id,
        userId: measurements.userId,
        date: measurements.date,
        value: measurements.value,
        organizationId: measurements.organizationId,
        isCalculated: measurements.isCalculated,
        calculatedFromMeasurementIds: measurements.calculatedFromMeasurementIds,
        calculationMetadata: measurements.calculationMetadata,
      })
      .from(measurements)
      .where(and(eq(measurements.metric, metric.code), orgFilter));

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
      group(s.userId, s.date, s.organizationId).sources.push({
        id: s.id,
        metric: s.metric,
        value: s.value,
        createdAt: new Date(s.createdAt).getTime(),
        eventId: s.eventId,
        eventStart: s.eventStart ? new Date(s.eventStart).getTime() : undefined,
        eventCreatedAt: s.eventCreatedAt ? new Date(s.eventCreatedAt).getTime() : undefined,
      });
    }
    for (const t of totalRows) {
      const g = groups.get(`${t.userId}|${t.date}`);
      // A total whose sources are all gone (orphan) has no source group yet: create one,
      // but an org-scoped run only considers totals of that org.
      const target = g ?? group(t.userId, t.date, t.organizationId);
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
        higherIsBetter,
        latestEvent,
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
          addFinding(finding);
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
          // Only failures of this derived metric count (e.g. not an unrelated custom-org total)
          if (calculator.getFailures().slice(failuresBefore).some((f) => f.metric === metric.code)) {
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
              // A false positive must not starve real drift of the repair budget
              attempted--;
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
      addFinding(finding);
    }
  }

  return result;
}
