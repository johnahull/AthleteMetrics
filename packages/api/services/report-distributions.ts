// packages/api/services/report-distributions.ts
import { quantile } from 'simple-statistics';
import type { MetricDistribution } from '@shared/report-trends-types';

export const MAX_DISTRIBUTION_POINTS = 150;

/**
 * The direction-agnostic core of a distribution. The caller attaches `direction`
 * (metric metadata) to form the full {@link MetricDistribution}; this keeps the
 * math pure and independent of higher/lower-is-better.
 */
type DistributionCore = Omit<MetricDistribution, 'direction'>;

/**
 * Build a peer distribution for one metric. Stats are computed from the FULL
 * peer set; `values` is evenly sampled down to `maxPoints` for display.
 * Returns null when there are fewer than 2 peers (no meaningful box).
 */
export function computeDistribution(
  peerValues: number[],
  athleteValue: number,
  maxPoints: number = MAX_DISTRIBUTION_POINTS,
): DistributionCore | null {
  if (!peerValues || peerValues.length < 2) return null;

  const sorted = [...peerValues].sort((a, b) => a - b);
  const stats = {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };

  // Peers shown as dots exclude the athlete's own value (drawn separately as the
  // marker). Remove one occurrence BEFORE sampling so exclusion is deterministic
  // at any size. Stats above still reflect the full population (matching the
  // percentile, which includes the athlete).
  const peers = [...sorted];
  const selfIdx = peers.indexOf(athleteValue);
  if (selfIdx !== -1) peers.splice(selfIdx, 1);

  let values = peers;
  if (peers.length > maxPoints) {
    // Even, deterministic down-sampling of the athlete-excluded peers.
    const step = peers.length / maxPoints;
    values = Array.from({ length: maxPoints }, (_, i) => peers[Math.floor(i * step)]);
  }

  return { values, athleteValue, stats };
}
