/**
 * Tests for metric trend calculation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMetricTrend,
  getSparklineData,
  getBestValue,
  type TrendDirection,
} from '@/utils/metric-trend-utils';
import { isLowerBetter as isLowerIsBetter } from '@/constants/metrics';

describe('metric-trend-utils', () => {
  describe('isLowerIsBetter', () => {
    it('should identify time-based metrics as lower is better', () => {
      expect(isLowerIsBetter('FLY10_TIME')).toBe(true);
      expect(isLowerIsBetter('DASH_40YD')).toBe(true);
      expect(isLowerIsBetter('AGILITY_505')).toBe(true);
      expect(isLowerIsBetter('T_TEST')).toBe(true);
    });

    it('should identify distance/height metrics as higher is better', () => {
      expect(isLowerIsBetter('VERTICAL_JUMP')).toBe(false);
      expect(isLowerIsBetter('TOP_SPEED')).toBe(false);
      expect(isLowerIsBetter('RSI')).toBe(false);
    });
  });

  describe('calculateMetricTrend', () => {
    describe('Time-based metrics (lower is better)', () => {
      it('should detect improving trend when times decrease', () => {
        const measurements = [
          { value: 1.40, date: '2024-01-15' }, // Most recent, better
          { value: 1.42, date: '2024-01-10' },
          { value: 1.45, date: '2024-01-05' },
          { value: 1.48, date: '2024-01-01' },
          { value: 1.50, date: '2023-12-28' },
          { value: 1.52, date: '2023-12-25' },
          { value: 1.55, date: '2023-12-20' },
          { value: 1.58, date: '2023-12-15' }, // Oldest, worse
        ];

        const trend = calculateMetricTrend(measurements, 'FLY10_TIME');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('improving');
        expect(trend?.percentChange).toBeGreaterThan(5); // Significant improvement
        expect(trend?.comparisonText).toContain('↑');
        expect(trend?.comparisonText).toContain('better');
      });

      it('should detect declining trend when times increase', () => {
        const measurements = [
          { value: 1.58, date: '2024-01-15' }, // Most recent, worse
          { value: 1.55, date: '2024-01-10' },
          { value: 1.52, date: '2024-01-05' },
          { value: 1.50, date: '2024-01-01' },
          { value: 1.48, date: '2023-12-28' },
          { value: 1.45, date: '2023-12-25' },
          { value: 1.42, date: '2023-12-20' },
          { value: 1.40, date: '2023-12-15' }, // Oldest, better
        ];

        const trend = calculateMetricTrend(measurements, 'FLY10_TIME');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('declining');
        expect(trend?.percentChange).toBeGreaterThan(5);
        expect(trend?.comparisonText).toContain('↓');
        expect(trend?.comparisonText).toContain('worse');
      });

      it('should detect steady trend when change is < 5%', () => {
        const measurements = [
          { value: 1.50, date: '2024-01-15' },
          { value: 1.49, date: '2024-01-10' },
          { value: 1.51, date: '2024-01-05' },
          { value: 1.50, date: '2024-01-01' },
          { value: 1.52, date: '2023-12-28' },
          { value: 1.51, date: '2023-12-25' },
          { value: 1.50, date: '2023-12-20' },
        ];

        const trend = calculateMetricTrend(measurements, 'FLY10_TIME');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('steady');
        expect(trend?.percentChange).toBeLessThan(5);
        expect(trend?.comparisonText).toContain('Steady');
      });
    });

    describe('Distance/height metrics (higher is better)', () => {
      it('should detect improving trend when values increase', () => {
        const measurements = [
          { value: 35.0, date: '2024-01-15' }, // Most recent, better
          { value: 34.5, date: '2024-01-10' },
          { value: 34.0, date: '2024-01-05' },
          { value: 33.5, date: '2024-01-01' },
          { value: 33.0, date: '2023-12-28' },
          { value: 32.5, date: '2023-12-25' },
          { value: 32.0, date: '2023-12-20' },
          { value: 31.5, date: '2023-12-15' }, // Oldest, worse
        ];

        const trend = calculateMetricTrend(measurements, 'VERTICAL_JUMP');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('improving');
        expect(trend?.percentChange).toBeGreaterThan(5);
        expect(trend?.comparisonText).toContain('↑');
        expect(trend?.comparisonText).toContain('better');
      });

      it('should detect declining trend when values decrease', () => {
        const measurements = [
          { value: 31.5, date: '2024-01-15' }, // Most recent, worse
          { value: 32.0, date: '2024-01-10' },
          { value: 32.5, date: '2024-01-05' },
          { value: 33.0, date: '2024-01-01' },
          { value: 33.5, date: '2023-12-28' },
          { value: 34.0, date: '2023-12-25' },
          { value: 34.5, date: '2023-12-20' },
          { value: 35.0, date: '2023-12-15' }, // Oldest, better
        ];

        const trend = calculateMetricTrend(measurements, 'VERTICAL_JUMP');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('declining');
        expect(trend?.percentChange).toBeGreaterThan(5);
        expect(trend?.comparisonText).toContain('↓');
        expect(trend?.comparisonText).toContain('worse');
      });
    });

    describe('Edge cases', () => {
      it('should return null for empty measurements', () => {
        const trend = calculateMetricTrend([], 'FLY10_TIME');
        expect(trend).toBeNull();
      });

      it('should return null for single measurement', () => {
        const measurements = [{ value: 1.50, date: '2024-01-15' }];
        const trend = calculateMetricTrend(measurements, 'FLY10_TIME');
        expect(trend).toBeNull();
      });

      it('should handle exactly 2 measurements', () => {
        const measurements = [
          { value: 1.40, date: '2024-01-15' },
          { value: 1.50, date: '2024-01-10' },
        ];

        const trend = calculateMetricTrend(measurements, 'FLY10_TIME');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('improving'); // Time decreased
      });

      it('should handle < 10 measurements gracefully', () => {
        const measurements = [
          { value: 1.40, date: '2024-01-15' },
          { value: 1.48, date: '2024-01-10' },
          { value: 1.60, date: '2024-01-05' },
          { value: 1.68, date: '2024-01-01' },
        ];

        const trend = calculateMetricTrend(measurements, 'FLY10_TIME');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('improving'); // Significant improvement
      });

      it('should handle string values', () => {
        const measurements = [
          { value: '1.40', date: '2024-01-15' },
          { value: '1.50', date: '2024-01-10' },
        ];

        const trend = calculateMetricTrend(measurements, 'FLY10_TIME');

        expect(trend).not.toBeNull();
        expect(trend?.trend).toBe('improving');
      });
    });
  });

  describe('getSparklineData', () => {
    it('should return last N measurements sorted by date (oldest to newest)', () => {
      const measurements = [
        { value: 1.40, date: '2024-01-15' },
        { value: 1.45, date: '2024-01-10' },
        { value: 1.50, date: '2024-01-05' },
        { value: 1.55, date: '2024-01-01' },
      ];

      const sparklineData = getSparklineData(measurements, 4);

      // Should be sorted oldest to newest for charting
      expect(sparklineData).toEqual([1.55, 1.50, 1.45, 1.40]);
    });

    it('should limit to specified count', () => {
      const measurements = [
        { value: 1.40, date: '2024-01-15' },
        { value: 1.45, date: '2024-01-10' },
        { value: 1.50, date: '2024-01-05' },
        { value: 1.55, date: '2024-01-01' },
        { value: 1.60, date: '2023-12-28' },
      ];

      const sparklineData = getSparklineData(measurements, 3);

      // Should return last 3 measurements
      expect(sparklineData).toHaveLength(3);
      expect(sparklineData).toEqual([1.50, 1.45, 1.40]);
    });

    it('should default to 10 measurements', () => {
      const measurements = Array.from({ length: 15 }, (_, i) => ({
        value: 1.4 + i * 0.01,
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      }));

      const sparklineData = getSparklineData(measurements);

      expect(sparklineData).toHaveLength(10);
    });

    it('should handle fewer measurements than requested', () => {
      const measurements = [
        { value: 1.40, date: '2024-01-15' },
        { value: 1.45, date: '2024-01-10' },
      ];

      const sparklineData = getSparklineData(measurements, 10);

      expect(sparklineData).toHaveLength(2);
    });
  });

  describe('getBestValue', () => {
    it('should return minimum for time-based metrics', () => {
      const measurements = [
        { value: 1.50, date: '2024-01-15' },
        { value: 1.40, date: '2024-01-10' },
        { value: 1.45, date: '2024-01-05' },
      ];

      const best = getBestValue(measurements, 'FLY10_TIME');

      expect(best).toBe(1.40);
    });

    it('should return maximum for distance/height metrics', () => {
      const measurements = [
        { value: 32.0, date: '2024-01-15' },
        { value: 35.0, date: '2024-01-10' },
        { value: 33.5, date: '2024-01-05' },
      ];

      const best = getBestValue(measurements, 'VERTICAL_JUMP');

      expect(best).toBe(35.0);
    });

    it('should return null for empty measurements', () => {
      const best = getBestValue([], 'FLY10_TIME');

      expect(best).toBeNull();
    });

    it('should handle string values', () => {
      const measurements = [
        { value: '1.50', date: '2024-01-15' },
        { value: '1.40', date: '2024-01-10' },
      ];

      const best = getBestValue(measurements, 'FLY10_TIME');

      expect(best).toBe(1.40);
    });
  });
});
