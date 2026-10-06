import { describe, it, expect } from 'vitest';
import { validateMeasurementValue } from '../measurement-value-validation';
import { insertMeasurementSchema } from '../schema';

const ordinal = { validationMin: '0.000', validationMax: '3.000', decimalPrecision: 0 };

describe('validateMeasurementValue', () => {
  describe('metrics without validation_min <= 0 keep positive() behavior', () => {
    it.each([
      ['no config', undefined],
      ['null config', null],
      ['no bounds', {}],
      ['null min', { validationMin: null, validationMax: 50 }],
      ['positive min', { validationMin: 1, validationMax: 50 }],
    ])('rejects 0 and negatives (%s)', (_name, bounds) => {
      expect(validateMeasurementValue(0, bounds as any)).toBe('Value must be positive');
      expect(validateMeasurementValue(-1, bounds as any)).toBe('Value must be positive');
    });

    it('accepts positive values, with no upper-bound enforcement', () => {
      expect(validateMeasurementValue(4.5, undefined)).toBeNull();
      expect(validateMeasurementValue(999, { validationMin: 1, validationMax: 50 })).toBeNull();
    });
  });

  describe('metrics with validation_min <= 0 (e.g. MQ 0-3 ordinals)', () => {
    it('accepts the full range including 0', () => {
      for (const v of [0, 1, 2, 3]) expect(validateMeasurementValue(v, ordinal)).toBeNull();
    });

    it('rejects values below min and above max', () => {
      expect(validateMeasurementValue(-1, ordinal)).toMatch(/at least 0/);
      expect(validateMeasurementValue(4, ordinal)).toMatch(/at most 3/);
    });

    it('rejects non-integers when decimal_precision is 0', () => {
      expect(validateMeasurementValue(1.5, ordinal)).toMatch(/whole number/);
    });

    it('allows decimals when decimal_precision > 0', () => {
      expect(
        validateMeasurementValue(1.25, { validationMin: 0, validationMax: 5, decimalPrecision: 2 }),
      ).toBeNull();
    });

    it('treats a missing max as unbounded', () => {
      expect(validateMeasurementValue(0, { validationMin: 0 })).toBeNull();
      expect(validateMeasurementValue(1e6, { validationMin: 0 })).toBeNull();
    });
  });

  it('accepts numeric strings (non-Zod callers) using the same rules', () => {
    expect(validateMeasurementValue('1.45', undefined)).toBeNull();
    expect(validateMeasurementValue('0', undefined)).toBe('Value must be positive');
    expect(validateMeasurementValue('0', ordinal)).toBeNull();
    expect(validateMeasurementValue('abc', ordinal)).not.toBeNull();
    expect(validateMeasurementValue('', ordinal)).not.toBeNull();
  });

  it('rejects non-finite values', () => {
    expect(validateMeasurementValue(NaN, ordinal)).not.toBeNull();
    expect(validateMeasurementValue(Infinity, undefined)).not.toBeNull();
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
