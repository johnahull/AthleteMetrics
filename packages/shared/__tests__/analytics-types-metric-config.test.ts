import { describe, it, expect } from 'vitest';
import { METRIC_CONFIG } from '../analytics-types';

/**
 * Test suite for METRIC_CONFIG migration from lowerIsBetter to metricType
 * Part of TDD implementation for tracking metrics (HEIGHT, WEIGHT, etc.)
 */
describe('METRIC_CONFIG metricType migration', () => {
  describe('lower_is_better metrics', () => {
    it('should have FLY10_TIME as lower_is_better', () => {
      expect(METRIC_CONFIG.FLY10_TIME).toBeDefined();
      expect(METRIC_CONFIG.FLY10_TIME.metricType).toBe('lower_is_better');
    });

    it('should have AGILITY_505 as lower_is_better', () => {
      expect(METRIC_CONFIG.AGILITY_505).toBeDefined();
      expect(METRIC_CONFIG.AGILITY_505.metricType).toBe('lower_is_better');
    });

    it('should have AGILITY_5105 as lower_is_better', () => {
      expect(METRIC_CONFIG.AGILITY_5105).toBeDefined();
      expect(METRIC_CONFIG.AGILITY_5105.metricType).toBe('lower_is_better');
    });

    it('should have T_TEST as lower_is_better', () => {
      expect(METRIC_CONFIG.T_TEST).toBeDefined();
      expect(METRIC_CONFIG.T_TEST.metricType).toBe('lower_is_better');
    });

    it('should have DASH_40YD as lower_is_better', () => {
      expect(METRIC_CONFIG.DASH_40YD).toBeDefined();
      expect(METRIC_CONFIG.DASH_40YD.metricType).toBe('lower_is_better');
    });
  });

  describe('higher_is_better metrics', () => {
    it('should have VERTICAL_JUMP as higher_is_better', () => {
      expect(METRIC_CONFIG.VERTICAL_JUMP).toBeDefined();
      expect(METRIC_CONFIG.VERTICAL_JUMP.metricType).toBe('higher_is_better');
    });

    it('should have RSI as higher_is_better', () => {
      expect(METRIC_CONFIG.RSI).toBeDefined();
      expect(METRIC_CONFIG.RSI.metricType).toBe('higher_is_better');
    });

    it('should have TOP_SPEED as higher_is_better', () => {
      expect(METRIC_CONFIG.TOP_SPEED).toBeDefined();
      expect(METRIC_CONFIG.TOP_SPEED.metricType).toBe('higher_is_better');
    });
  });

  describe('tracking metrics (new)', () => {
    it('should have HEIGHT as tracking metric', () => {
      expect(METRIC_CONFIG.HEIGHT).toBeDefined();
      expect(METRIC_CONFIG.HEIGHT.metricType).toBe('tracking');
      expect(METRIC_CONFIG.HEIGHT.unit).toBe('in');
    });

    it('should have WEIGHT as tracking metric', () => {
      expect(METRIC_CONFIG.WEIGHT).toBeDefined();
      expect(METRIC_CONFIG.WEIGHT.metricType).toBe('tracking');
      expect(METRIC_CONFIG.WEIGHT.unit).toBe('lbs');
    });
  });

  describe('backward compatibility', () => {
    it('should not have lowerIsBetter property on any metrics', () => {
      Object.keys(METRIC_CONFIG).forEach(key => {
        const config = METRIC_CONFIG[key as keyof typeof METRIC_CONFIG];
        expect(config).not.toHaveProperty('lowerIsBetter');
      });
    });

    it('should have metricType property on all metrics', () => {
      Object.keys(METRIC_CONFIG).forEach(key => {
        const config = METRIC_CONFIG[key as keyof typeof METRIC_CONFIG];
        expect(config).toHaveProperty('metricType');
        expect(['lower_is_better', 'higher_is_better', 'tracking']).toContain(config.metricType);
      });
    });
  });
});
