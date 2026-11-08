import type { ChartSelection } from "@shared/report-charts";
import type { useContextualLabels } from "@/hooks/useContextualLabels";

export type ChartItemKey = keyof Required<ChartSelection>;
export type ChartItem = readonly [ChartItemKey, string, string];
type Labels = ReturnType<typeof useContextualLabels>;

/**
 * Chart choices offered for a report type. Individual and team reports show different sets
 * (team doesn't use the individual-only `distribution` histogram; it uses `boxSwarm`).
 */
export function chartItems(type: "team" | "individual", labels: Labels, fvEnabled: boolean): ReadonlyArray<ChartItem> {
  if (type === "team") {
    return [
      ["benchmarkStanding", "Benchmark standing", `Where the ${labels.team.toLowerCase()} average sits vs each benchmark`],
      ["trends", "Progress over time", `${labels.team} average trend line per metric (needs ≥2 measurements)`],
      ["boxSwarm", "Distribution (box + swarm)", `The spread of every ${labels.athlete.toLowerCase()}'s performance per metric`],
      ["leaderboard", "Leaderboard", `Ranked bar chart of ${labels.athletes.toLowerCase()} per metric`],
      ["tierDistribution", "Tier distribution", `${labels.team} composition across benchmark tiers`],
    ];
  }
  return [
    ["radar", "All-around profile (radar)", "Percentile shape across all metrics (needs ≥3 metrics)"],
    ["benchmarkStanding", "Benchmark standing", "Where the athlete sits vs each benchmark"],
    ["trends", "Progress over time", "Trend line per metric (needs ≥2 measurements)"],
    ["distribution", "Where you stand (distribution)", "The group spread with the athlete marked"],
    // Only offered when the sprint-FV module is enabled for the site AND org.
    ...(fvEnabled
      ? ([["fvProfile", "Force-Velocity profile", "Latest sprint F-V profile in the report window (KPIs, chart, analysis)"]] as const)
      : []),
    ["sprintRuns", "Sprint runs", "Device-imported dash runs in the report window: gate times, intervals and bests"],
  ];
}
