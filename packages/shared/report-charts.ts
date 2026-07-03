// packages/shared/report-charts.ts

export interface ChartSelection {
  radar: boolean;
  benchmarkStanding: boolean;
  trends: boolean;
  distribution: boolean;
  // Team-only charts (team-report-charts Stage 1). Optional here so
  // resolveChartSelection's existing individual-only return values (which
  // don't set these) keep type-checking unchanged; resolveTeamChartSelection
  // always sets them concretely.
  leaderboard?: boolean;
  tierDistribution?: boolean;
  boxSwarm?: boolean;
}

/** Default chart selection for new reports — all charts on. */
export const DEFAULT_CHART_SELECTION: ChartSelection = {
  radar: true, benchmarkStanding: true, trends: true, distribution: true,
  leaderboard: true, tierDistribution: true, boxSwarm: true,
};

/** Team reports don't use the individual-only `distribution` histogram — they
 *  use `boxSwarm` instead. They also don't use `radar`: unlike an individual
 *  athlete's percentile (computed against an external cohort), a team's
 *  average percentile is computed against its own roster, so averaging it
 *  across the team converges toward ~50% regardless of how good the team
 *  actually is — not a meaningful "team all-around profile."
 *
 *  A dedicated interface (rather than `Omit<ChartSelection, ...>`) so these
 *  fields are required booleans here — resolveTeamChartSelection always sets
 *  all five concretely, even though ChartSelection itself declares them
 *  optional for the individual resolver's sake. */
export interface TeamChartSelection {
  benchmarkStanding: boolean;
  trends: boolean;
  leaderboard: boolean;
  tierDistribution: boolean;
  boxSwarm: boolean;
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

/**
 * Resolve which team-report charts are enabled. Unlike {@link resolveChartSelection},
 * the legacy branch (no `charts` field) returns ALL FALSE — every pre-existing
 * team report has no `charts` field today and rendered tables only, so it must
 * NOT inherit the individual resolver's "radar+benchmarkStanding on" default.
 */
export function resolveTeamChartSelection(config: ChartConfigInput | undefined | null): TeamChartSelection {
  const c = config?.charts;
  // A present `charts` object is the explicit selection — an empty object means
  // all charts off (same convention as resolveChartSelection).
  if (c) {
    return {
      benchmarkStanding: c.benchmarkStanding ?? false,
      trends: c.trends ?? false,
      leaderboard: c.leaderboard ?? false,
      tierDistribution: c.tierDistribution ?? false,
      boxSwarm: c.boxSwarm ?? false,
    };
  }
  return {
    benchmarkStanding: false,
    trends: false,
    leaderboard: false,
    tierDistribution: false,
    boxSwarm: false,
  };
}
