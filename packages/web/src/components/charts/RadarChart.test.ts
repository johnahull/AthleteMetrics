import { describe, it, expect } from 'vitest';
import { radarPlotValue } from './RadarChart';

describe('radarPlotValue', () => {
  it('uses the precomputed percentile rank in the report case (no statistics)', () => {
    // Report case: no statistics provided -> plot the athlete's percentile rank directly.
    expect(
      radarPlotValue({ metrics: { VJ: 25 }, percentileRanks: { VJ: 80 } }, 'VJ', undefined),
    ).toBe(80);
  });

  it('uses stats min/max normalization in the analytics case (NOT the percentile)', () => {
    // Analytics case: statistics present -> linear normalize value 25 within [10,30] => 75.
    expect(
      radarPlotValue(
        { metrics: { VJ: 25 }, percentileRanks: { VJ: 80 } },
        'VJ',
        { VJ: { min: 10, max: 30 } },
      ),
    ).toBe(75);
  });

  it('falls back to 50 when neither statistics nor percentile rank is available', () => {
    expect(radarPlotValue({ metrics: {}, percentileRanks: {} }, 'VJ', undefined)).toBe(50);
  });
});
