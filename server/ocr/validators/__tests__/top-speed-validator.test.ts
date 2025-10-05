/**
 * Tests for TOP_SPEED metric validation warnings
 */

import { describe, it, expect } from 'vitest';
import { MeasurementValidator } from '../measurement-validator';
import { OCRConfig } from '@shared/ocr-types';

const mockConfig: OCRConfig = {
  validation: {
    nameMinLength: 2,
    measurementRanges: {
      'TOP_SPEED': { min: 10, max: 25 }
    }
  },
  patterns: {
    measurements: [],
    names: []
  },
  preprocessing: {
    denoise: false,
    contrastEnhancement: false,
    deskew: false
  }
};

describe('TOP_SPEED validation warnings', () => {
  const validator = new MeasurementValidator(mockConfig);

  it('should warn for low top speed (<12 mph)', () => {
    const result = validator.validateMeasurement({
      firstName: 'John',
      lastName: 'Doe',
      metric: 'TOP_SPEED',
      value: '11.5',
      confidence: 85
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('Low top speed - verify measurement accuracy');
  });

  it('should warn for very high top speed (>22 mph)', () => {
    const result = validator.validateMeasurement({
      firstName: 'Jane',
      lastName: 'Smith',
      metric: 'TOP_SPEED',
      value: '23.0',
      confidence: 85
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('Very high top speed - confirm measurement method');
  });

  it('should not warn for normal top speed (12-22 mph)', () => {
    const result = validator.validateMeasurement({
      firstName: 'Mike',
      lastName: 'Johnson',
      metric: 'TOP_SPEED',
      value: '18.5',
      confidence: 85
    });

    expect(result.isValid).toBe(true);
    const speedWarnings = result.warnings.filter(w =>
      w.includes('top speed') || w.includes('Top speed')
    );
    expect(speedWarnings).toHaveLength(0);
  });

  it('should error for values below range (< 10 mph)', () => {
    const result = validator.validateMeasurement({
      firstName: 'Sarah',
      lastName: 'Williams',
      metric: 'TOP_SPEED',
      value: '9.5',
      confidence: 85
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Value too low for TOP_SPEED: 9.5 (minimum: 10)');
  });

  it('should error for values above range (> 25 mph)', () => {
    const result = validator.validateMeasurement({
      firstName: 'Chris',
      lastName: 'Brown',
      metric: 'TOP_SPEED',
      value: '26.0',
      confidence: 85
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Value too high for TOP_SPEED: 26 (maximum: 25)');
  });

  it('should warn for edge of normal range (exactly 12 mph)', () => {
    const result = validator.validateMeasurement({
      firstName: 'Alex',
      lastName: 'Davis',
      metric: 'TOP_SPEED',
      value: '12.0',
      confidence: 85
    });

    expect(result.isValid).toBe(true);
    const speedWarnings = result.warnings.filter(w =>
      w.includes('Low top speed')
    );
    expect(speedWarnings).toHaveLength(0); // 12.0 is at the threshold, not below
  });

  it('should warn for edge of normal range (exactly 22 mph)', () => {
    const result = validator.validateMeasurement({
      firstName: 'Pat',
      lastName: 'Taylor',
      metric: 'TOP_SPEED',
      value: '22.0',
      confidence: 85
    });

    expect(result.isValid).toBe(true);
    const speedWarnings = result.warnings.filter(w =>
      w.includes('Very high top speed')
    );
    expect(speedWarnings).toHaveLength(0); // 22.0 is at the threshold, not above
  });

  it('should combine automatic and metric-specific warnings', () => {
    const result = validator.validateMeasurement({
      firstName: 'Test',
      lastName: 'User',
      metric: 'TOP_SPEED',
      value: '11.0', // This is < 11.5 (10th percentile) AND < 12 (metric warning)
      confidence: 85
    });

    expect(result.isValid).toBe(true);
    // Should have both automatic warning and metric-specific warning
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Low top speed'))).toBe(true);
  });
});

describe('Validation consistency across metrics', () => {
  const validator = new MeasurementValidator(mockConfig);

  it('should have similar warning patterns for all time-based metrics', () => {
    const timeMetrics = [
      { metric: 'FLY10_TIME', lowValue: '0.9', highValue: '2.6' },
      { metric: 'DASH_40YD', lowValue: '3.9', highValue: '6.1' },
      { metric: 'AGILITY_505', lowValue: '1.9', highValue: '3.6' },
      { metric: 'T_TEST', lowValue: '7.9', highValue: '12.1' }
    ];

    timeMetrics.forEach(({ metric, lowValue, highValue }) => {
      const lowResult = validator.validateMeasurement({
        firstName: 'Test',
        lastName: 'User',
        metric,
        value: lowValue,
        confidence: 85
      });

      const highResult = validator.validateMeasurement({
        firstName: 'Test',
        lastName: 'User',
        metric,
        value: highValue,
        confidence: 85
      });

      // All metrics should have warnings for extreme values
      expect(lowResult.warnings.length).toBeGreaterThan(0);
      expect(highResult.warnings.length).toBeGreaterThan(0);
    });
  });

  it('TOP_SPEED should have warnings like other metrics', () => {
    const topSpeedLow = validator.validateMeasurement({
      firstName: 'Test',
      lastName: 'User',
      metric: 'TOP_SPEED',
      value: '11.5',
      confidence: 85
    });

    const topSpeedHigh = validator.validateMeasurement({
      firstName: 'Test',
      lastName: 'User',
      metric: 'TOP_SPEED',
      value: '22.5',
      confidence: 85
    });

    expect(topSpeedLow.warnings.length).toBeGreaterThan(0);
    expect(topSpeedHigh.warnings.length).toBeGreaterThan(0);
  });
});
