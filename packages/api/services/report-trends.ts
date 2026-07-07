// packages/api/services/report-trends.ts
import type {
  BenchmarkOverlay, MetricTrend, ReportTrends, TierBand, ThresholdLine,
} from '@shared/report-trends-types';

/** Minimal measurement row shape needed here (value is a decimal string). */
interface TrendMeasurementRow {
  metric: string;
  date: string;   // YYYY-MM-DD
  value: string;
}

/** Subset of a benchmark comparison we read for overlays. */
interface ComparisonLike {
  benchmarkName: string;
  benchmarkValue: number;
  allTiers?: Array<{
    tierName: string; tierColor: string; tierOrder: number;
    minValue: number | null; maxValue: number | null;
  }>;
}

const DEFAULT_THRESHOLD_COLOR = '#ef4444';

/**
 * Direction-aware percent change from `from` to `to` (0 when `from` is 0, to
 * avoid a division-by-zero blowup). Shared by individual and team trend
 * assembly so "improvement" is defined identically for both.
 */
export function computeTrendDelta(
  direction: 'higher' | 'lower',
  from: number,
  to: number,
): { from: number; to: number; pct: number } {
  const pct = from === 0 ? 0
    : direction === 'lower' ? ((from - to) / from) * 100
    : ((to - from) / from) * 100;
  return { from, to, pct };
}

/** Convert a metric's benchmark comparisons into a chart overlay. */
export function deriveOverlay(comparisons: ComparisonLike[] | undefined): BenchmarkOverlay {
  if (!comparisons || comparisons.length === 0) return { kind: 'none' };

  const tiered = comparisons.find(c => c.allTiers && c.allTiers.length > 0);
  if (tiered?.allTiers) {
    const tiers: TierBand[] = tiered.allTiers
      .slice()
      .sort((a, b) => a.tierOrder - b.tierOrder)
      .map(t => ({ name: t.tierName, min: t.minValue, max: t.maxValue, color: t.tierColor }));
    return { kind: 'tiers', tiers };
  }

  const lines: ThresholdLine[] = comparisons.map(c => ({
    name: c.benchmarkName,
    value: c.benchmarkValue,
    color: DEFAULT_THRESHOLD_COLOR,
  }));
  return { kind: 'thresholds', lines };
}

/**
 * Collapse a date-ascending series to at most one point per day, keeping the
 * best value for that day. "Best" is direction-aware: 'lower' means
 * lower-is-better (sprint times), 'higher' means higher-is-better (jumps).
 */
export function bestPerDay(
  series: Array<{ date: string; value: number }>,
  direction: 'higher' | 'lower',
): Array<{ date: string; value: number }> {
  const deduped: Array<{ date: string; value: number }> = [];
  for (const point of series) {
    const last = deduped[deduped.length - 1];
    if (last?.date !== point.date) {
      deduped.push({ ...point });
    } else if (direction === 'lower' ? point.value < last.value : point.value > last.value) {
      last.value = point.value;
    }
  }
  return deduped;
}

/**
 * Build the per-metric trend map. Pure: no DB access.
 * @param rows           all in-window measurements for the athlete (any order)
 * @param metrics        metric codes selected on the report
 * @param directions     metric code -> 'higher' | 'lower' (lower = lower-is-better)
 * @param comparisons    metric code -> benchmark comparisons (from getBenchmarkComparisons)
 */
export function assembleTrends(
  rows: TrendMeasurementRow[],
  metrics: string[],
  directions: Record<string, 'higher' | 'lower'>,
  comparisons: Record<string, ComparisonLike[]>,
): ReportTrends {
  const trends: ReportTrends = {};

  for (const metric of metrics) {
    const direction = directions[metric] ?? 'higher';
    const series = bestPerDay(
      rows
        .filter(r => r.metric === metric)
        .map(r => ({ date: r.date, value: parseFloat(r.value) }))
        // Drop non-numeric measurement values: a malformed `value` would parse to
        // NaN and poison `from`/`to`/`pct` and the rendered chart line.
        .filter(p => !Number.isNaN(p.value))
        .sort((a, b) => a.date.localeCompare(b.date)),
      direction,
    );

    if (series.length < 2) continue;

    const delta = computeTrendDelta(direction, series[0].value, series[series.length - 1].value);

    const trend: MetricTrend = {
      series,
      direction,
      delta,
      benchmark: deriveOverlay(comparisons[metric]),
    };
    trends[metric] = trend;
  }

  return trends;
}
