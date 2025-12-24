import { describe, it, expect } from 'vitest';
import { getMetricType, isTrackingMetric, isLowerIsBetter, LOWER_IS_BETTER_METRICS } from '../metrics';
import type { MetricType } from '@shared/analytics-types';

/**
 * Test suite for metric type helper functions
 * Updated after removing hardcoded METRIC_CONFIG
 * Now uses LOWER_IS_BETTER_METRICS list for known time-based metrics
 * Database (site_metrics table) is the single source of truth via useMetricConfig hook
 */
describe('Metric Type Helper Functions', () => {
  describe('getMetricType', () => {
    describe('known lower_is_better metrics (from LOWER_IS_BETTER_METRICS list)', () => {
      it('should return lower_is_better for FLY10_TIME', () => {
        expect(getMetricType('FLY10_TIME')).toBe('lower_is_better');
      });

      it('should return lower_is_better for AGILITY_505', () => {
        expect(getMetricType('AGILITY_505')).toBe('lower_is_better');
      });

      it('should return lower_is_better for AGILITY_5105', () => {
        expect(getMetricType('AGILITY_5105')).toBe('lower_is_better');
      });

      it('should return lower_is_better for T_TEST', () => {
        expect(getMetricType('T_TEST')).toBe('lower_is_better');
      });

      it('should return lower_is_better for DASH_40YD', () => {
        expect(getMetricType('DASH_40YD')).toBe('lower_is_better');
      });
    });

    describe('higher_is_better metrics (default fallback)', () => {
      it('should return higher_is_better for VERTICAL_JUMP', () => {
        expect(getMetricType('VERTICAL_JUMP')).toBe('higher_is_better');
      });

      it('should return higher_is_better for RSI', () => {
        expect(getMetricType('RSI')).toBe('higher_is_better');
      });

      it('should return higher_is_better for TOP_SPEED', () => {
        expect(getMetricType('TOP_SPEED')).toBe('higher_is_better');
      });

      it('should return higher_is_better for HEIGHT (not in time-based list)', () => {
        expect(getMetricType('HEIGHT')).toBe('higher_is_better');
      });

      it('should return higher_is_better for WEIGHT (not in time-based list)', () => {
        expect(getMetricType('WEIGHT')).toBe('higher_is_better');
      });
    });

    describe('unknown metrics', () => {
      it('should return higher_is_better as default for unknown metric', () => {
        expect(getMetricType('UNKNOWN_METRIC')).toBe('higher_is_better');
      });
    });

    describe('with metricTypeOverride parameter', () => {
      it('should use override when provided (takes precedence)', () => {
        expect(getMetricType('FLY10_TIME', 'higher_is_better')).toBe('higher_is_better');
        expect(getMetricType('HEIGHT', 'tracking')).toBe('tracking');
        expect(getMetricType('VERTICAL_JUMP', 'lower_is_better')).toBe('lower_is_better');
      });
    });
  });

  describe('LOWER_IS_BETTER_METRICS', () => {
    it('should include all known time-based metrics', () => {
      expect(LOWER_IS_BETTER_METRICS).toContain('FLY10_TIME');
      expect(LOWER_IS_BETTER_METRICS).toContain('AGILITY_505');
      expect(LOWER_IS_BETTER_METRICS).toContain('AGILITY_5105');
      expect(LOWER_IS_BETTER_METRICS).toContain('T_TEST');
      expect(LOWER_IS_BETTER_METRICS).toContain('DASH_40YD');
    });

    it('should not include non-time metrics', () => {
      expect(LOWER_IS_BETTER_METRICS).not.toContain('VERTICAL_JUMP');
      expect(LOWER_IS_BETTER_METRICS).not.toContain('TOP_SPEED');
      expect(LOWER_IS_BETTER_METRICS).not.toContain('RSI');
    });
  });

  describe('isTrackingMetric', () => {
    it('should return false for HEIGHT (defaults to higher_is_better)', () => {
      expect(isTrackingMetric('HEIGHT')).toBe(false);
    });

    it('should return false for WEIGHT (defaults to higher_is_better)', () => {
      expect(isTrackingMetric('WEIGHT')).toBe(false);
    });

    it('should return false for FLY10_TIME (it is lower_is_better)', () => {
      expect(isTrackingMetric('FLY10_TIME')).toBe(false);
    });

    it('should return false for VERTICAL_JUMP (it is higher_is_better)', () => {
      expect(isTrackingMetric('VERTICAL_JUMP')).toBe(false);
    });

    it('should return false for unknown metrics', () => {
      expect(isTrackingMetric('UNKNOWN_METRIC')).toBe(false);
    });
  });

  describe('isLowerIsBetter', () => {
    it('should return true for time-based metrics', () => {
      expect(isLowerIsBetter('FLY10_TIME')).toBe(true);
      expect(isLowerIsBetter('DASH_40YD')).toBe(true);
      expect(isLowerIsBetter('AGILITY_505')).toBe(true);
      expect(isLowerIsBetter('T_TEST')).toBe(true);
    });

    it('should return false for higher_is_better metrics', () => {
      expect(isLowerIsBetter('VERTICAL_JUMP')).toBe(false);
      expect(isLowerIsBetter('TOP_SPEED')).toBe(false);
      expect(isLowerIsBetter('RSI')).toBe(false);
    });

    it('should return false for tracking metrics (defaults to higher_is_better)', () => {
      expect(isLowerIsBetter('HEIGHT')).toBe(false);
      expect(isLowerIsBetter('WEIGHT')).toBe(false);
    });

    it('should be consistent with getMetricType', () => {
      const metric = 'FLY10_TIME';
      expect(isLowerIsBetter(metric)).toBe(getMetricType(metric) === 'lower_is_better');
    });
  });
});
