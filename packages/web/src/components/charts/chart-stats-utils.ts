// packages/web/src/components/charts/chart-stats-utils.ts
import type { StatisticalSummary } from '@shared/analytics-types';

/** Linear-interpolated percentile from a pre-sorted ascending array. Shared
 *  with BoxPlotChart's client-side statistics fallback — do not fork this
 *  formula, import it instead. */
export function percentileOf(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Build a full {@link StatisticalSummary} from a plain array of values.
 *
 * Some chart primitives (SwarmChart, BarChart) require a non-empty
 * `statistics` map keyed by metric just to identify which metric to render —
 * they don't have BoxPlotChart's "compute from raw data" fallback path. This
 * builds that map locally for team-report charts fed pre-aggregated values
 * (team distributions, athlete rankings) rather than the full analytics
 * pipeline's `StatisticalSummary`.
 */
export function buildStatisticalSummary(values: number[]): StatisticalSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = count > 0 ? sorted.reduce((a, b) => a + b, 0) / count : 0;
  const variance = count > 1
    ? sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (count - 1)
    : 0;

  return {
    count,
    mean,
    median: percentileOf(sorted, 50),
    min: count > 0 ? sorted[0] : 0,
    max: count > 0 ? sorted[count - 1] : 0,
    std: Math.sqrt(variance),
    variance,
    percentiles: {
      p5: percentileOf(sorted, 5),
      p10: percentileOf(sorted, 10),
      p20: percentileOf(sorted, 20),
      p25: percentileOf(sorted, 25),
      p30: percentileOf(sorted, 30),
      p40: percentileOf(sorted, 40),
      p50: percentileOf(sorted, 50),
      p60: percentileOf(sorted, 60),
      p70: percentileOf(sorted, 70),
      p75: percentileOf(sorted, 75),
      p80: percentileOf(sorted, 80),
      p90: percentileOf(sorted, 90),
      p95: percentileOf(sorted, 95),
    },
  };
}
