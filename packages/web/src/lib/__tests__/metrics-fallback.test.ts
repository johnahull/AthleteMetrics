import { describe, it, expect } from 'vitest';
import {
  getMetricDisplayName,
  getMetricBadgeVariant,
  getMetricColor,
  getMetricUnits,
  getMetricIcon,
  formatMetricValue
} from '../metrics';
import { Clock } from 'lucide-react';

/**
 * Test suite for metric utility functions after removing hardcoded definitions
 *
 * This test verifies that all functions return appropriate fallback values
 * when hardcoded metric definitions have been removed. The database
 * (via useMetricConfig hook) becomes the single source of truth.
 */
describe('Metric Utility Functions - Fallback Behavior', () => {
  describe('getMetricDisplayName', () => {
    it('should return the metric code directly for unknown metrics', () => {
      expect(getMetricDisplayName('UNKNOWN_METRIC')).toBe('UNKNOWN_METRIC');
    });

    it('should return the metric code directly for previously hardcoded FLY10_TIME', () => {
      // After removing hardcoded definitions, even known metrics return their codes
      expect(getMetricDisplayName('FLY10_TIME')).toBe('FLY10_TIME');
    });

    it('should return the metric code directly for previously hardcoded VERTICAL_JUMP', () => {
      expect(getMetricDisplayName('VERTICAL_JUMP')).toBe('VERTICAL_JUMP');
    });

    it('should handle custom metric codes', () => {
      expect(getMetricDisplayName('CUSTOM_METRIC_123')).toBe('CUSTOM_METRIC_123');
    });
  });

  describe('getMetricBadgeVariant', () => {
    it('should return "secondary" as default for unknown metrics', () => {
      expect(getMetricBadgeVariant('UNKNOWN_METRIC')).toBe('secondary');
    });

    it('should return "secondary" for previously hardcoded FLY10_TIME', () => {
      expect(getMetricBadgeVariant('FLY10_TIME')).toBe('secondary');
    });

    it('should return "secondary" for previously hardcoded VERTICAL_JUMP', () => {
      expect(getMetricBadgeVariant('VERTICAL_JUMP')).toBe('secondary');
    });

    it('should return "secondary" for all metrics', () => {
      const metrics = ['AGILITY_505', 'T_TEST', 'DASH_40YD', 'RSI'];
      metrics.forEach(metric => {
        expect(getMetricBadgeVariant(metric)).toBe('secondary');
      });
    });
  });

  describe('getMetricColor', () => {
    it('should return gray color as default for unknown metrics', () => {
      expect(getMetricColor('UNKNOWN_METRIC')).toBe('bg-gray-100 text-gray-800');
    });

    it('should return gray color for previously hardcoded FLY10_TIME', () => {
      expect(getMetricColor('FLY10_TIME')).toBe('bg-gray-100 text-gray-800');
    });

    it('should return gray color for previously hardcoded VERTICAL_JUMP', () => {
      expect(getMetricColor('VERTICAL_JUMP')).toBe('bg-gray-100 text-gray-800');
    });

    it('should return gray color for all metrics', () => {
      const metrics = ['AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI'];
      metrics.forEach(metric => {
        expect(getMetricColor(metric)).toBe('bg-gray-100 text-gray-800');
      });
    });
  });

  describe('getMetricUnits', () => {
    it('should return empty string as default for unknown metrics', () => {
      expect(getMetricUnits('UNKNOWN_METRIC')).toBe('');
    });

    it('should return empty string for previously hardcoded FLY10_TIME', () => {
      expect(getMetricUnits('FLY10_TIME')).toBe('');
    });

    it('should return empty string for previously hardcoded VERTICAL_JUMP', () => {
      expect(getMetricUnits('VERTICAL_JUMP')).toBe('');
    });

    it('should return empty string for all metrics', () => {
      const metrics = ['AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI'];
      metrics.forEach(metric => {
        expect(getMetricUnits(metric)).toBe('');
      });
    });
  });

  describe('getMetricIcon', () => {
    it('should return Clock icon as default for unknown metrics', () => {
      expect(getMetricIcon('UNKNOWN_METRIC')).toBe(Clock);
    });

    it('should return Clock icon for previously hardcoded FLY10_TIME', () => {
      expect(getMetricIcon('FLY10_TIME')).toBe(Clock);
    });

    it('should return Clock icon for previously hardcoded VERTICAL_JUMP', () => {
      expect(getMetricIcon('VERTICAL_JUMP')).toBe(Clock);
    });

    it('should return Clock icon for all metrics', () => {
      const metrics = ['AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI'];
      metrics.forEach(metric => {
        expect(getMetricIcon(metric)).toBe(Clock);
      });
    });
  });

  describe('formatMetricValue', () => {
    it('should return plain number string as default for unknown metrics', () => {
      expect(formatMetricValue('UNKNOWN_METRIC', 42)).toBe('42');
    });

    it('should return plain number string for previously hardcoded FLY10_TIME', () => {
      // Note: FLY10_TIME previously used formatFly10TimeWithSpeed, now returns plain value
      expect(formatMetricValue('FLY10_TIME', 1.23)).toBe('1.23');
    });

    it('should return plain number string for previously hardcoded VERTICAL_JUMP', () => {
      expect(formatMetricValue('VERTICAL_JUMP', 30)).toBe('30');
    });

    it('should return plain number string for all metrics', () => {
      expect(formatMetricValue('AGILITY_505', 2.5)).toBe('2.5');
      expect(formatMetricValue('RSI', 1.8)).toBe('1.8');
    });

    it('should handle integer values', () => {
      expect(formatMetricValue('ANY_METRIC', 100)).toBe('100');
    });

    it('should handle decimal values', () => {
      expect(formatMetricValue('ANY_METRIC', 123.456)).toBe('123.456');
    });
  });
});
