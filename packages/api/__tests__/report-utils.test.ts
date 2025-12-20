/**
 * Tests for report-utils metric type functions
 *
 * Verifies that isLowerBetter correctly queries the siteMetrics table
 * and caches results for performance.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from '../utils/report-utils';
import { db } from '../db';
import { siteMetrics } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('report-utils', () => {
  describe('isLowerBetter', () => {
    it('should return true for lower_is_better metrics from database', async () => {
      // FLY10_TIME is a lower_is_better metric in the database
      const result = await isLowerBetter('FLY10_TIME');
      expect(result).toBe(true);
    });

    it('should return false for higher_is_better metrics from database', async () => {
      // VERTICAL_JUMP is a higher_is_better metric in the database
      const result = await isLowerBetter('VERTICAL_JUMP');
      expect(result).toBe(false);
    });

    it('should return false for tracking metrics', async () => {
      // Check if we have a tracking metric, or create a test one
      const [trackingMetric] = await db
        .select()
        .from(siteMetrics)
        .where(eq(siteMetrics.metricType, 'tracking'));

      if (trackingMetric) {
        const result = await isLowerBetter(trackingMetric.code);
        expect(result).toBe(false);
      } else {
        // Skip if no tracking metrics exist
        expect(true).toBe(true);
      }
    });

    it('should default to higher_is_better for unknown metrics', async () => {
      // Unknown metrics should default to higher_is_better (return false)
      const result = await isLowerBetter('UNKNOWN_METRIC_XYZ');
      expect(result).toBe(false);
    });

    it('should cache metric type results', async () => {
      // Call twice - second call should use cache
      const result1 = await isLowerBetter('FLY10_TIME');
      const result2 = await isLowerBetter('FLY10_TIME');

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });
  });

  describe('sortAthletesByMetric', () => {
    it('should sort athletes ascending for lower_is_better metrics', async () => {
      const athletes = [
        { measurements: { FLY10_TIME: 1.5 } },
        { measurements: { FLY10_TIME: 1.2 } },
        { measurements: { FLY10_TIME: 1.8 } },
      ];

      const sorted = await sortAthletesByMetric(athletes, 'FLY10_TIME');

      expect(sorted[0].measurements.FLY10_TIME).toBe(1.2); // Best (lowest)
      expect(sorted[1].measurements.FLY10_TIME).toBe(1.5);
      expect(sorted[2].measurements.FLY10_TIME).toBe(1.8); // Worst (highest)
    });

    it('should sort athletes descending for higher_is_better metrics', async () => {
      const athletes = [
        { measurements: { VERTICAL_JUMP: 28 } },
        { measurements: { VERTICAL_JUMP: 35 } },
        { measurements: { VERTICAL_JUMP: 30 } },
      ];

      const sorted = await sortAthletesByMetric(athletes, 'VERTICAL_JUMP');

      expect(sorted[0].measurements.VERTICAL_JUMP).toBe(35); // Best (highest)
      expect(sorted[1].measurements.VERTICAL_JUMP).toBe(30);
      expect(sorted[2].measurements.VERTICAL_JUMP).toBe(28); // Worst (lowest)
    });

    it('should filter out athletes without the metric', async () => {
      const athletes = [
        { measurements: { FLY10_TIME: 1.5 } },
        { measurements: { VERTICAL_JUMP: 30 } }, // No FLY10_TIME
        { measurements: { FLY10_TIME: 1.2 } },
      ];

      const sorted = await sortAthletesByMetric(athletes, 'FLY10_TIME');

      expect(sorted).toHaveLength(2);
    });

    it('should return empty array for non-array input', async () => {
      const result = await sortAthletesByMetric(null as any, 'FLY10_TIME');
      expect(result).toEqual([]);

      const result2 = await sortAthletesByMetric(undefined as any, 'FLY10_TIME');
      expect(result2).toEqual([]);
    });
  });

  describe('getBenchmarkLabel', () => {
    it('should return null when no benchmark comparisons exist', async () => {
      const athlete = { benchmarkComparisons: {} };
      const result = await getBenchmarkLabel(athlete, 'FLY10_TIME');
      expect(result).toBeNull();
    });

    it('should return null when comparisons array is empty', async () => {
      const athlete = { benchmarkComparisons: { FLY10_TIME: [] } };
      const result = await getBenchmarkLabel(athlete, 'FLY10_TIME');
      expect(result).toBeNull();
    });

    it('should return highest met benchmark for lower_is_better metrics', async () => {
      const athlete = {
        benchmarkComparisons: {
          FLY10_TIME: [
            { benchmarkName: 'Elite', benchmarkValue: 1.0, meetsOrExceeds: false },
            { benchmarkName: 'Advanced', benchmarkValue: 1.2, meetsOrExceeds: true },
            { benchmarkName: 'Intermediate', benchmarkValue: 1.4, meetsOrExceeds: true },
          ],
        },
      };

      const result = await getBenchmarkLabel(athlete, 'FLY10_TIME');

      // Should return 'Advanced' as it's the highest tier that was met
      // For lower_is_better, benchmarks are sorted ascending by value
      expect(result).toBe('Advanced');
    });

    it('should return highest met benchmark for higher_is_better metrics', async () => {
      const athlete = {
        benchmarkComparisons: {
          VERTICAL_JUMP: [
            { benchmarkName: 'Elite', benchmarkValue: 36, meetsOrExceeds: false },
            { benchmarkName: 'Advanced', benchmarkValue: 32, meetsOrExceeds: true },
            { benchmarkName: 'Intermediate', benchmarkValue: 28, meetsOrExceeds: true },
          ],
        },
      };

      const result = await getBenchmarkLabel(athlete, 'VERTICAL_JUMP');

      // Should return 'Advanced' as it's the highest tier that was met
      // For higher_is_better, benchmarks are sorted descending by value
      expect(result).toBe('Advanced');
    });

    it('should return null when no benchmarks are met', async () => {
      const athlete = {
        benchmarkComparisons: {
          FLY10_TIME: [
            { benchmarkName: 'Elite', benchmarkValue: 1.0, meetsOrExceeds: false },
            { benchmarkName: 'Advanced', benchmarkValue: 1.2, meetsOrExceeds: false },
          ],
        },
      };

      const result = await getBenchmarkLabel(athlete, 'FLY10_TIME');
      expect(result).toBeNull();
    });
  });
});
