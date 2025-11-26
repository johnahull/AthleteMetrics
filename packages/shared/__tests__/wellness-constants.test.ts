import { describe, it, expect } from 'vitest';
import {
  WELLNESS_CONSTANTS,
  STATUS_COLORS,
  PAGINATION_DEFAULTS,
  getWellnessScoreLevel,
  getHeatmapColor,
  autoGenerateColorThresholds,
  getTemplateScaleRange,
} from '../wellness-constants';

describe('wellness-constants', () => {
  describe('WELLNESS_CONSTANTS', () => {
    it('should have default date range', () => {
      expect(WELLNESS_CONSTANTS.DEFAULT_DATE_RANGE_DAYS).toBe(30);
    });

    it('should have score min and max', () => {
      expect(WELLNESS_CONSTANTS.SCORE_MIN).toBe(1);
      expect(WELLNESS_CONSTANTS.SCORE_MAX).toBe(10);
    });

    it('should have chart colors array', () => {
      expect(Array.isArray(WELLNESS_CONSTANTS.CHART_COLORS)).toBe(true);
      expect(WELLNESS_CONSTANTS.CHART_COLORS.length).toBeGreaterThan(0);
    });
  });

  describe('STATUS_COLORS', () => {
    it('should have red status colors', () => {
      expect(STATUS_COLORS.red).toBeDefined();
      expect(STATUS_COLORS.red.bg).toBe('bg-red-500');
      expect(STATUS_COLORS.red.text).toBe('text-red-600');
    });

    it('should have yellow status colors', () => {
      expect(STATUS_COLORS.yellow).toBeDefined();
      expect(STATUS_COLORS.yellow.bg).toBe('bg-yellow-500');
      expect(STATUS_COLORS.yellow.text).toBe('text-yellow-700');
    });

    it('should have green status colors', () => {
      expect(STATUS_COLORS.green).toBeDefined();
      expect(STATUS_COLORS.green.bg).toBe('bg-green-500');
      expect(STATUS_COLORS.green.text).toBe('text-green-700');
    });

    it('should have all required color properties', () => {
      const requiredProps = ['bg', 'text', 'border', 'badgeVariant'];

      expect(Object.keys(STATUS_COLORS.red)).toEqual(expect.arrayContaining(requiredProps));
      expect(Object.keys(STATUS_COLORS.yellow)).toEqual(expect.arrayContaining(requiredProps));
      expect(Object.keys(STATUS_COLORS.green)).toEqual(expect.arrayContaining(requiredProps));
    });
  });

  describe('PAGINATION_DEFAULTS', () => {
    it('should have default page size', () => {
      expect(PAGINATION_DEFAULTS.DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
      expect(typeof PAGINATION_DEFAULTS.DEFAULT_PAGE_SIZE).toBe('number');
    });

    it('should have max page size', () => {
      expect(PAGINATION_DEFAULTS.MAX_PAGE_SIZE).toBeGreaterThan(PAGINATION_DEFAULTS.DEFAULT_PAGE_SIZE);
    });

    it('should have reasonable limits', () => {
      expect(PAGINATION_DEFAULTS.DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(100);
      expect(PAGINATION_DEFAULTS.MAX_PAGE_SIZE).toBeLessThanOrEqual(500);
    });
  });

  describe('getWellnessScoreLevel', () => {
    it('should return very_low for scores <= 3', () => {
      expect(getWellnessScoreLevel(1)).toBe('very_low');
      expect(getWellnessScoreLevel(3)).toBe('very_low');
    });

    it('should return low for scores 4-5', () => {
      expect(getWellnessScoreLevel(4)).toBe('low');
      expect(getWellnessScoreLevel(5)).toBe('low');
    });

    it('should return medium for scores 6-7', () => {
      expect(getWellnessScoreLevel(6)).toBe('medium');
      expect(getWellnessScoreLevel(7)).toBe('medium');
    });

    it('should return good for scores 8-9', () => {
      expect(getWellnessScoreLevel(8)).toBe('good');
      expect(getWellnessScoreLevel(9)).toBe('good');
    });

    it('should return excellent for score 10', () => {
      expect(getWellnessScoreLevel(10)).toBe('excellent');
    });
  });

  describe('getHeatmapColor', () => {
    it('should return NO_DATA color for null', () => {
      expect(getHeatmapColor(null)).toBe(WELLNESS_CONSTANTS.HEATMAP_COLORS.NO_DATA);
    });

    it('should return NO_DATA color for undefined', () => {
      expect(getHeatmapColor(undefined)).toBe(WELLNESS_CONSTANTS.HEATMAP_COLORS.NO_DATA);
    });

    it('should return VERY_LOW color for low scores', () => {
      expect(getHeatmapColor(1)).toBe(WELLNESS_CONSTANTS.HEATMAP_COLORS.VERY_LOW);
    });

    it('should return EXCELLENT color for high scores', () => {
      expect(getHeatmapColor(10)).toBe(WELLNESS_CONSTANTS.HEATMAP_COLORS.EXCELLENT);
    });
  });

  describe('autoGenerateColorThresholds', () => {
    it('should generate thresholds for 1-10 scale', () => {
      const thresholds = autoGenerateColorThresholds(1, 10);

      expect(thresholds.lowThreshold).toBeLessThan(thresholds.mediumThreshold);
      expect(thresholds.mediumThreshold).toBeLessThan(thresholds.highThreshold);
    });

    it('should generate thresholds for 1-5 scale', () => {
      const thresholds = autoGenerateColorThresholds(1, 5);

      expect(thresholds.lowThreshold).toBeGreaterThanOrEqual(1);
      expect(thresholds.highThreshold).toBeLessThanOrEqual(5);
    });

    it('should use 30/60/80 percentile splits', () => {
      const thresholds = autoGenerateColorThresholds(0, 100);

      expect(thresholds.lowThreshold).toBe(30);
      expect(thresholds.mediumThreshold).toBe(60);
      expect(thresholds.highThreshold).toBe(80);
    });
  });

  describe('getTemplateScaleRange', () => {
    it('should return null for template without questions', () => {
      expect(getTemplateScaleRange({})).toBeNull();
      expect(getTemplateScaleRange({ config: {} })).toBeNull();
    });

    it('should return null for template without scale questions', () => {
      const template = {
        config: {
          questions: [
            { type: 'text' },
            { type: 'boolean' },
          ],
        },
      };

      expect(getTemplateScaleRange(template)).toBeNull();
    });

    it('should extract min and max from scale questions', () => {
      const template = {
        config: {
          questions: [
            { type: 'scale', scaleMin: 1, scaleMax: 10 },
            { type: 'text' },
          ],
        },
      };

      const range = getTemplateScaleRange(template);
      expect(range).toEqual({ min: 1, max: 10 });
    });

    it('should use first scale range when multiple exist', () => {
      const template = {
        config: {
          questions: [
            { type: 'scale', scaleMin: 1, scaleMax: 5 },
            { type: 'scale', scaleMin: 1, scaleMax: 10 },
          ],
        },
      };

      const range = getTemplateScaleRange(template);
      expect(range).toEqual({ min: 1, max: 5 });
    });
  });
});
