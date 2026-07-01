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
  values: number[];   // peer best-performances, sampled for display (<= cap)
  athleteValue: number;
  stats: { min: number; q1: number; median: number; q3: number; max: number }; // from the FULL set
  direction: 'higher' | 'lower';  // higher-is-better vs lower-is-better (for the "better" axis annotation)
}

/** Map of metric code -> distribution. Present only when the distribution chart is enabled. */
export type ReportDistributions = Record<string, MetricDistribution>;
