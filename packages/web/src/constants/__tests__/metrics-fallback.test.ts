import { describe, it, expect } from 'vitest';
import {
  METRIC_DISPLAY_NAMES,
  METRIC_UNITS,
  METRIC_UNIT_ABBREVIATIONS,
  METRIC_LOWER_IS_BETTER,
  getMetricDisplayName,
  getMetricUnit,
  getMetricUnitAbbreviation,
  isLowerBetter,
  getProgressionStatus
} from '../metrics';

/**
 * Test suite for metric constants after removing hardcoded definitions
 *
 * This test verifies that all static maps are empty and functions return
 * appropriate fallback values when the database becomes the single source of truth.
 */
describe('Metric Constants - Fallback Behavior', () => {
  describe('Static Maps', () => {
    it('should have empty METRIC_DISPLAY_NAMES', () => {
      expect(Object.keys(METRIC_DISPLAY_NAMES)).toHaveLength(0);
      expect(METRIC_DISPLAY_NAMES).toEqual({});
    });

    it('should have empty METRIC_UNITS', () => {
      expect(Object.keys(METRIC_UNITS)).toHaveLength(0);
      expect(METRIC_UNITS).toEqual({});
    });

    it('should have empty METRIC_UNIT_ABBREVIATIONS', () => {
      expect(Object.keys(METRIC_UNIT_ABBREVIATIONS)).toHaveLength(0);
      expect(METRIC_UNIT_ABBREVIATIONS).toEqual({});
    });

    it('should have empty METRIC_LOWER_IS_BETTER', () => {
      expect(Object.keys(METRIC_LOWER_IS_BETTER)).toHaveLength(0);
      expect(METRIC_LOWER_IS_BETTER).toEqual({});
    });
  });

  describe('getMetricDisplayName', () => {
    it('should return the metric code for unknown metrics', () => {
      expect(getMetricDisplayName('UNKNOWN_METRIC')).toBe('UNKNOWN_METRIC');
    });

    it('should return the metric code for previously hardcoded FLY10_TIME', () => {
      expect(getMetricDisplayName('FLY10_TIME')).toBe('FLY10_TIME');
    });

    it('should return the metric code for previously hardcoded VERTICAL_JUMP', () => {
      expect(getMetricDisplayName('VERTICAL_JUMP')).toBe('VERTICAL_JUMP');
    });
  });

  describe('getMetricUnit', () => {
    it('should return empty string for unknown metrics without fallback', () => {
      expect(getMetricUnit('UNKNOWN_METRIC')).toBe('');
    });

    it('should return provided fallback for unknown metrics', () => {
      expect(getMetricUnit('UNKNOWN_METRIC', 'units')).toBe('units');
    });

    it('should return empty string for previously hardcoded FLY10_TIME', () => {
      expect(getMetricUnit('FLY10_TIME')).toBe('');
    });

    it('should use fallback when metric not found', () => {
      expect(getMetricUnit('ANY_METRIC', 'custom')).toBe('custom');
    });
  });

  describe('getMetricUnitAbbreviation', () => {
    it('should return empty string for unknown metrics without fallback', () => {
      expect(getMetricUnitAbbreviation('UNKNOWN_METRIC')).toBe('');
    });

    it('should return provided fallback for unknown metrics', () => {
      expect(getMetricUnitAbbreviation('UNKNOWN_METRIC', 'u')).toBe('u');
    });

    it('should return empty string for previously hardcoded FLY10_TIME', () => {
      expect(getMetricUnitAbbreviation('FLY10_TIME')).toBe('');
    });

    it('should use fallback when metric not found', () => {
      expect(getMetricUnitAbbreviation('ANY_METRIC', 'x')).toBe('x');
    });
  });

  describe('isLowerBetter', () => {
    it('should default to false for unknown metrics (higher is better is the default)', () => {
      // When metric not in map and not in LOWER_IS_BETTER_METRICS, returns false
      expect(isLowerBetter('UNKNOWN_METRIC')).toBe(false);
    });

    it('should return true for time-based FLY10_TIME (in LOWER_IS_BETTER_METRICS list)', () => {
      // FLY10_TIME is in the fallback LOWER_IS_BETTER_METRICS list
      expect(isLowerBetter('FLY10_TIME')).toBe(true);
    });

    it('should return false for VERTICAL_JUMP (higher is better)', () => {
      // VERTICAL_JUMP is not in LOWER_IS_BETTER_METRICS, defaults to higher is better
      expect(isLowerBetter('VERTICAL_JUMP')).toBe(false);
    });

    it('should return true for other time-based metrics', () => {
      expect(isLowerBetter('DASH_40YD')).toBe(true);
      expect(isLowerBetter('AGILITY_505')).toBe(true);
      expect(isLowerBetter('T_TEST')).toBe(true);
    });
  });

  describe('getProgressionStatus', () => {
    it('should return "unchanged" when values are equal', () => {
      expect(getProgressionStatus('ANY_METRIC', 10, 10)).toBe('unchanged');
    });

    it('should use default higher-is-better logic when metric not found', () => {
      // Default is false (higher is better), so increase = improved
      expect(getProgressionStatus('UNKNOWN_METRIC', 8, 10)).toBe('improved');
      expect(getProgressionStatus('UNKNOWN_METRIC', 10, 8)).toBe('declined');
    });

    it('should handle FLY10_TIME correctly (lower is better)', () => {
      // FLY10_TIME is in LOWER_IS_BETTER_METRICS list
      expect(getProgressionStatus('FLY10_TIME', 1.5, 1.3)).toBe('improved');
      expect(getProgressionStatus('FLY10_TIME', 1.3, 1.5)).toBe('declined');
    });

    it('should handle VERTICAL_JUMP correctly (higher is better)', () => {
      // VERTICAL_JUMP defaults to higher is better
      expect(getProgressionStatus('VERTICAL_JUMP', 28, 30)).toBe('improved');
      expect(getProgressionStatus('VERTICAL_JUMP', 30, 28)).toBe('declined');
    });
  });
});
