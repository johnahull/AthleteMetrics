import { describe, it, expect } from 'vitest';
import { getMetricType, isTrackingMetric, isLowerIsBetter } from '../metrics';
import type { MetricType } from '@shared/analytics-types';

/**
 * Test suite for metric type helper functions
 * Part of TDD implementation for tracking metrics (HEIGHT, WEIGHT, etc.)
 */
describe('Metric Type Helper Functions', () => {
  describe('getMetricType', () => {
    describe('lower_is_better metrics', () => {
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

    describe('higher_is_better metrics', () => {
      it('should return higher_is_better for VERTICAL_JUMP', () => {
        expect(getMetricType('VERTICAL_JUMP')).toBe('higher_is_better');
      });

      it('should return higher_is_better for RSI', () => {
        expect(getMetricType('RSI')).toBe('higher_is_better');
      });

      it('should return higher_is_better for TOP_SPEED', () => {
        expect(getMetricType('TOP_SPEED')).toBe('higher_is_better');
      });
    });

    describe('tracking metrics', () => {
      it('should return tracking for HEIGHT', () => {
        expect(getMetricType('HEIGHT')).toBe('tracking');
      });

      it('should return tracking for WEIGHT', () => {
        expect(getMetricType('WEIGHT')).toBe('tracking');
      });
    });

    describe('unknown metrics', () => {
      it('should return higher_is_better as default for unknown metric', () => {
        // Default to higher_is_better as most custom metrics are performance metrics
        expect(getMetricType('UNKNOWN_METRIC')).toBe('higher_is_better');
      });
    });
  });

  describe('isTrackingMetric', () => {
    it('should return true for HEIGHT', () => {
      expect(isTrackingMetric('HEIGHT')).toBe(true);
    });

    it('should return true for WEIGHT', () => {
      expect(isTrackingMetric('WEIGHT')).toBe(true);
    });

    it('should return false for FLY10_TIME', () => {
      expect(isTrackingMetric('FLY10_TIME')).toBe(false);
    });

    it('should return false for VERTICAL_JUMP', () => {
      expect(isTrackingMetric('VERTICAL_JUMP')).toBe(false);
    });

    it('should return false for unknown metrics', () => {
      expect(isTrackingMetric('UNKNOWN_METRIC')).toBe(false);
    });
  });

  describe('isLowerIsBetter (backward compatibility)', () => {
    it('should return true for lower_is_better metrics', () => {
      expect(isLowerIsBetter('FLY10_TIME')).toBe(true);
      expect(isLowerIsBetter('DASH_40YD')).toBe(true);
    });

    it('should return false for higher_is_better metrics', () => {
      expect(isLowerIsBetter('VERTICAL_JUMP')).toBe(false);
      expect(isLowerIsBetter('TOP_SPEED')).toBe(false);
    });

    it('should return false for tracking metrics', () => {
      expect(isLowerIsBetter('HEIGHT')).toBe(false);
      expect(isLowerIsBetter('WEIGHT')).toBe(false);
    });

    it('should be implemented via getMetricType', () => {
      // Verify that isLowerIsBetter uses getMetricType internally
      const metric = 'FLY10_TIME';
      expect(isLowerIsBetter(metric)).toBe(getMetricType(metric) === 'lower_is_better');
    });
  });
});
