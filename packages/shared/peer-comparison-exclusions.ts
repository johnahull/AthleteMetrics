/**
 * Metrics excluded from peer percentiles, benchmarks and leaderboards (v1).
 *
 * Movement Quality (MQ) scores are coach-entered ordinal 0-3 rubric values, and
 * MQI_TOTAL / MQ_TRANSITION_TOTAL are sums of them. Treating them as continuous
 * performance numbers would produce misleading rankings and tiers (AM-FEAT-015).
 *
 * Matches the codes seeded by migration 0146: every MQ_* code (patterns,
 * MQ_TRANS_* transitions, MQ_TRANSITION_TOTAL) and MQI_TOTAL.
 */
const EXCLUDED_PREFIXES = ['MQ_', 'MQI_'];

/** True for every Movement Quality code (MQ_* base scores and totals, MQI_TOTAL). */
export function isMovementQualityMetric(metricCode: string): boolean {
  const code = (metricCode || '').toUpperCase();
  return EXCLUDED_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function isPeerComparisonExcludedMetric(metricCode: string): boolean {
  return isMovementQualityMetric(metricCode);
}

/** Thrown when an excluded metric is requested from a peer-comparison feature (maps to HTTP 400). */
export class PeerComparisonExcludedMetricError extends Error {
  constructor(metricCode: string, feature: string) {
    super(`Invalid metric: ${metricCode} is not available for ${feature}`);
    this.name = 'PeerComparisonExcludedMetricError';
  }
}
