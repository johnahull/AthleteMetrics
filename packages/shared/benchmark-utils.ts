/**
 * Shared benchmark utility functions.
 * Used by both API (PDF generation) and Web (report rendering).
 * Pure functions — no DB, no browser APIs.
 */

import { formatMeasurement, type MeasurementFormat } from './duration-format';

/**
 * Derives a tier group display name from an individual tier benchmark name.
 * Strips the last " - Segment" suffix (e.g., "40yd Dash - Elite" → "40yd Dash").
 */
export function deriveTierGroupName(tierBenchmarkName: string): string {
  return tierBenchmarkName.replace(/ - [^-]+$/, '');
}

export interface TierDistribution {
  metricCode: string;
  tierGroupName: string;
  tiers: Array<{ tierName: string; tierColor: string; tierOrder: number; count: number }>;
}

/**
 * Calculate tier distribution across athletes for team reports.
 * Returns how many athletes fall into each tier for each tier group.
 */
export function calculateTierDistributions(athleteRankings: Array<{
  benchmarkComparisons?: Record<string, Array<{
    tierName?: string;
    tierColor?: string;
    tierOrder?: number;
    tierGroupName?: string;
  }>>;
}>): TierDistribution[] {
  if (!athleteRankings || athleteRankings.length === 0) return [];

  const groupMap = new Map<string, {
    metricCode: string;
    tierGroupName: string;
    tiers: Map<string, { tierColor: string; tierOrder: number; count: number }>;
  }>();

  for (const athlete of athleteRankings) {
    if (!athlete.benchmarkComparisons) continue;
    for (const [metric, comparisons] of Object.entries(athlete.benchmarkComparisons)) {
      for (const comp of comparisons) {
        if (!comp.tierName || !comp.tierGroupName) continue;
        const key = `${metric}:${comp.tierGroupName}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            metricCode: metric,
            tierGroupName: comp.tierGroupName,
            tiers: new Map(),
          });
        }
        const group = groupMap.get(key)!;
        if (!group.tiers.has(comp.tierName)) {
          group.tiers.set(comp.tierName, {
            tierColor: comp.tierColor || 'gray',
            tierOrder: comp.tierOrder || 99,
            count: 0,
          });
        }
        group.tiers.get(comp.tierName)!.count++;
      }
    }
  }

  return Array.from(groupMap.values()).map(({ metricCode, tierGroupName, tiers }) => ({
    metricCode,
    tierGroupName,
    tiers: Array.from(tiers.entries())
      .map(([tierName, data]) => ({ tierName, ...data }))
      .sort((a, b) => a.tierOrder - b.tierOrder),
  }));
}

/** The fields of a tier that {@link cutoffTiersToBands} and {@link tierRangeLabels} read. */
export interface TierBounds {
  tierOrder: number;
  minValue: number | null;
  maxValue: number | null;
  benchmarkValue?: number | null;
  comparisonOperator?: string | null;
}

/**
 * Give single-cutoff tiers (no min/max, just `benchmarkValue` + `lte`/`gte`, e.g. HS boys 40yd) the
 * contiguous [min, max] bands the server matcher implies: for `lte` the best tier is `<= c1`, then
 * `c1..c2`, ..., and the worst tier is everything above the second-worst cutoff (the server grades
 * slower-than-worst as the worst tier). `gte` is the mirror. A shared boundary belongs to the better
 * tier, as in evaluateTierBenchmark. Only a group made entirely of cutoff tiers (both bounds null) is
 * changed: a group that also has range tiers (an open band would overlap them), mixed operators, `eq`,
 * a single cutoff or cutoffs that disagree with tierOrder are returned unchanged. Pure: returns new
 * objects in the input order.
 */
export function cutoffTiersToBands<T extends TierBounds>(tiers: T[]): T[] {
  const cutoffs = tiers
    .filter((t) => t.minValue == null && t.maxValue == null && t.benchmarkValue != null)
    .sort((a, b) => a.tierOrder - b.tierOrder); // best first
  if (cutoffs.length < 2 || cutoffs.length !== tiers.length) return tiers;
  const op = cutoffs[0].comparisonOperator;
  if ((op !== 'lte' && op !== 'gte') || cutoffs.some((t) => t.comparisonOperator !== op)) return tiers;
  const c = cutoffs.map((t) => t.benchmarkValue!);
  // lte: cutoffs rise as tiers get worse; gte: they fall
  if (c.some((v, i) => i > 0 && (op === 'lte' ? v <= c[i - 1] : v >= c[i - 1]))) return tiers;

  const last = cutoffs.length - 1;
  const band = new Map<T, { minValue: number | null; maxValue: number | null }>();
  cutoffs.forEach((t, i) => {
    const better = i === 0 ? null : c[i - 1]; // boundary shared with the next better tier
    const own = i === last ? null : c[i]; // own cutoff; the worst tier is open-ended
    band.set(t, op === 'lte' ? { minValue: better, maxValue: own } : { minValue: own, maxValue: better });
  });
  return tiers.map((t) => ({ ...t, ...band.get(t)! }));
}

/**
 * Boundary text for each tier, from its min/max only (same order as `tiers`): "4.6–4.8 s", or for an
 * open band "> 5.2 s" / "< 25 in" when a better tier owns that boundary (a shared boundary belongs to
 * the better tier), otherwise the inclusive "≤ 4.6 s" / "≥ 30 in". A tier with no bounds gets "". Duration metrics print
 * m:ss with no unit; other values are rounded to 2 decimals (or always shown with `decimals` places). `ascii` for WinAnsi-only PDF fonts.
 */
export function tierRangeLabels(
  tiers: TierBounds[],
  opts: { unit?: string | null; format?: MeasurementFormat | null; ascii?: boolean; decimals?: number } = {},
): string[] {
  const { unit, format, ascii, decimals } = opts;
  const duration = format?.displayFormat === 'duration';
  const num = (v: number) => (duration ? formatMeasurement(v, format!) : decimals == null ? String(Math.round(v * 100) / 100) : v.toFixed(decimals));
  const u = unit && !duration ? ` ${unit}` : '';
  // a better tier holds this value as its opposite bound, so the boundary itself is not in this tier
  const ownedByBetter = (t: TierBounds, v: number, side: 'minValue' | 'maxValue') =>
    tiers.some((o) => o.tierOrder < t.tierOrder && o[side] === v);
  return tiers.map((t) => {
    if (t.minValue != null && t.maxValue != null) return `${num(t.minValue)}${ascii ? ' - ' : '–'}${num(t.maxValue)}${u}`;
    if (t.maxValue != null) return `${ownedByBetter(t, t.maxValue, 'minValue') ? '<' : ascii ? '<=' : '≤'} ${num(t.maxValue)}${u}`;
    if (t.minValue != null) return `${ownedByBetter(t, t.minValue, 'maxValue') ? '>' : ascii ? '>=' : '≥'} ${num(t.minValue)}${u}`;
    return '';
  });
}

// Benchmark ids are UUIDs (custom) or text slugs (seeded site benchmarks, e.g. d1-soc-dash40-d1-avg)
const BENCHMARK_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * True if the value is a well-formed benchmark id (UUID or seeded slug). Format only; existence is checked elsewhere.
 */
export function isValidBenchmarkId(value: string): boolean {
  return BENCHMARK_ID_PATTERN.test(value);
}
