// packages/web/src/components/charts/trend-utils.ts
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import type { BenchmarkOverlay, MetricTrend, TrendPoint } from '@shared/report-trends-types';
import type { MultiMetricData } from '@shared/analytics-types';
import { parseColorToRgba } from '@/lib/color-utils';
import type { AthleteRanking } from '@/types/report-types';

/**
 * Team charts (radar, trends) render one bold aggregate series plus faint
 * individual-athlete series for context, capped so the chart stays legible.
 * Shared by teamRadarDataFromRankings and TeamTrendSection.
 */
export const MAX_FAINT_ATHLETES = 8;

/**
 * Direction cue for a metric's trend chart. The y-axis is NOT inverted — values
 * render in conventional orientation — so we surface which way "better" points:
 * higher-is-better improves upward, lower-is-better improves downward.
 */
export function directionCue(direction: 'higher' | 'lower'): {
  betterText: string;
  arrow: string;
  word: string;
} {
  return direction === 'lower'
    ? { betterText: 'Lower is better', arrow: '↓', word: 'downward' }
    : { betterText: 'Higher is better', arrow: '↑', word: 'upward' };
}

/**
 * Direction-aware delta label. `delta.pct` is already improvement-signed
 * (positive = better, regardless of whether higher or lower is better for the
 * metric), so we use neutral "improvement"/"decline" wording instead of a ▲/▼
 * arrow. An up arrow next to a lower-is-better value that *dropped* (an
 * improvement) reads as if the value rose — the wording avoids that confusion.
 */
export function formatDelta(delta: { pct: number }): string {
  const rounded = Math.round(delta.pct);
  if (rounded > 0) return `+${rounded}% improvement`;
  if (rounded < 0) return `${Math.abs(rounded)}% decline`;
  return 'No change';
}

/** Which tier does `value` fall in? Above the top band counts as the best tier. */
export function currentTierName(overlay: BenchmarkOverlay, value: number): string | null {
  if (overlay.kind !== 'tiers' || overlay.tiers.length === 0) return null;
  for (const t of overlay.tiers) {
    const aboveMin = t.min == null || value >= t.min;
    const belowMax = t.max == null || value < t.max;
    if (aboveMin && belowMax) return t.name;
  }
  // Above the highest max -> best (last) tier
  const top = overlay.tiers[overlay.tiers.length - 1];
  if (top.max != null && value >= top.max) return top.name;
  return null;
}

/** Build Chart.js annotation map (tier boxes or threshold lines) for an overlay. */
export function overlayToAnnotations(overlay: BenchmarkOverlay): Record<string, AnnotationOptions> {
  const out: Record<string, AnnotationOptions> = {};
  if (overlay.kind === 'tiers') {
    overlay.tiers.forEach((t, i) => {
      out[`tier-${i}`] = {
        type: 'box',
        yMin: t.min ?? undefined,
        yMax: t.max ?? undefined,
        backgroundColor: parseColorToRgba(t.color, 0.35),
        borderWidth: 0,
        label: { display: true, content: t.name, position: 'start', color: '#475569', font: { size: 10 } },
      } as AnnotationOptions;
    });
  } else if (overlay.kind === 'thresholds') {
    overlay.lines.forEach((l, i) => {
      out[`line-${i}`] = {
        type: 'line',
        yMin: l.value,
        yMax: l.value,
        borderColor: l.color,
        borderWidth: 2,
        borderDash: [5, 5],
        label: { display: true, content: l.name, position: 'end', backgroundColor: l.color, color: 'white', padding: 4, font: { size: 10 } },
      } as AnnotationOptions;
    });
  }
  return out;
}

/** Build a single-series Chart.js dataset config from a metric trend. */
export function buildTrendChartData(trend: MetricTrend, label: string) {
  return {
    labels: trend.series.map(p => new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label,
        data: trend.series.map(p => p.value),
        borderColor: 'rgba(37, 99, 235, 1)',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(37, 99, 235, 1)',
        fill: false,
        tension: 0.1,
      },
    ],
  };
}

/** Index of the personal-best point (min for lower-is-better, max otherwise); -1 if empty. */
export function personalBestIndex(series: TrendPoint[], direction: 'higher' | 'lower'): number {
  if (series.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < series.length; i++) {
    const better = direction === 'lower' ? series[i].value < series[bestIdx].value
                                         : series[i].value > series[bestIdx].value;
    if (better) bestIdx = i;
  }
  return bestIdx;
}

/** Adapt the report's precomputed percentiles into RadarChart's MultiMetricData. */
export function radarDataFromPercentiles(
  athleteId: string,
  athleteName: string,
  percentiles: Record<string, number>,
  measurements: Record<string, number>,
): MultiMetricData {
  return { athleteId, athleteName, metrics: { ...measurements }, percentileRanks: { ...percentiles } };
}

/** Reserved athlete id for the synthetic team-average radar profile. */
export const TEAM_AVERAGE_ATHLETE_ID = '__team_avg__';

/**
 * Build team radar chart data: a synthetic team-average profile (mean
 * percentile/measurement per metric across all rankings, id
 * {@link TEAM_AVERAGE_ATHLETE_ID}) followed by up to `cap` individual athlete
 * profiles (first `cap` by roster order — deterministic). Metrics with no
 * percentile data from ANY athlete are simply omitted from the team-average
 * profile rather than defaulting to a misleading value.
 */
export function teamRadarDataFromRankings(
  rankings: AthleteRanking[],
  metrics: string[],
  cap = MAX_FAINT_ATHLETES,
): MultiMetricData[] {
  const avgPercentiles: Record<string, number> = {};
  const avgMeasurements: Record<string, number> = {};

  for (const metric of metrics) {
    const percentileValues = rankings
      .map((r) => r.percentiles?.[metric])
      .filter((v): v is number => typeof v === 'number');
    if (percentileValues.length === 0) continue; // no percentile data anywhere -> omit the spoke entirely

    avgPercentiles[metric] = percentileValues.reduce((a, b) => a + b, 0) / percentileValues.length;

    // RadarChart derives its set of rendered axes from `metrics`' keys (not
    // `percentileRanks`), so a metric must be gated out of BOTH maps together
    // — otherwise the axis still renders with no percentile to back it,
    // silently falling back to a fabricated 50th percentile.
    const measurementValues = rankings
      .map((r) => r.measurements?.[metric])
      .filter((v): v is number => typeof v === 'number');
    if (measurementValues.length > 0) {
      avgMeasurements[metric] = measurementValues.reduce((a, b) => a + b, 0) / measurementValues.length;
    }
  }

  const teamAverageProfile: MultiMetricData = {
    athleteId: TEAM_AVERAGE_ATHLETE_ID,
    athleteName: 'Team Average',
    metrics: avgMeasurements,
    percentileRanks: avgPercentiles,
  };

  const athleteProfiles = rankings
    .slice(0, cap)
    .map((r) => radarDataFromPercentiles(r.userId, r.userName, r.percentiles ?? {}, r.measurements ?? {}));

  return [teamAverageProfile, ...athleteProfiles];
}
