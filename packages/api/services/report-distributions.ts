// packages/api/services/report-distributions.ts
import { quantile } from 'simple-statistics';
import type { MetricDistribution } from '@shared/report-trends-types';

export const MAX_DISTRIBUTION_POINTS = 150;

/**
 * Build a peer distribution for one metric. Stats are computed from the FULL
 * peer set; `values` is evenly sampled down to `maxPoints` for display.
 * Returns null when there are fewer than 2 peers (no meaningful box).
 */
export function computeDistribution(
  peerValues: number[],
  athleteValue: number,
  maxPoints: number = MAX_DISTRIBUTION_POINTS,
): MetricDistribution | null {
  if (!peerValues || peerValues.length < 2) return null;

  const sorted = [...peerValues].sort((a, b) => a - b);
  const stats = {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };

  let values = sorted;
  if (peerValues.length > maxPoints) {
    // Even, deterministic down-sampling of the sorted set.
    const step = peerValues.length / maxPoints;
    values = Array.from({ length: maxPoints }, (_, i) => sorted[Math.floor(i * step)]);
  }

  return { values, athleteValue, stats };
}
