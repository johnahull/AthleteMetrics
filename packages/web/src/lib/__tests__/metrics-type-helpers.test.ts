import { describe, it, expect } from 'vitest';
import * as metrics from '../metrics';

/**
 * Metric direction lives in one shared function, resolveMetricType /
 * isLowerBetterType in @shared/analytics-types (tested in
 * packages/shared/__tests__/resolve-metric-type.test.ts). This module must not
 * grow its own copy again.
 */
describe('lib/metrics has no direction helpers of its own', () => {
  it.each(['getMetricType', 'isLowerIsBetter', 'isTrackingMetric', 'LOWER_IS_BETTER_METRICS'])(
    'does not export %s',
    (name) => {
      expect(metrics).not.toHaveProperty(name);
    },
  );
});
