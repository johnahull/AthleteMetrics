/**
 * Unit tests for statistics calculation utility
 * Following TDD approach: tests written first, then implementation
 */

import { describe, it, expect } from 'vitest';
import { calculateStatistics } from '../statistics';

describe('calculateStatistics', () => {
  describe('Edge Cases', () => {
    it('should handle empty array', () => {
      const result = calculateStatistics([]);

      expect(result.count).toBe(0);
      expect(result.mean).toBe(0);
      expect(result.median).toBe(0);
      expect(result.stdDev).toBe(0);
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.q1).toBe(0);
      expect(result.q3).toBe(0);
      expect(result.iqr).toBe(0);
    });

    it('should handle single value', () => {
      const result = calculateStatistics([5.5]);

      expect(result.count).toBe(1);
      expect(result.mean).toBe(5.5);
      expect(result.median).toBe(5.5);
      expect(result.stdDev).toBe(0);
      expect(result.min).toBe(5.5);
      expect(result.max).toBe(5.5);
      expect(result.q1).toBe(5.5);
      expect(result.q3).toBe(5.5);
      expect(result.iqr).toBe(0);
    });

    it('should handle two values', () => {
      const result = calculateStatistics([3.0, 7.0]);

      expect(result.count).toBe(2);
      expect(result.mean).toBe(5.0);
      expect(result.median).toBe(5.0);
      expect(result.min).toBe(3.0);
      expect(result.max).toBe(7.0);
      expect(result.q1).toBe(3.0);
      expect(result.q3).toBe(7.0);
      expect(result.iqr).toBe(4.0);
      // Standard deviation for two values: sqrt(((3-5)^2 + (7-5)^2) / 2) = sqrt(8/2) = 2.0
      expect(result.stdDev).toBeCloseTo(2.0, 2);
    });
  });

  describe('Normal Cases', () => {
    it('should calculate statistics for 5 values', () => {
      const values = [1.0, 2.0, 3.0, 4.0, 5.0];
      const result = calculateStatistics(values);

      expect(result.count).toBe(5);
      expect(result.mean).toBe(3.0);
      expect(result.median).toBe(3.0);
      expect(result.min).toBe(1.0);
      expect(result.max).toBe(5.0);
      // For 5 values: Q1 at position 1 (25%), Q3 at position 3 (75%)
      expect(result.q1).toBe(2.0);
      expect(result.q3).toBe(4.0);
      expect(result.iqr).toBe(2.0);
      // Standard deviation: sqrt(sum((x - mean)^2) / n)
      // sqrt(((1-3)^2 + (2-3)^2 + (3-3)^2 + (4-3)^2 + (5-3)^2) / 5)
      // sqrt((4 + 1 + 0 + 1 + 4) / 5) = sqrt(10/5) = sqrt(2) ≈ 1.414
      expect(result.stdDev).toBeCloseTo(1.414, 2);
    });

    it('should calculate statistics for 10 values', () => {
      const values = [1.2, 2.3, 3.4, 4.5, 5.6, 6.7, 7.8, 8.9, 9.0, 10.1];
      const result = calculateStatistics(values);

      expect(result.count).toBe(10);
      expect(result.mean).toBeCloseTo(5.95, 2);
      expect(result.median).toBeCloseTo(6.15, 2); // Average of 5.6 and 6.7
      expect(result.min).toBe(1.2);
      expect(result.max).toBe(10.1);
      expect(result.q1).toBeCloseTo(3.4, 2); // 25th percentile
      expect(result.q3).toBeCloseTo(8.9, 2); // 75th percentile
      expect(result.iqr).toBeCloseTo(5.5, 2);
      expect(result.stdDev).toBeGreaterThan(0);
    });

    it('should handle unsorted values', () => {
      const values = [5.0, 1.0, 4.0, 2.0, 3.0];
      const result = calculateStatistics(values);

      expect(result.count).toBe(5);
      expect(result.mean).toBe(3.0);
      expect(result.median).toBe(3.0);
      expect(result.min).toBe(1.0);
      expect(result.max).toBe(5.0);
      expect(result.q1).toBe(2.0);
      expect(result.q3).toBe(4.0);
    });

    it('should handle duplicate values', () => {
      const values = [2.0, 2.0, 3.0, 3.0, 3.0, 4.0, 4.0];
      const result = calculateStatistics(values);

      expect(result.count).toBe(7);
      expect(result.mean).toBeCloseTo(3.0, 2);
      expect(result.median).toBe(3.0);
      expect(result.min).toBe(2.0);
      expect(result.max).toBe(4.0);
    });

    it('should handle decimal values with precision', () => {
      const values = [1.234, 2.345, 3.456, 4.567, 5.678];
      const result = calculateStatistics(values);

      expect(result.count).toBe(5);
      expect(result.mean).toBeCloseTo(3.456, 3);
      expect(result.median).toBeCloseTo(3.456, 3);
      expect(result.min).toBeCloseTo(1.234, 3);
      expect(result.max).toBeCloseTo(5.678, 3);
    });
  });

  describe('Standard Deviation Calculation', () => {
    it('should calculate correct standard deviation for known dataset', () => {
      // Dataset: [2, 4, 4, 4, 5, 5, 7, 9]
      // Mean = 5
      // Variance = ((2-5)^2 + (4-5)^2*3 + (5-5)^2*2 + (7-5)^2 + (9-5)^2) / 8
      //          = (9 + 3 + 0 + 4 + 16) / 8 = 32/8 = 4
      // StdDev = sqrt(4) = 2.0
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const result = calculateStatistics(values);

      expect(result.mean).toBe(5);
      expect(result.stdDev).toBeCloseTo(2.0, 2);
    });

    it('should return zero standard deviation for identical values', () => {
      const values = [5.0, 5.0, 5.0, 5.0, 5.0];
      const result = calculateStatistics(values);

      expect(result.stdDev).toBe(0);
      expect(result.iqr).toBe(0);
    });
  });

  describe('Quartile Calculation', () => {
    it('should calculate quartiles using correct method', () => {
      // Using median-inclusive quartile method (aligned with boxPlotStatistics.ts)
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const result = calculateStatistics(values);

      expect(result.median).toBe(5);
      expect(result.q1).toBe(3); // 25th percentile
      expect(result.q3).toBe(7); // 75th percentile
      expect(result.iqr).toBe(4);
    });

    it('should calculate IQR correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = calculateStatistics(values);

      expect(result.iqr).toBe(result.q3 - result.q1);
      expect(result.iqr).toBeGreaterThan(0);
    });
  });

  describe('Real-world Athletic Data', () => {
    it('should handle vertical jump measurements (inches)', () => {
      const verticalJumps = [28.5, 30.2, 32.1, 29.8, 31.5, 33.0, 27.9, 30.5];
      const result = calculateStatistics(verticalJumps);

      expect(result.count).toBe(8);
      expect(result.mean).toBeCloseTo(30.44, 2);
      expect(result.min).toBe(27.9);
      expect(result.max).toBe(33.0);
      expect(result.stdDev).toBeGreaterThan(0);
    });

    it('should handle 10-yard fly times (seconds)', () => {
      const flyTimes = [1.05, 1.12, 1.08, 1.15, 1.10, 1.06, 1.09, 1.13];
      const result = calculateStatistics(flyTimes);

      expect(result.count).toBe(8);
      expect(result.mean).toBeCloseTo(1.0975, 4);
      expect(result.min).toBe(1.05);
      expect(result.max).toBe(1.15);
      expect(result.median).toBeGreaterThan(result.min);
      expect(result.median).toBeLessThan(result.max);
    });
  });
});
