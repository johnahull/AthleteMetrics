// packages/api/services/report-distributions.ts
import { quantile } from 'simple-statistics';
import type { MetricDistribution } from '@shared/report-trends-types';

/**
 * The direction-agnostic core of a distribution. The caller attaches `direction`
 * (metric metadata) to form the full {@link MetricDistribution}; this keeps the
 * math pure and independent of higher/lower-is-better.
 */
type DistributionCore = Omit<MetricDistribution, 'direction'>;

/**
 * Build a peer distribution for one metric.
 *
 * `peers` are the org-wide best-per-athlete values with the focal athlete already
 * removed BY ID (upstream), so the athlete is never counted among their own peers.
 * `values` (the histogram/dot inputs) are the peers, sorted; the consumer adds the
 * athlete back as the highlighted marker. `stats` (five-number summary) are taken
 * from the full population — the peers plus the athlete — matching the percentile.
 *
 * Values are NOT sampled: the histogram derives exact per-range counts from them.
 * Returns null when there are fewer than 2 peers (no meaningful distribution).
 */
export function computeDistribution(
  peers: number[],
  athleteValue: number,
): DistributionCore | null {
  if (!peers || peers.length < 2) return null;

  const population = [...peers, athleteValue].sort((a, b) => a - b);
  const stats = {
    min: population[0],
    q1: quantile(population, 0.25),
    median: quantile(population, 0.5),
    q3: quantile(population, 0.75),
    max: population[population.length - 1],
  };

  const values = [...peers].sort((a, b) => a - b);

  return { values, athleteValue, stats };
}
