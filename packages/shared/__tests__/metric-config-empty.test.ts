import { describe, it, expect } from 'vitest';
import { METRIC_CONFIG } from '../analytics-types';

/**
 * Test suite for METRIC_CONFIG after removing hardcoded definitions
 *
 * This test verifies that METRIC_CONFIG is empty after migration,
 * ensuring the database (site_metrics table) is the single source of truth.
 */
describe('METRIC_CONFIG - Empty Configuration', () => {
  it('should be an empty object', () => {
    expect(METRIC_CONFIG).toEqual({});
  });

  it('should have no keys', () => {
    expect(Object.keys(METRIC_CONFIG)).toHaveLength(0);
  });

  it('should not contain FLY10_TIME', () => {
    expect('FLY10_TIME' in METRIC_CONFIG).toBe(false);
  });

  it('should not contain VERTICAL_JUMP', () => {
    expect('VERTICAL_JUMP' in METRIC_CONFIG).toBe(false);
  });

  it('should not contain any previously hardcoded metrics', () => {
    const previousMetrics = [
      'FLY10_TIME',
      'VERTICAL_JUMP',
      'AGILITY_505',
      'AGILITY_5105',
      'T_TEST',
      'DASH_40YD',
      'RSI',
      'TOP_SPEED',
      'HEIGHT',
      'WEIGHT'
    ];

    previousMetrics.forEach(metric => {
      expect(metric in METRIC_CONFIG).toBe(false);
    });
  });

  it('should not allow accessing metric properties', () => {
    // TypeScript will allow accessing properties but they'll be undefined
    const config = METRIC_CONFIG as any;
    expect(config['FLY10_TIME']).toBeUndefined();
    expect(config['VERTICAL_JUMP']).toBeUndefined();
  });
});
