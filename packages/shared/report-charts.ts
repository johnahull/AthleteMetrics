// packages/shared/report-charts.ts

export interface ChartSelection {
  radar: boolean;
  benchmarkStanding: boolean;
  trends: boolean;
  distribution: boolean;
}

/** Config subset this resolver reads. */
interface ChartConfigInput {
  charts?: Partial<ChartSelection>;
  showTrends?: boolean;
}

/**
 * Resolve which report charts are enabled. New reports carry `charts`; legacy
 * reports (no `charts`) fall back to historical behavior: radar + benchmark
 * standing on, trends driven by the old `showTrends` flag, distribution off.
 */
export function resolveChartSelection(config: ChartConfigInput | undefined | null): ChartSelection {
  const c = config?.charts;
  // A present `charts` object is the explicit selection — an empty object means
  // all charts off (only legacy reports, which have no `charts`, get the defaults).
  if (c) {
    return {
      radar: c.radar ?? false,
      benchmarkStanding: c.benchmarkStanding ?? false,
      trends: c.trends ?? false,
      distribution: c.distribution ?? false,
    };
  }
  return {
    radar: true,
    benchmarkStanding: true,
    trends: config?.showTrends ?? false,
    distribution: false,
  };
}
