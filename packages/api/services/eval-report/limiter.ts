import type { AgeGroupMatch } from "./tier-match";
import type { EvalMetricKey } from "./metric-key-map";
import { groupForKey } from "./selection";

export interface PositionedMetric {
  key: EvalMetricKey;
  /** The metric's age-group match; null = no benchmark, so the metric is not ranked */
  match: AgeGroupMatch | null;
}

/**
 * The only way to get a ranking position (higher = further ahead of the age-group benchmark; null = unknown).
 * Average comparison: signed distance from the average as a fraction (0.07 = 7% better). Multi-tier set:
 * 1 for the best tier down to 0, null with fewer than two tiers or no matching tier.
 */
export function positionOf(match: AgeGroupMatch | null): number | null {
  if (match === null) return null;
  if (match.kind === "average") return match.distancePct / 100;
  const { tierOrder, allTiers } = match.comparison;
  const tiers = allTiers ?? [];
  const index = tiers.findIndex((t) => t.tierOrder === tierOrder);
  if (tiers.length < 2 || tierOrder === undefined || index < 0) return null;
  return 1 - index / (tiers.length - 1);
}

/**
 * Suggestions only (AM-FEAT-019 Part 5): top two strengths, bottom two development areas, and the single
 * lowest speed / power / change-of-direction metric as the limiter. The coach edits or overrides them.
 * Metrics without a known position are not ranked. Ties keep the input (report) order.
 */
export function strengthsAndLimiter(metrics: readonly PositionedMetric[]): {
  strengths: EvalMetricKey[];
  developmentAreas: EvalMetricKey[];
  limiter: EvalMetricKey | null;
} {
  const ranked = metrics.flatMap((m) => {
    const position = positionOf(m.match);
    return position === null ? [] : [{ key: m.key, position }];
  });
  const best = [...ranked].sort((a, b) => b.position - a.position);
  const strengths = best.slice(0, 2);
  const developmentAreas = best.slice(2).slice(-2).reverse();

  const limiterGroups = new Set(["speed", "power", "change_of_direction"]);
  let limiter: { key: EvalMetricKey; position: number } | null = null;
  for (const m of ranked) {
    if (limiterGroups.has(groupForKey(m.key)) && (limiter === null || m.position < limiter.position)) limiter = m;
  }

  return {
    strengths: strengths.map((m) => m.key),
    developmentAreas: developmentAreas.map((m) => m.key),
    limiter: limiter?.key ?? null,
  };
}
