// packages/shared/report-trends-types.ts

/** One point on an athlete's metric trend line. ISO date (YYYY-MM-DD). */
export interface TrendPoint {
  date: string;
  value: number;
}

/** A tiered benchmark band (e.g. JV / Varsity / Elite). null = open-ended. */
export interface TierBand {
  name: string;
  min: number | null;
  max: number | null;
  color: string;
}

/** A single-value benchmark threshold line. */
export interface ThresholdLine {
  name: string;
  value: number;
  color: string;
}

/** How benchmarks render on a metric's trend chart. */
export type BenchmarkOverlay =
  | { kind: 'tiers'; tiers: TierBand[] }
  | { kind: 'thresholds'; lines: ThresholdLine[] }
  | { kind: 'none' };

/** Trend data for one metric over the report window. */
export interface MetricTrend {
  series: TrendPoint[];                  // ascending by date, >= 2 points
  direction: 'higher' | 'lower';         // higher-is-better vs lower-is-better
  delta: { from: number; to: number; pct: number }; // pct > 0 = improvement
  benchmark: BenchmarkOverlay;
}

/** Map of metric code -> trend. Present on a report only when showTrends is on. */
export type ReportTrends = Record<string, MetricTrend>;

/** Peer distribution for one metric (org-wide), with the athlete's own value. */
export interface MetricDistribution {
  values: number[];   // peer best-performances (sorted; all peers, not sampled)
  athleteValue: number;
  stats: { min: number; q1: number; median: number; q3: number; max: number }; // from the FULL set
  direction: 'higher' | 'lower';  // higher-is-better vs lower-is-better (for the "better" axis annotation)
}

/** Map of metric code -> distribution. Present only when the distribution chart is enabled. */
export type ReportDistributions = Record<string, MetricDistribution>;

/** One athlete's trend series, for faint-overlay rendering behind the team-average line. */
export interface AthleteTrendSeries {
  athleteId: string;
  athleteName: string;
  series: TrendPoint[];
}

/** Team-level trend data for one metric: a bold team-average line plus per-athlete context. */
export interface TeamMetricTrend {
  teamSeries: TrendPoint[];             // team-average per date, ascending, >= 2 points required
  athleteSeries: AthleteTrendSeries[];  // per-athlete series (Stage 2 caps this to ~8 client-side)
  direction: 'higher' | 'lower';         // higher-is-better vs lower-is-better
  delta: { from: number; to: number; pct: number }; // computed on teamSeries; pct > 0 = improvement
  benchmark: BenchmarkOverlay;
}

/** Map of metric code -> team trend. Present on a team report only when the trends chart is enabled. */
export type TeamReportTrends = Record<string, TeamMetricTrend>;

/** Team-wide distribution for one metric: every athlete's best value plus a five-number summary. */
export interface TeamMetricDistribution {
  values: number[];                     // every athlete's best-per-metric value, sorted ascending
  athletes: Array<{ athleteId: string; athleteName: string; value: number }>;
  stats: { min: number; q1: number; median: number; q3: number; max: number };
  teamAverage: number;
  direction: 'higher' | 'lower';  // higher-is-better vs lower-is-better
}

/** Map of metric code -> team distribution. Present only when the box+swarm chart is enabled. */
export type TeamReportDistributions = Record<string, TeamMetricDistribution>;
