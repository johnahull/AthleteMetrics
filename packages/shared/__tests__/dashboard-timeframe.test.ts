import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TIMEFRAME_PRESETS,
  getPresetDateRange,
  calculateComparisonPeriods,
  formatDateRange,
  type TimeframePreset,
  type DateRange,
  type ComparisonPeriods,
} from '../dashboard-timeframe';

describe('Dashboard Timeframe Utilities', () => {
  beforeEach(() => {
    // Mock current date to 2024-11-29 for consistent testing
    vi.setSystemTime(new Date('2024-11-29T12:00:00Z'));
  });

  describe('TIMEFRAME_PRESETS constant', () => {
    it('should export all preset options', () => {
      expect(TIMEFRAME_PRESETS).toBeDefined();
      expect(TIMEFRAME_PRESETS).toHaveLength(8); // 7 presets + custom

      const presetValues = TIMEFRAME_PRESETS.map(p => p.value);
      expect(presetValues).toContain('7d');
      expect(presetValues).toContain('30d');
      expect(presetValues).toContain('90d');
      expect(presetValues).toContain('180d');
      expect(presetValues).toContain('1y');
      expect(presetValues).toContain('ytd');
      expect(presetValues).toContain('all');
      expect(presetValues).toContain('custom');
    });

    it('should have user-friendly labels', () => {
      const labels = TIMEFRAME_PRESETS.map(p => p.label);
      expect(labels).toContain('Last 7 Days');
      expect(labels).toContain('Last 30 Days');
      expect(labels).toContain('Last 90 Days');
      expect(labels).toContain('Last 180 Days');
      expect(labels).toContain('Last 1 Year');
      expect(labels).toContain('Year to Date');
      expect(labels).toContain('All Time');
      expect(labels).toContain('Custom Range');
    });
  });

  describe('getPresetDateRange', () => {
    it('should calculate Last 7 Days correctly', () => {
      const range = getPresetDateRange('7d');

      // End date should be today
      expect(range.end.toISOString().split('T')[0]).toBe('2024-11-29');

      // Start date should be 7 days ago
      expect(range.start.toISOString().split('T')[0]).toBe('2024-11-22');
    });

    it('should calculate Last 30 Days correctly', () => {
      const range = getPresetDateRange('30d');

      expect(range.end.toISOString().split('T')[0]).toBe('2024-11-29');
      expect(range.start.toISOString().split('T')[0]).toBe('2024-10-30');
    });

    it('should calculate Last 90 Days correctly', () => {
      const range = getPresetDateRange('90d');

      expect(range.end.toISOString().split('T')[0]).toBe('2024-11-29');
      expect(range.start.toISOString().split('T')[0]).toBe('2024-08-31');
    });

    it('should calculate Last 180 Days correctly', () => {
      const range = getPresetDateRange('180d');

      expect(range.end.toISOString().split('T')[0]).toBe('2024-11-29');
      expect(range.start.toISOString().split('T')[0]).toBe('2024-06-02');
    });

    it('should calculate Last 1 Year correctly', () => {
      const range = getPresetDateRange('1y');

      expect(range.end.toISOString().split('T')[0]).toBe('2024-11-29');
      expect(range.start.toISOString().split('T')[0]).toBe('2023-11-29');
    });

    it('should calculate Year to Date correctly', () => {
      const range = getPresetDateRange('ytd');

      expect(range.start.toISOString().split('T')[0]).toBe('2024-01-01');
      expect(range.end.toISOString().split('T')[0]).toBe('2024-11-29');
    });

    it('should calculate All Time correctly', () => {
      const range = getPresetDateRange('all');

      // Start date should be earliest date (2020-01-01)
      expect(range.start.toISOString().split('T')[0]).toBe('2020-01-01');
      expect(range.end.toISOString().split('T')[0]).toBe('2024-11-29');
    });
  });

  describe('calculateComparisonPeriods', () => {
    it('should calculate comparison periods for Last 7 Days', () => {
      const start = new Date('2024-11-23');
      const end = new Date('2024-11-29');

      const periods = calculateComparisonPeriods(start, end);

      // Current period
      expect(periods.current.start.toISOString().split('T')[0]).toBe('2024-11-23');
      expect(periods.current.end.toISOString().split('T')[0]).toBe('2024-11-29');

      // Prior period (7 days before, same duration)
      expect(periods.prior.start.toISOString().split('T')[0]).toBe('2024-11-16');
      expect(periods.prior.end.toISOString().split('T')[0]).toBe('2024-11-22');

      // Labels
      expect(periods.label).toBe('Nov 23 - 29, 2024');
      expect(periods.comparisonLabel).toBe('Nov 16 - 22, 2024');
    });

    it('should calculate comparison periods for Last 30 Days', () => {
      const start = new Date('2024-11-01');
      const end = new Date('2024-11-30');

      const periods = calculateComparisonPeriods(start, end);

      // Prior period is 30 days before start
      expect(periods.prior.start.toISOString().split('T')[0]).toBe('2024-10-02');
      expect(periods.prior.end.toISOString().split('T')[0]).toBe('2024-10-31');
    });

    it('should calculate comparison periods for custom range', () => {
      const start = new Date('2024-01-15');
      const end = new Date('2024-02-15');

      const periods = calculateComparisonPeriods(start, end);

      // 32 days in current period
      // Prior period: Dec 14, 2023 - Jan 14, 2024
      expect(periods.prior.start.toISOString().split('T')[0]).toBe('2023-12-14');
      expect(periods.prior.end.toISOString().split('T')[0]).toBe('2024-01-14');
    });

    it('should handle single day range', () => {
      const start = new Date('2024-11-29');
      const end = new Date('2024-11-29');

      const periods = calculateComparisonPeriods(start, end);

      // Prior period should be previous day
      expect(periods.prior.start.toISOString().split('T')[0]).toBe('2024-11-28');
      expect(periods.prior.end.toISOString().split('T')[0]).toBe('2024-11-28');
    });

    it('should handle year boundaries correctly', () => {
      const start = new Date('2024-12-25');
      const end = new Date('2025-01-05');

      const periods = calculateComparisonPeriods(start, end);

      // 12 days (Dec 25 - Jan 5)
      // Prior period should cross into previous year
      expect(periods.prior.start.toISOString().split('T')[0]).toBe('2024-12-13');
      expect(periods.prior.end.toISOString().split('T')[0]).toBe('2024-12-24');
    });

    it('should handle leap year correctly', () => {
      const start = new Date('2024-02-28');
      const end = new Date('2024-03-05');

      const periods = calculateComparisonPeriods(start, end);

      // 7 days including leap day
      // Prior should go back to Feb 21-27
      expect(periods.prior.start.toISOString().split('T')[0]).toBe('2024-02-21');
      expect(periods.prior.end.toISOString().split('T')[0]).toBe('2024-02-27');
    });
  });

  describe('formatDateRange', () => {
    it('should format same month range', () => {
      const start = new Date('2024-11-01');
      const end = new Date('2024-11-30');

      const formatted = formatDateRange(start, end);
      expect(formatted).toBe('Nov 1 - 30, 2024');
    });

    it('should format different month, same year range', () => {
      const start = new Date('2024-10-15');
      const end = new Date('2024-11-15');

      const formatted = formatDateRange(start, end);
      expect(formatted).toBe('Oct 15 - Nov 15, 2024');
    });

    it('should format different year range', () => {
      const start = new Date('2023-12-25');
      const end = new Date('2024-01-05');

      const formatted = formatDateRange(start, end);
      expect(formatted).toBe('Dec 25, 2023 - Jan 5, 2024');
    });

    it('should format single day', () => {
      const start = new Date('2024-11-29');
      const end = new Date('2024-11-29');

      const formatted = formatDateRange(start, end);
      expect(formatted).toBe('Nov 29, 2024');
    });

    it('should handle consecutive days', () => {
      const start = new Date('2024-11-28');
      const end = new Date('2024-11-29');

      const formatted = formatDateRange(start, end);
      expect(formatted).toBe('Nov 28 - 29, 2024');
    });
  });

  describe('Edge Cases', () => {
    it('should handle dates at UTC midnight correctly', () => {
      const start = new Date('2024-11-01T00:00:00Z');
      const end = new Date('2024-11-30T00:00:00Z');

      const periods = calculateComparisonPeriods(start, end);

      // Should work correctly despite timezone
      expect(periods.current.start).toBeInstanceOf(Date);
      expect(periods.prior.start).toBeInstanceOf(Date);
    });

    it('should handle very long ranges', () => {
      const start = new Date('2020-01-01');
      const end = new Date('2024-11-29');

      const periods = calculateComparisonPeriods(start, end);

      // Prior period should be same duration before start
      const currentDuration = end.getTime() - start.getTime();
      const priorDuration = periods.current.start.getTime() - periods.prior.start.getTime();

      // Allow 1 day difference due to DST/leap days
      expect(Math.abs(currentDuration - priorDuration)).toBeLessThan(86400000 * 2);
    });
  });

  describe('Type Safety', () => {
    it('should only accept valid TimeframePreset values', () => {
      const validPresets: TimeframePreset[] = ['7d', '30d', '90d', '180d', '1y', 'ytd', 'all'];

      validPresets.forEach(preset => {
        expect(() => getPresetDateRange(preset)).not.toThrow();
      });
    });

    it('should return DateRange with Date objects', () => {
      const range = getPresetDateRange('30d');

      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
    });

    it('should return ComparisonPeriods with proper structure', () => {
      const start = new Date('2024-11-01');
      const end = new Date('2024-11-30');

      const periods = calculateComparisonPeriods(start, end);

      expect(periods).toHaveProperty('current');
      expect(periods).toHaveProperty('prior');
      expect(periods).toHaveProperty('label');
      expect(periods).toHaveProperty('comparisonLabel');

      expect(periods.current).toHaveProperty('start');
      expect(periods.current).toHaveProperty('end');
      expect(periods.prior).toHaveProperty('start');
      expect(periods.prior).toHaveProperty('end');
    });
  });
});
