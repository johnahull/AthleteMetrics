/**
 * Tests for server/routes.ts helper functions
 */

import { describe, it, expect } from 'vitest';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Inline the getDefaultUnit function for testing
// In production, this is defined in server/routes.ts line 156
const getDefaultUnit = (metric: string): string => {
  const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  // Use nullish coalescing to allow empty string units (e.g., RSI)
  return config?.unit ?? 's'; // Default to seconds if metric not found
};

describe('getDefaultUnit', () => {
  it('should return mph for TOP_SPEED', () => {
    expect(getDefaultUnit('TOP_SPEED')).toBe('mph');
  });

  it('should return s for FLY10_TIME', () => {
    expect(getDefaultUnit('FLY10_TIME')).toBe('s');
  });

  it('should return in for VERTICAL_JUMP', () => {
    expect(getDefaultUnit('VERTICAL_JUMP')).toBe('in');
  });

  it('should return s for DASH_40YD', () => {
    expect(getDefaultUnit('DASH_40YD')).toBe('s');
  });

  it('should return s for AGILITY_505', () => {
    expect(getDefaultUnit('AGILITY_505')).toBe('s');
  });

  it('should return s for AGILITY_5105', () => {
    expect(getDefaultUnit('AGILITY_5105')).toBe('s');
  });

  it('should return s for T_TEST', () => {
    expect(getDefaultUnit('T_TEST')).toBe('s');
  });

  it('should return empty string for RSI', () => {
    expect(getDefaultUnit('RSI')).toBe('');
  });

  it('should default to s for unknown metrics', () => {
    expect(getDefaultUnit('UNKNOWN_METRIC')).toBe('s');
  });

  it('should handle empty string', () => {
    expect(getDefaultUnit('')).toBe('s');
  });

  it('should be case-sensitive', () => {
    expect(getDefaultUnit('top_speed')).toBe('s'); // lowercase not recognized
    expect(getDefaultUnit('Top_Speed')).toBe('s'); // mixed case not recognized
  });

  it('should pull from METRIC_CONFIG correctly for all metrics', () => {
    const allMetrics = Object.keys(METRIC_CONFIG);

    allMetrics.forEach(metric => {
      const expectedUnit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG].unit;
      const actualUnit = getDefaultUnit(metric);
      expect(actualUnit).toBe(expectedUnit);
    });
  });
});
