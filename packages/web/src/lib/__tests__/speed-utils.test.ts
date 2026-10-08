import { describe, it, expect } from 'vitest';
import { calculateFly10Speed, fly10SpeedMph } from '../speed-utils';

describe('fly10SpeedMph (athlete profile Speed (mph) column)', () => {
  // Every FLY10 run-in variant times the same 10 yd segment; only the approach differs,
  // so the speed is 10 yd / time for all five codes.
  it.each(['FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME', 'FLY10_TIME_RI30'])(
    'converts the 10 yd timed segment of %s',
    (metric) => {
      expect(fly10SpeedMph(metric, 1.5)).toBe(calculateFly10Speed(1.5));
      expect(fly10SpeedMph(metric, 1.5)).toBe(13.6);
    },
  );

  it('returns null for metrics that are not a FLY10 run-in code', () => {
    expect(fly10SpeedMph('VERTICAL_JUMP', 30)).toBeNull();
    expect(fly10SpeedMph('FLY10M_TIME', 1.5)).toBeNull();
    expect(fly10SpeedMph('TOP_SPEED', 20)).toBeNull();
  });

  it('returns null for a non-positive or non-finite time instead of Infinity/NaN', () => {
    expect(fly10SpeedMph('FLY10_TIME_RI10', 0)).toBeNull();
    expect(fly10SpeedMph('FLY10_TIME_RI10', -1)).toBeNull();
    expect(fly10SpeedMph('FLY10_TIME_RI10', NaN)).toBeNull();
    expect(fly10SpeedMph('FLY10_TIME_RI10', Infinity)).toBeNull();
  });
});
