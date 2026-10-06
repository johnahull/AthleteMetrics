import { describe, it, expect } from 'vitest';
import {
  validateMeasurementValue,
  MeasurementValueValidationError,
} from '../measurement-value-validation';
import { insertMeasurementSchema } from '../schema';

const ordinal = { validationMin: '0.000', validationMax: '3.000', decimalPrecision: 0 };

describe('validateMeasurementValue', () => {
  describe('non-MQ metrics keep positive() behavior', () => {
    it.each([
      ['no config', undefined],
      ['null config', null],
      ['no bounds', {}],
      ['null min', { validationMin: null, validationMax: 50 }],
      ['positive min', { validationMin: 1, validationMax: 50 }],
    ])('rejects 0 and negatives (%s)', (_name, bounds) => {
      expect(validateMeasurementValue(0, bounds as any, 'FLY10_TIME')).toBe('Value must be positive');
      expect(validateMeasurementValue(-1, bounds as any, 'FLY10_TIME')).toBe('Value must be positive');
    });

    it('accepts positive values, with no upper-bound enforcement', () => {
      expect(validateMeasurementValue(4.5, undefined, 'FLY10_TIME')).toBeNull();
      expect(validateMeasurementValue(999, { validationMin: 1, validationMax: 50 }, 'FLY10_TIME')).toBeNull();
    });

    // AM-FEAT-015 spec criterion 6: existing metrics whose site_metrics row has
    // validation_min = 0 must behave exactly as before (0 rejected, max not enforced,
    // decimals allowed). Bounds mirror migrations 0128 / 0130 / 0137.
    it.each([
      ['RSI_L', { validationMin: '0.000', validationMax: '5.000', decimalPrecision: 2 }, 7.5],
      ['RSI_R', { validationMin: '0.000', validationMax: '5.000', decimalPrecision: 2 }, 6],
      ['AGILITY_505_LSI', { validationMin: '0.000', validationMax: '100.000', decimalPrecision: 1 }, 101],
      ['RSI_ASYM', { validationMin: '0.000', validationMax: '100.000', decimalPrecision: 1 }, 120],
      ['COND_YYIR1_DISTANCE', { validationMin: '0.000', validationMax: '4000.000', decimalPrecision: 0 }, 4100.5],
    ])('%s (validation_min 0) still rejects 0 and accepts values above max', (code, bounds, aboveMax) => {
      expect(validateMeasurementValue(0, bounds, code)).toBe('Value must be positive');
      expect(validateMeasurementValue(aboveMax, bounds, code)).toBeNull();
    });
  });

  describe('MQ metrics (0-3 ordinals)', () => {
    it('accepts the full range including 0', () => {
      for (const v of [0, 1, 2, 3]) expect(validateMeasurementValue(v, ordinal, 'MQ_JUMP')).toBeNull();
    });

    it('rejects values below min and above max', () => {
      expect(validateMeasurementValue(-1, ordinal, 'MQ_JUMP')).toMatch(/at least 0/);
      expect(validateMeasurementValue(4, ordinal, 'MQ_JUMP')).toMatch(/at most 3/);
    });

    it('rejects non-integers when decimal_precision is 0', () => {
      expect(validateMeasurementValue(1.5, ordinal, 'MQ_JUMP')).toMatch(/whole number/);
    });

    it('allows decimals when decimal_precision > 0', () => {
      expect(
        validateMeasurementValue(1.25, { validationMin: 0, validationMax: 5, decimalPrecision: 2 }, 'MQ_JUMP'),
      ).toBeNull();
    });

    it('treats a missing max as unbounded', () => {
      expect(validateMeasurementValue(0, { validationMin: 0 }, 'MQ_JUMP')).toBeNull();
      expect(validateMeasurementValue(1e6, { validationMin: 0 }, 'MQ_JUMP')).toBeNull();
    });

    it('falls back to positive() when the MQ metric has no validation_min configured', () => {
      expect(validateMeasurementValue(0, undefined, 'MQ_JUMP')).toBe('Value must be positive');
    });
  });

  it('accepts numeric strings (non-Zod callers) using the same rules', () => {
    expect(validateMeasurementValue('1.45', undefined, 'FLY10_TIME')).toBeNull();
    expect(validateMeasurementValue('0', undefined, 'FLY10_TIME')).toBe('Value must be positive');
    expect(validateMeasurementValue('0', ordinal, 'MQ_JUMP')).toBeNull();
    expect(validateMeasurementValue(' 2 ', ordinal, 'MQ_JUMP')).toBeNull();
    expect(validateMeasurementValue('abc', ordinal, 'MQ_JUMP')).not.toBeNull();
    expect(validateMeasurementValue('', ordinal, 'MQ_JUMP')).not.toBeNull();
  });

  it.each(['   ', '\t', '0x3', '1e0', '3abc', 'Infinity'])(
    'rejects non-decimal numeric-looking string %j',
    (raw) => {
      expect(validateMeasurementValue(raw, ordinal, 'MQ_JUMP')).toBe('Value must be a finite number');
    },
  );

  it('rejects non-finite values', () => {
    expect(validateMeasurementValue(NaN, ordinal, 'MQ_JUMP')).not.toBeNull();
    expect(validateMeasurementValue(Infinity, undefined, 'FLY10_TIME')).not.toBeNull();
  });
});

describe('MeasurementValueValidationError', () => {
  it('is a field-shaped error on "value"', () => {
    const err = new MeasurementValueValidationError('Value must be at most 3');
    expect(err).toBeInstanceOf(Error);
    expect(err.field).toBe('value');
    expect(err.message).toBe('Value must be at most 3');
  });
});

describe('insertMeasurementSchema value (metric-unaware layer)', () => {
  const base = { userId: 'u1', metric: 'MQ_JUMP', date: '2026-03-10' };

  it('accepts 0 so metric-aware validation can decide', () => {
    expect(insertMeasurementSchema.safeParse({ ...base, value: 0 }).success).toBe(true);
  });

  it('still rejects negative values', () => {
    expect(insertMeasurementSchema.safeParse({ ...base, value: -1 }).success).toBe(false);
  });
});
