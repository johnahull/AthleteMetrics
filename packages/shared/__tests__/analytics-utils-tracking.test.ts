import { describe, it, expect } from 'vitest';
import { getBestPerformanceValue, filterToBestMeasurements } from '../analytics-utils';
import type { StatisticalSummary, ChartDataPoint } from '../analytics-types';

/**
 * Test suite for analytics-utils with tracking metrics
 * Part of TDD implementation for tracking metrics (HEIGHT, WEIGHT, etc.)
 */
describe('Analytics Utils with Tracking Metrics', () => {
  describe('getBestPerformanceValue', () => {
    const mockStats: StatisticalSummary = {
      count: 10,
      mean: 5.0,
      median: 5.0,
      min: 3.0,
      max: 7.0,
      std: 1.0,
      variance: 1.0,
      percentiles: {
        p5: 3.2,
        p10: 3.5,
        p25: 4.0,
        p50: 5.0,
        p75: 6.0,
        p90: 6.5,
        p95: 6.8,
      },
    };

    it('should return min for lower_is_better metrics', () => {
      const result = getBestPerformanceValue('FLY10_TIME', mockStats);
      expect(result).toBe(3.0); // min value
    });

    it('should return max for higher_is_better metrics', () => {
      const result = getBestPerformanceValue('VERTICAL_JUMP', mockStats);
      expect(result).toBe(7.0); // max value
    });

    it('should return max (latest) for tracking metrics', () => {
      // For tracking metrics, we return the max as a proxy for "latest"
      // In real usage, we'd want the most recent value by date
      const result = getBestPerformanceValue('HEIGHT', mockStats);
      expect(result).toBe(7.0); // max value (as proxy for latest)
    });

    it('should return 0 for empty stats', () => {
      const emptyStats: StatisticalSummary = {
        count: 0,
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        std: 0,
        variance: 0,
        percentiles: { p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 },
      };
      expect(getBestPerformanceValue('FLY10_TIME', emptyStats)).toBe(0);
    });
  });

  describe('filterToBestMeasurements', () => {
    const mockData: ChartDataPoint[] = [
      {
        athleteId: 'athlete1',
        athleteName: 'John Doe',
        metric: 'FLY10_TIME',
        value: 1.2,
        date: new Date('2024-01-01'),
      },
      {
        athleteId: 'athlete1',
        athleteName: 'John Doe',
        metric: 'FLY10_TIME',
        value: 1.1, // Better (lower is better)
        date: new Date('2024-01-15'),
      },
      {
        athleteId: 'athlete2',
        athleteName: 'Jane Smith',
        metric: 'VERTICAL_JUMP',
        value: 24,
        date: new Date('2024-01-01'),
      },
      {
        athleteId: 'athlete2',
        athleteName: 'Jane Smith',
        metric: 'VERTICAL_JUMP',
        value: 26, // Better (higher is better)
        date: new Date('2024-01-15'),
      },
      {
        athleteId: 'athlete3',
        athleteName: 'Bob Johnson',
        metric: 'HEIGHT',
        value: 70,
        date: new Date('2024-01-01'),
      },
      {
        athleteId: 'athlete3',
        athleteName: 'Bob Johnson',
        metric: 'HEIGHT',
        value: 71, // Latest (tracking, use max as proxy)
        date: new Date('2024-01-15'),
      },
    ];

    it('should return minimum value for lower_is_better metrics', () => {
      const result = filterToBestMeasurements(mockData);
      const athlete1 = result.find(d => d.athleteId === 'athlete1');
      expect(athlete1?.value).toBe(1.1); // Minimum time
    });

    it('should return maximum value for higher_is_better metrics', () => {
      const result = filterToBestMeasurements(mockData);
      const athlete2 = result.find(d => d.athleteId === 'athlete2');
      expect(athlete2?.value).toBe(26); // Maximum height
    });

    it('should return maximum (latest proxy) value for tracking metrics', () => {
      const result = filterToBestMeasurements(mockData);
      const athlete3 = result.find(d => d.athleteId === 'athlete3');
      expect(athlete3?.value).toBe(71); // Latest height (using max as proxy)
    });

    it('should handle empty data array', () => {
      const result = filterToBestMeasurements([]);
      expect(result).toEqual([]);
    });

    it('should handle single measurement per athlete', () => {
      const singleData: ChartDataPoint[] = [
        {
          athleteId: 'athlete1',
          athleteName: 'John Doe',
          metric: 'HEIGHT',
          value: 70,
          date: new Date('2024-01-01'),
        },
      ];
      const result = filterToBestMeasurements(singleData);
      expect(result.length).toBe(1);
      expect(result[0].value).toBe(70);
    });
  });
});
