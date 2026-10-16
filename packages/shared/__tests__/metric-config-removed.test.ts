import { describe, it, expect } from 'vitest';
import * as analyticsTypes from '../analytics-types';

describe('METRIC_CONFIG removed', () => {
  it('is no longer exported: labels and units come from the metric list (site_metrics)', () => {
    expect(analyticsTypes).not.toHaveProperty('METRIC_CONFIG');
  });
});
