import { describe, it, expect } from 'vitest';
import { isPeerComparisonExcludedMetric } from '../peer-comparison-exclusions';

describe('isPeerComparisonExcludedMetric (AM-FEAT-015 D7)', () => {
  it.each([
    'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN',
    'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
    'MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE', 'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR',
    'MQI_TOTAL', 'MQ_TRANSITION_TOTAL',
  ])('excludes %s', (code) => {
    expect(isPeerComparisonExcludedMetric(code)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPeerComparisonExcludedMetric('mqi_total')).toBe(true);
  });

  it.each(['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505_M', 'RSI', 'MQX_OTHER', 'JUMP_SJ_HEIGHT', ''])(
    'does not exclude %s',
    (code) => {
      expect(isPeerComparisonExcludedMetric(code)).toBe(false);
    },
  );
});
