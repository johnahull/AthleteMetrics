/**
 * Unit tests for FLY10_TIME conversion utilities
 */

import { describe, it, expect } from 'vitest';
import {
  fly10ToMph,
  formatFly10Dual,
  isFly10Metric,
  FLY10_YARDS,
  YARDS_TO_MILES,
  SECONDS_TO_HOURS
} from '../fly10-conversion';

describe('fly10ToMph', () => {
  it('should convert valid seconds to mph correctly', () => {
    // Test case: 2.0 seconds = 10.227272... mph
    expect(fly10ToMph(2.0)).toBeCloseTo(10.227, 3);

    // Test case: 1.5 seconds = 13.636363... mph
    expect(fly10ToMph(1.5)).toBeCloseTo(13.636, 3);

    // Test case: 1.0 seconds = 20.454545... mph
    expect(fly10ToMph(1.0)).toBeCloseTo(20.455, 3);
  });

  it('should handle elite performance correctly', () => {
    // Elite: 1.95s = 10.49 mph
    expect(fly10ToMph(1.95)).toBeCloseTo(10.49, 2);
  });

  it('should return 0 for zero seconds', () => {
    expect(fly10ToMph(0)).toBe(0);
  });

  it('should return 0 for negative seconds', () => {
    expect(fly10ToMph(-1)).toBe(0);
    expect(fly10ToMph(-10.5)).toBe(0);
  });

  it('should return 0 for Infinity', () => {
    expect(fly10ToMph(Infinity)).toBe(0);
    expect(fly10ToMph(-Infinity)).toBe(0);
  });

  it('should return 0 for NaN', () => {
    expect(fly10ToMph(NaN)).toBe(0);
  });

  it('should use correct conversion constants', () => {
    // Verify the math: mph = (10 / 1760) / (seconds / 3600)
    // Simplifies to: mph = 20.454545... / seconds
    const expectedConstant = (FLY10_YARDS * YARDS_TO_MILES) / SECONDS_TO_HOURS;
    expect(expectedConstant).toBeCloseTo(20.454545, 5);
  });
});

describe('formatFly10Dual', () => {
  it('should format time-first by default', () => {
    const result = formatFly10Dual(2.0);
    expect(result).toMatch(/^2\.00s \(10\.23 mph\)$/);
  });

  it('should format time-first when specified', () => {
    const result = formatFly10Dual(1.95, 'time-first');
    expect(result).toMatch(/^1\.95s \(10\.49 mph\)$/);
  });

  it('should format speed-first when specified', () => {
    const result = formatFly10Dual(1.95, 'speed-first');
    expect(result).toMatch(/^10\.49 mph \(1\.95s\)$/);
  });

  it('should handle edge cases gracefully', () => {
    // Zero seconds
    expect(formatFly10Dual(0)).toContain('0.00s');
    expect(formatFly10Dual(0)).toContain('0.00 mph');

    // Negative seconds
    expect(formatFly10Dual(-1)).toContain('-1.00s');
    expect(formatFly10Dual(-1)).toContain('0.00 mph');
  });

  it('should format decimals to 2 places', () => {
    const result = formatFly10Dual(1.999);
    expect(result).toContain('2.00s');
    expect(result).toContain('10.23 mph');
  });

  it('should handle very fast times', () => {
    // Extremely fast: 1.0s = 20.45 mph
    const result = formatFly10Dual(1.0);
    expect(result).toContain('1.00s');
    expect(result).toContain('20.45 mph');
  });

  it('should handle very slow times', () => {
    // Very slow: 5.0s = 4.09 mph
    const result = formatFly10Dual(5.0);
    expect(result).toContain('5.00s');
    expect(result).toContain('4.09 mph');
  });
});

describe('isFly10Metric', () => {
  it('should return true for FLY10_TIME', () => {
    expect(isFly10Metric('FLY10_TIME')).toBe(true);
  });

  it('should return false for TOP_SPEED', () => {
    // Intentional: TOP_SPEED should not trigger dual display
    expect(isFly10Metric('TOP_SPEED')).toBe(false);
  });

  it('should return false for other metrics', () => {
    expect(isFly10Metric('VERTICAL_JUMP')).toBe(false);
    expect(isFly10Metric('AGILITY_505')).toBe(false);
    expect(isFly10Metric('DASH_40YD')).toBe(false);
    expect(isFly10Metric('RSI')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(isFly10Metric('fly10_time')).toBe(false);
    expect(isFly10Metric('Fly10_Time')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isFly10Metric('')).toBe(false);
  });

  it('should return false for partial matches', () => {
    expect(isFly10Metric('FLY10')).toBe(false);
    expect(isFly10Metric('TIME')).toBe(false);
    expect(isFly10Metric('FLY10_TIME_')).toBe(false);
  });
});

describe('Integration tests', () => {
  it('should produce consistent results across all functions', () => {
    const seconds = 1.95;

    // Check if it's a FLY10 metric
    const isFly10 = isFly10Metric('FLY10_TIME');
    expect(isFly10).toBe(true);

    // Convert to mph
    const mph = fly10ToMph(seconds);
    expect(mph).toBeCloseTo(10.49, 2);

    // Format dual display
    const formatted = formatFly10Dual(seconds, 'time-first');
    expect(formatted).toBe('1.95s (10.49 mph)');

    const formattedSpeedFirst = formatFly10Dual(seconds, 'speed-first');
    expect(formattedSpeedFirst).toBe('10.49 mph (1.95s)');
  });

  it('should handle complete workflow for TOP_SPEED', () => {
    // TOP_SPEED should NOT trigger dual display
    const isTopSpeed = isFly10Metric('TOP_SPEED');
    expect(isTopSpeed).toBe(false);

    // But the conversion still works if needed
    const mph = fly10ToMph(1.95);
    expect(mph).toBeCloseTo(10.49, 2);
  });
});
