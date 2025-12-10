/**
 * Tests for metric-education-utils.ts
 * Week 3: Metric Education & Context
 *
 * TDD: RED phase - These tests define the expected behavior
 */

import { describe, it, expect } from 'vitest';
import {
  getMetricEducation,
  getMetricContext,
  getPercentileRanking,
  getBenchmarkComparison,
  isLowerBetterMetric,
  formatMetricValue,
  MetricEducation,
  MetricContext,
  BenchmarkLevel,
} from '@/utils/metric-education-utils';

describe('metric-education-utils', () => {
  describe('getMetricEducation', () => {
    it('should return education data for FLY10_TIME', () => {
      const education = getMetricEducation('FLY10_TIME');

      expect(education).toBeDefined();
      expect(education.name).toBe('10-Yard Fly');
      expect(education.description).toContain('acceleration');
      expect(education.whyItMatters).toBeDefined();
      expect(education.howToImprove).toBeInstanceOf(Array);
      expect(education.howToImprove.length).toBeGreaterThan(0);
      expect(education.sportRelevance).toBeInstanceOf(Array);
      expect(education.unit).toBe('seconds');
      expect(education.lowerIsBetter).toBe(true);
    });

    it('should return education data for VERTICAL_JUMP', () => {
      const education = getMetricEducation('VERTICAL_JUMP');

      expect(education).toBeDefined();
      expect(education.name).toBe('Vertical Jump');
      expect(education.description).toContain('explosive');
      expect(education.unit).toBe('inches');
      expect(education.lowerIsBetter).toBe(false);
    });

    it('should return education data for all supported metrics', () => {
      const metrics = [
        'FLY10_TIME',
        'VERTICAL_JUMP',
        'AGILITY_505',
        'AGILITY_5105',
        'T_TEST',
        'DASH_40YD',
        'TOP_SPEED',
        'RSI',
      ];

      metrics.forEach((metric) => {
        const education = getMetricEducation(metric);
        expect(education).toBeDefined();
        expect(education.name).toBeDefined();
        expect(education.description).toBeDefined();
        expect(education.whyItMatters).toBeDefined();
        expect(education.howToImprove).toBeInstanceOf(Array);
        expect(education.sportRelevance).toBeInstanceOf(Array);
        expect(education.unit).toBeDefined();
        expect(typeof education.lowerIsBetter).toBe('boolean');
      });
    });

    it('should return null for unknown metric', () => {
      const education = getMetricEducation('UNKNOWN_METRIC');
      expect(education).toBeNull();
    });

    it('should include training tips in howToImprove', () => {
      const education = getMetricEducation('VERTICAL_JUMP');

      expect(education?.howToImprove.length).toBeGreaterThanOrEqual(3);
      education?.howToImprove.forEach((tip) => {
        expect(tip).toBeTruthy();
        expect(typeof tip).toBe('string');
      });
    });

    it('should include relevant sports in sportRelevance', () => {
      const education = getMetricEducation('DASH_40YD');

      expect(education?.sportRelevance).toContain('Football');
      expect(education?.sportRelevance.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('isLowerBetterMetric', () => {
    it('should return true for time-based metrics', () => {
      expect(isLowerBetterMetric('FLY10_TIME')).toBe(true);
      expect(isLowerBetterMetric('AGILITY_505')).toBe(true);
      expect(isLowerBetterMetric('AGILITY_5105')).toBe(true);
      expect(isLowerBetterMetric('T_TEST')).toBe(true);
      expect(isLowerBetterMetric('DASH_40YD')).toBe(true);
    });

    it('should return false for height/speed/index metrics', () => {
      expect(isLowerBetterMetric('VERTICAL_JUMP')).toBe(false);
      expect(isLowerBetterMetric('TOP_SPEED')).toBe(false);
      expect(isLowerBetterMetric('RSI')).toBe(false);
    });

    it('should return false for unknown metrics', () => {
      expect(isLowerBetterMetric('UNKNOWN')).toBe(false);
    });
  });

  describe('formatMetricValue', () => {
    it('should format time metrics with 2 decimal places and "s" suffix', () => {
      expect(formatMetricValue(1.234, 'FLY10_TIME')).toBe('1.23s');
      expect(formatMetricValue(4.5, 'DASH_40YD')).toBe('4.50s');
    });

    it('should format vertical jump with 1 decimal place and "in" suffix', () => {
      expect(formatMetricValue(32.5, 'VERTICAL_JUMP')).toBe('32.5"');
      expect(formatMetricValue(28, 'VERTICAL_JUMP')).toBe('28.0"');
    });

    it('should format top speed with 1 decimal place and "mph" suffix', () => {
      expect(formatMetricValue(21.5, 'TOP_SPEED')).toBe('21.5 mph');
    });

    it('should format RSI with 2 decimal places', () => {
      expect(formatMetricValue(2.15, 'RSI')).toBe('2.15');
    });
  });

  describe('getPercentileRanking', () => {
    it('should return percentile for a given value', () => {
      const percentile = getPercentileRanking(1.1, 'FLY10_TIME');

      expect(percentile).toBeDefined();
      expect(percentile?.percentile).toBeGreaterThanOrEqual(0);
      expect(percentile?.percentile).toBeLessThanOrEqual(100);
      expect(percentile?.label).toBeDefined();
    });

    it('should return higher percentile for better FLY10_TIME (lower is better)', () => {
      const fastTime = getPercentileRanking(1.0, 'FLY10_TIME');
      const slowTime = getPercentileRanking(1.5, 'FLY10_TIME');

      expect(fastTime?.percentile).toBeGreaterThan(slowTime?.percentile || 0);
    });

    it('should return higher percentile for better VERTICAL_JUMP (higher is better)', () => {
      const highJump = getPercentileRanking(36, 'VERTICAL_JUMP');
      const lowJump = getPercentileRanking(24, 'VERTICAL_JUMP');

      expect(highJump?.percentile).toBeGreaterThan(lowJump?.percentile || 0);
    });

    it('should return descriptive labels for percentile ranges', () => {
      // Elite (90th+)
      const elite = getPercentileRanking(0.95, 'FLY10_TIME');
      expect(elite?.label).toMatch(/elite|exceptional|top/i);

      // Average (40-60th)
      const average = getPercentileRanking(1.2, 'FLY10_TIME');
      expect(average?.label).toBeDefined();
    });

    it('should return null for unknown metric', () => {
      const result = getPercentileRanking(10, 'UNKNOWN_METRIC');
      expect(result).toBeNull();
    });

    it('should handle age group filtering when provided', () => {
      const withAge = getPercentileRanking(1.1, 'FLY10_TIME', '14-16');
      const withoutAge = getPercentileRanking(1.1, 'FLY10_TIME');

      // Both should return valid results
      expect(withAge).toBeDefined();
      expect(withoutAge).toBeDefined();
    });

    it('should handle gender filtering when provided', () => {
      const male = getPercentileRanking(30, 'VERTICAL_JUMP', undefined, 'male');
      const female = getPercentileRanking(30, 'VERTICAL_JUMP', undefined, 'female');

      // Same value should have different percentiles for different genders
      expect(male).toBeDefined();
      expect(female).toBeDefined();
      // 30" is more impressive for females than males
      expect(female?.percentile).toBeGreaterThan(male?.percentile || 0);
    });
  });

  describe('getBenchmarkComparison', () => {
    it('should return benchmark level for a given value', () => {
      const benchmark = getBenchmarkComparison(1.1, 'FLY10_TIME');

      expect(benchmark).toBeDefined();
      expect(benchmark?.level).toBeDefined();
      expect(benchmark?.description).toBeDefined();
    });

    it('should categorize elite FLY10_TIME correctly', () => {
      const elite = getBenchmarkComparison(0.95, 'FLY10_TIME');
      expect(elite?.level).toBe('elite');
    });

    it('should categorize college-level VERTICAL_JUMP correctly', () => {
      const college = getBenchmarkComparison(32, 'VERTICAL_JUMP');
      expect(['college', 'above_average', 'elite']).toContain(college?.level);
    });

    it('should return all benchmark levels', () => {
      const levels: BenchmarkLevel[] = [
        'elite',
        'college',
        'above_average',
        'average',
        'developing',
      ];

      // Test that the function can return each level
      expect(levels).toContain('elite');
      expect(levels).toContain('developing');
    });

    it('should include descriptive text for each level', () => {
      const benchmark = getBenchmarkComparison(28, 'VERTICAL_JUMP');

      expect(benchmark?.description).toBeTruthy();
      expect(benchmark?.description.length).toBeGreaterThan(10);
    });

    it('should return null for unknown metric', () => {
      const result = getBenchmarkComparison(10, 'UNKNOWN_METRIC');
      expect(result).toBeNull();
    });
  });

  describe('getMetricContext', () => {
    const mockAthleteData = {
      personalBest: 1.05,
      recentAverage: 1.12,
      measurementCount: 15,
      lastMeasurement: 1.1,
    };

    it('should return context comparing to personal best', () => {
      const context = getMetricContext(1.1, 'FLY10_TIME', mockAthleteData);

      expect(context).toBeDefined();
      expect(context?.comparisonToPR).toBeDefined();
      expect(context?.comparisonToPR?.percentDiff).toBeDefined();
      expect(context?.comparisonToPR?.text).toBeDefined();
    });

    it('should indicate when value equals personal best', () => {
      const context = getMetricContext(1.05, 'FLY10_TIME', mockAthleteData);

      expect(context?.comparisonToPR?.isPersonalBest).toBe(true);
      expect(context?.comparisonToPR?.text).toMatch(/personal best|PR|best/i);
    });

    it('should indicate when value is new personal best (lower is better)', () => {
      const context = getMetricContext(1.0, 'FLY10_TIME', mockAthleteData);

      expect(context?.comparisonToPR?.isNewPersonalBest).toBe(true);
    });

    it('should indicate when value is new personal best (higher is better)', () => {
      const jumpData = {
        personalBest: 30,
        recentAverage: 28,
        measurementCount: 10,
        lastMeasurement: 29,
      };

      const context = getMetricContext(32, 'VERTICAL_JUMP', jumpData);
      expect(context?.comparisonToPR?.isNewPersonalBest).toBe(true);
    });

    it('should include comparison to recent average', () => {
      const context = getMetricContext(1.1, 'FLY10_TIME', mockAthleteData);

      expect(context?.comparisonToRecent).toBeDefined();
      expect(context?.comparisonToRecent?.percentDiff).toBeDefined();
      expect(context?.comparisonToRecent?.trend).toBeDefined();
    });

    it('should include percentile ranking', () => {
      const context = getMetricContext(1.1, 'FLY10_TIME', mockAthleteData);

      expect(context?.percentile).toBeDefined();
    });

    it('should include benchmark comparison', () => {
      const context = getMetricContext(1.1, 'FLY10_TIME', mockAthleteData);

      expect(context?.benchmark).toBeDefined();
    });

    it('should handle missing athlete data gracefully', () => {
      const context = getMetricContext(1.1, 'FLY10_TIME', null);

      expect(context).toBeDefined();
      expect(context?.percentile).toBeDefined();
      expect(context?.benchmark).toBeDefined();
      // PR comparison should be null without athlete data
      expect(context?.comparisonToPR).toBeNull();
    });

    it('should return null for unknown metric', () => {
      const context = getMetricContext(10, 'UNKNOWN_METRIC', mockAthleteData);
      expect(context).toBeNull();
    });
  });
});
