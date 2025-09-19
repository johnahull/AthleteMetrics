import { describe, it, expect } from 'vitest';
import { calculateStatistics, filterToBestMeasurements, filterToBestMeasurementsPerDate, validateAnalyticsFilters } from '../analytics-utils';
import type { ChartDataPoint, AnalyticsFilters } from '../analytics-types';

describe('Analytics Utilities', () => {
  describe('calculateStatistics', () => {
    it('should handle empty array', () => {
      const result = calculateStatistics([]);
      expect(result.count).toBe(0);
      expect(result.mean).toBe(0);
      expect(result.median).toBe(0);
      expect(result.std).toBe(0);
    });

    it('should calculate correct statistics for single value', () => {
      const result = calculateStatistics([5]);
      expect(result.count).toBe(1);
      expect(result.mean).toBe(5);
      expect(result.median).toBe(5);
      expect(result.min).toBe(5);
      expect(result.max).toBe(5);
      expect(result.std).toBe(0);
    });

    it('should calculate correct statistics for multiple values', () => {
      const values = [1, 2, 3, 4, 5];
      const result = calculateStatistics(values);

      expect(result.count).toBe(5);
      expect(result.mean).toBe(3);
      expect(result.median).toBe(3);
      expect(result.min).toBe(1);
      expect(result.max).toBe(5);
      expect(result.std).toBeCloseTo(1.414, 2);
    });

    it('should calculate median correctly for even number of values', () => {
      const values = [1, 2, 3, 4];
      const result = calculateStatistics(values);

      expect(result.median).toBe(2.5);
    });

    it('should calculate median correctly for odd number of values', () => {
      const values = [1, 2, 3, 4, 5];
      const result = calculateStatistics(values);

      expect(result.median).toBe(3);
    });

    it('should handle unsorted input correctly', () => {
      const values = [5, 1, 3, 2, 4];
      const result = calculateStatistics(values);

      expect(result.mean).toBe(3);
      expect(result.median).toBe(3);
      expect(result.min).toBe(1);
      expect(result.max).toBe(5);
    });

    it('should calculate percentiles correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = calculateStatistics(values);

      expect(result.percentiles.p25).toBeCloseTo(3.25, 1);
      expect(result.percentiles.p50).toBe(5.5); // Same as median
      expect(result.percentiles.p75).toBeCloseTo(7.75, 1);
    });

    it('should handle athletic performance data realistically', () => {
      // Simulated 40-yard dash times (seconds)
      const dashTimes = [4.3, 4.5, 4.7, 4.9, 5.1, 5.3, 5.5, 5.7];
      const result = calculateStatistics(dashTimes);

      expect(result.count).toBe(8);
      expect(result.mean).toBeCloseTo(5.0, 1);
      expect(result.min).toBe(4.3);
      expect(result.max).toBe(5.7);
      expect(result.std).toBeGreaterThan(0);
    });

    it('should handle decimal precision correctly', () => {
      const values = [1.111, 2.222, 3.333];
      const result = calculateStatistics(values);

      expect(result.mean).toBeCloseTo(2.222, 3);
      expect(result.median).toBeCloseTo(2.222, 3);
    });
  });

  describe('filterToBestMeasurements', () => {
    const createMockDataPoint = (
      athleteId: string,
      metric: string,
      value: number,
      date: Date = new Date('2024-01-01')
    ): ChartDataPoint => ({
      athleteId,
      athleteName: `Athlete ${athleteId}`,
      metric,
      value,
      date,
      teamName: 'Team A'
    });

    it('should return empty array for empty input', () => {
      const result = filterToBestMeasurements([]);
      expect(result).toEqual([]);
    });

    it('should handle single measurement', () => {
      const data = [createMockDataPoint('1', 'VERTICAL_JUMP', 30)];
      const result = filterToBestMeasurements(data);
      expect(result).toEqual(data);
    });

    it('should filter to best measurement per athlete for higher-is-better metric', () => {
      const data = [
        createMockDataPoint('1', 'VERTICAL_JUMP', 30),
        createMockDataPoint('1', 'VERTICAL_JUMP', 35), // Best
        createMockDataPoint('1', 'VERTICAL_JUMP', 28),
        createMockDataPoint('2', 'VERTICAL_JUMP', 25),
        createMockDataPoint('2', 'VERTICAL_JUMP', 32), // Best
      ];

      const result = filterToBestMeasurements(data);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.athleteId === '1')?.value).toBe(35);
      expect(result.find(r => r.athleteId === '2')?.value).toBe(32);
    });

    it('should filter to best measurement per athlete for lower-is-better metric', () => {
      const data = [
        createMockDataPoint('1', 'DASH_40YD', 4.8),
        createMockDataPoint('1', 'DASH_40YD', 4.5), // Best (lower)
        createMockDataPoint('1', 'DASH_40YD', 4.9),
        createMockDataPoint('2', 'DASH_40YD', 5.2),
        createMockDataPoint('2', 'DASH_40YD', 4.9), // Best (lower)
      ];

      const result = filterToBestMeasurements(data);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.athleteId === '1')?.value).toBe(4.5);
      expect(result.find(r => r.athleteId === '2')?.value).toBe(4.9);
    });

    it('should handle mixed metrics correctly', () => {
      const data = [
        createMockDataPoint('1', 'VERTICAL_JUMP', 30),
        createMockDataPoint('1', 'VERTICAL_JUMP', 35), // Best
        createMockDataPoint('1', 'DASH_40YD', 4.8),
        createMockDataPoint('1', 'DASH_40YD', 4.5), // Best
      ];

      const result = filterToBestMeasurements(data);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.metric === 'VERTICAL_JUMP')?.value).toBe(35);
      expect(result.find(r => r.metric === 'DASH_40YD')?.value).toBe(4.5);
    });

    it('should handle string values by converting to numbers', () => {
      const data = [
        { ...createMockDataPoint('1', 'VERTICAL_JUMP', 0), value: '30' as any },
        { ...createMockDataPoint('1', 'VERTICAL_JUMP', 0), value: '35' as any }, // Best
        { ...createMockDataPoint('1', 'VERTICAL_JUMP', 0), value: '28' as any },
      ];

      const result = filterToBestMeasurements(data);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('35');
    });
  });

  describe('filterToBestMeasurementsPerDate', () => {
    const createMockDataPointWithDate = (
      athleteId: string,
      metric: string,
      value: number,
      dateStr: string
    ): ChartDataPoint => ({
      athleteId,
      athleteName: `Athlete ${athleteId}`,
      metric,
      value,
      date: new Date(dateStr),
      teamName: 'Team A'
    });

    it('should return empty array for empty input', () => {
      const result = filterToBestMeasurementsPerDate([]);
      expect(result).toEqual([]);
    });

    it('should filter to best measurement per athlete per date', () => {
      const data = [
        createMockDataPointWithDate('1', 'VERTICAL_JUMP', 30, '2024-01-01'),
        createMockDataPointWithDate('1', 'VERTICAL_JUMP', 35, '2024-01-01'), // Best on this date
        createMockDataPointWithDate('1', 'VERTICAL_JUMP', 32, '2024-01-02'),
        createMockDataPointWithDate('1', 'VERTICAL_JUMP', 36, '2024-01-02'), // Best on this date
      ];

      const result = filterToBestMeasurementsPerDate(data);
      expect(result).toHaveLength(2);

      const jan01Result = result.find(r => r.date.toISOString().startsWith('2024-01-01'));
      const jan02Result = result.find(r => r.date.toISOString().startsWith('2024-01-02'));

      expect(jan01Result?.value).toBe(35);
      expect(jan02Result?.value).toBe(36);
    });

    it('should handle multiple athletes on same date', () => {
      const data = [
        createMockDataPointWithDate('1', 'VERTICAL_JUMP', 30, '2024-01-01'),
        createMockDataPointWithDate('1', 'VERTICAL_JUMP', 35, '2024-01-01'), // Best for athlete 1
        createMockDataPointWithDate('2', 'VERTICAL_JUMP', 25, '2024-01-01'),
        createMockDataPointWithDate('2', 'VERTICAL_JUMP', 28, '2024-01-01'), // Best for athlete 2
      ];

      const result = filterToBestMeasurementsPerDate(data);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.athleteId === '1')?.value).toBe(35);
      expect(result.find(r => r.athleteId === '2')?.value).toBe(28);
    });
  });

  describe('validateAnalyticsFilters', () => {
    const createValidFilters = () => ({
      organizationId: 'org-123',
      teams: ['team-1'],
      genders: ['male'],
      birthYearFrom: 2000,
      birthYearTo: 2001,
    });

    it('should validate correct filters', () => {
      const filters = createValidFilters();
      const result = validateAnalyticsFilters(filters);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject missing organizationId', () => {
      const filters = { ...createValidFilters(), organizationId: '' };
      const result = validateAnalyticsFilters(filters);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Organization ID is required and must be a string');
    });

    it('should reject invalid birth years', () => {
      const filters = { ...createValidFilters(), birthYearFrom: 1800, birthYearTo: 3000 };
      const result = validateAnalyticsFilters(filters);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Birth year'))).toBe(true);
    });

    it('should reject invalid genders format', () => {
      const filters = { ...createValidFilters(), genders: 'not-an-array' as any };
      const result = validateAnalyticsFilters(filters);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Genders filter must be an array'))).toBe(true);
    });

    it('should allow empty optional arrays', () => {
      const filters = {
        ...createValidFilters(),
        teams: [],
        genders: []
      };
      const result = validateAnalyticsFilters(filters);

      expect(result.isValid).toBe(true);
    });

    it('should handle null/undefined optional fields', () => {
      const filters = {
        organizationId: 'org-123',
        teams: undefined,
        genders: null,
        birthYearFrom: undefined,
        birthYearTo: undefined
      } as any;
      const result = validateAnalyticsFilters(filters);

      expect(result.isValid).toBe(true);
    });
  });
});