/**
 * Tests for server/routes.ts helper functions
 *
 * NOTE: METRIC_CONFIG is now empty - units should come from the database
 * via the site_metrics table. The getDefaultUnit function returns 's' (seconds)
 * as a fallback when a metric is not found in METRIC_CONFIG (which is always
 * the case now since METRIC_CONFIG is empty).
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
  it('should return s (fallback) for all metrics since METRIC_CONFIG is empty', () => {
    // With METRIC_CONFIG empty, all metrics fall back to 's'
    expect(getDefaultUnit('TOP_SPEED')).toBe('s');
    expect(getDefaultUnit('FLY10_TIME')).toBe('s');
    expect(getDefaultUnit('VERTICAL_JUMP')).toBe('s');
    expect(getDefaultUnit('DASH_40YD')).toBe('s');
    expect(getDefaultUnit('AGILITY_505')).toBe('s');
    expect(getDefaultUnit('AGILITY_5105')).toBe('s');
    expect(getDefaultUnit('T_TEST')).toBe('s');
    expect(getDefaultUnit('RSI')).toBe('s');
  });

  it('should default to s for unknown metrics', () => {
    expect(getDefaultUnit('UNKNOWN_METRIC')).toBe('s');
  });

  it('should handle empty string', () => {
    expect(getDefaultUnit('')).toBe('s');
  });

  it('should verify METRIC_CONFIG is empty', () => {
    expect(Object.keys(METRIC_CONFIG).length).toBe(0);
  });
});
