// packages/api/services/report-team-charts.ts
import { quantile, mean } from 'simple-statistics';
import { deriveOverlay, computeTrendDelta } from './report-trends';
import type {
  TrendPoint, AthleteTrendSeries, TeamReportTrends, TeamMetricDistribution,
} from '@shared/report-trends-types';

/** Minimal per-athlete measurement row shape needed here (value is a decimal string). */
interface TeamTrendMeasurementRow {
  athleteId: string;
  athleteName: string;
  metric: string;
  date: string;   // YYYY-MM-DD
  value: string;
}

/** Subset of a benchmark comparison read by deriveOverlay (mirrors report-trends.ts's ComparisonLike). */
interface ComparisonLike {
  benchmarkName: string;
  benchmarkValue: number;
  allTiers?: Array<{
    tierName: string; tierColor: string; tierOrder: number;
    minValue: number | null; maxValue: number | null;
  }>;
}

/**
 * Build the per-metric team trend map. Pure: no DB access.
 *
 * Mirrors report-trends.ts's assembleTrends, but averages across the roster
 * instead of tracking a single athlete: `teamSeries` is the mean of that
 * date's values across every athlete measured on that exact date (no
 * fuzzy date-window bucketing), while `athleteSeries` retains each athlete's
 * own ascending series for later faint-overlay rendering.
 *
 * @param rowsByAthlete  all in-window measurements for the roster (any order)
 * @param metrics        metric codes selected on the report
 * @param directions     metric code -> 'higher' | 'lower' (lower = lower-is-better)
 * @param comparisonsByMetric  metric code -> benchmark comparisons (any athlete's
 *   evaluated comparisons for that metric — tier boundaries don't depend on
 *   which athlete's value triggered the evaluation)
 */
export function assembleTeamTrends(
  rowsByAthlete: TeamTrendMeasurementRow[],
  metrics: string[],
  directions: Record<string, 'higher' | 'lower'>,
  comparisonsByMetric: Record<string, ComparisonLike[]>,
): TeamReportTrends {
  const trends: TeamReportTrends = {};

  for (const metric of metrics) {
    const direction = directions[metric] ?? 'higher';
    const isBetter = (candidate: number, current: number) =>
      direction === 'lower' ? candidate < current : candidate > current;

    const parsedRows = rowsByAthlete
      .filter(r => r.metric === metric)
      .map(r => ({ ...r, value: parseFloat(r.value) }))
      // Drop non-numeric measurement values: a malformed `value` would parse to
      // NaN and poison the team average / delta.
      .filter(r => !Number.isNaN(r.value));

    // Collapse same-day retests to the best value per athlete before
    // averaging — otherwise a retested athlete counts twice in that date's
    // team average, silently double-weighting them relative to teammates.
    const bestByAthleteDate = new Map<string, typeof parsedRows[number]>();
    for (const r of parsedRows) {
      const key = `${r.athleteId}|${r.date}`;
      const existing = bestByAthleteDate.get(key);
      if (!existing || isBetter(r.value, existing.value)) {
        bestByAthleteDate.set(key, r);
      }
    }
    const metricRows = Array.from(bestByAthleteDate.values());

    // Per-athlete ascending series (faint background context for Stage 2).
    const byAthlete = new Map<string, { athleteName: string; series: TrendPoint[] }>();
    for (const r of metricRows) {
      if (!byAthlete.has(r.athleteId)) {
        byAthlete.set(r.athleteId, { athleteName: r.athleteName, series: [] });
      }
      byAthlete.get(r.athleteId)!.series.push({ date: r.date, value: r.value });
    }
    const athleteSeries: AthleteTrendSeries[] = Array.from(byAthlete.entries()).map(
      ([athleteId, { athleteName, series }]) => ({
        athleteId,
        athleteName,
        series: series.slice().sort((a, b) => a.date.localeCompare(b.date)),
      }),
    );

    // Team-average per exact date (only dates with at least one measurement).
    const byDate = new Map<string, number[]>();
    for (const r of metricRows) {
      const values = byDate.get(r.date) || [];
      values.push(r.value);
      byDate.set(r.date, values);
    }
    const teamSeries: TrendPoint[] = Array.from(byDate.entries())
      .map(([date, values]) => ({ date, value: mean(values) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (teamSeries.length < 2) continue;

    const delta = computeTrendDelta(direction, teamSeries[0].value, teamSeries[teamSeries.length - 1].value);

    trends[metric] = {
      teamSeries,
      athleteSeries,
      direction,
      delta,
      benchmark: deriveOverlay(comparisonsByMetric[metric]),
    };
  }

  return trends;
}

/**
 * Build a team-level five-number-summary distribution for one metric. Pure.
 *
 * Analogous to report-distributions.ts's computeDistribution, but team-native:
 * there's no single focal athlete to separate from the population — every
 * athlete on the roster is plotted as a dot. Returns null when fewer than 2
 * athletes have a value (no meaningful distribution).
 */
export function computeTeamDistribution(
  athletes: Array<{ athleteId: string; athleteName: string; value: number }>,
): Omit<TeamMetricDistribution, 'direction'> | null {
  if (!athletes || athletes.length < 2) return null;

  const values = athletes.map(a => a.value).sort((a, b) => a - b);
  const stats = {
    min: values[0],
    q1: quantile(values, 0.25),
    median: quantile(values, 0.5),
    q3: quantile(values, 0.75),
    max: values[values.length - 1],
  };

  return { values, athletes, stats, teamAverage: mean(values) };
}
