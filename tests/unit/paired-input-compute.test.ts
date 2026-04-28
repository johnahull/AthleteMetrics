import { describe, it, expect } from 'vitest';
import {
  computePairedInputMeasurement,
  PairedInputValidationError,
  type AuxiliaryInputConfig,
} from '../../packages/api/services/paired-input-compute';

const epleyConfig: AuxiliaryInputConfig = {
  label: 'Reps',
  unit: 'reps',
  validationMin: 1,
  validationMax: 12,
  required: true,
  computeFormula: 'load * (1 + reps / 30)',
  primaryInputLabel: 'Weight Lifted',
  primaryInputUnit: 'lbs',
};

describe('computePairedInputMeasurement', () => {
  describe('happy path', () => {
    it('computes Epley 1RM for 3 reps @ 315 lbs', () => {
      const result = computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 3);
      expect(result.value).toBe(346.5);
      expect(result.units).toBe('lbs');
      expect(result.calculationMetadata.formula).toBe(epleyConfig.computeFormula);
      expect(result.calculationMetadata.sourceValues).toEqual({ load: 315, reps: 3 });
      expect(result.calculationMetadata.parentMetric).toBe('BENCH_1RM');
      expect(result.calculationMetadata.calculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('computes correctly at the validity ceiling (12 reps)', () => {
      const result = computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 12);
      expect(result.value).toBe(441);
    });

    it('respects the metric primary unit (kg)', () => {
      const kgConfig = { ...epleyConfig, primaryInputUnit: 'kg' };
      const result = computePairedInputMeasurement(kgConfig, 'BENCH_1RM_KG', 100, 5);
      expect(result.value).toBeCloseTo(116.667, 2);
      expect(result.units).toBe('kg');
    });
  });

  describe('validation errors', () => {
    it('rejects missing auxiliary when required=true', () => {
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, null)
      ).toThrow(PairedInputValidationError);
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, null)
      ).toThrow(/required/i);
    });

    it('allows missing auxiliary when required=false (degenerates to identity)', () => {
      const optionalConfig = { ...epleyConfig, required: false };
      // When auxiliary is missing AND optional, return value unchanged with no metadata
      const result = computePairedInputMeasurement(optionalConfig, 'BENCH_1RM', 315, null);
      expect(result.value).toBe(315);
      expect(result.calculationMetadata).toBeUndefined();
    });

    it('rejects auxiliary below validationMin', () => {
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 0)
      ).toThrow(PairedInputValidationError);
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 0)
      ).toThrow(/at least 1/i);
    });

    it('rejects auxiliary above validationMax', () => {
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 13)
      ).toThrow(PairedInputValidationError);
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 13)
      ).toThrow(/at most 12/i);
    });

    it('rejects when primary value is missing or zero', () => {
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', null as any, 3)
      ).toThrow(PairedInputValidationError);
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 0, 3)
      ).toThrow(PairedInputValidationError);
    });

    it('rejects when formula evaluation returns null (e.g., division by zero)', () => {
      const badConfig = {
        ...epleyConfig,
        computeFormula: 'load / (reps - reps)', // intentional div by zero
        validationMin: 0,
        validationMax: 100,
      };
      expect(() =>
        computePairedInputMeasurement(badConfig, 'BAD_METRIC', 315, 5)
      ).toThrow(PairedInputValidationError);
      expect(() =>
        computePairedInputMeasurement(badConfig, 'BAD_METRIC', 315, 5)
      ).toThrow(/formula/i);
    });
  });

  describe('PairedInputValidationError', () => {
    it('is an instanceof Error and exposes a field name', () => {
      try {
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 0);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(PairedInputValidationError);
        expect((e as PairedInputValidationError).field).toBe('auxiliaryValue');
      }
    });
  });

  describe('integer-only reps', () => {
    it('rejects decimal reps when aux unit is "reps"', () => {
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 2.5)
      ).toThrow(PairedInputValidationError);
      expect(() =>
        computePairedInputMeasurement(epleyConfig, 'BENCH_1RM', 315, 2.5)
      ).toThrow(/whole number/i);
    });

    it('accepts decimals when aux unit is NOT "reps" (e.g., time/distance)', () => {
      const timeConfig = { ...epleyConfig, unit: 'seconds', label: 'Hold Time' };
      const result = computePairedInputMeasurement(timeConfig, 'PLANK_HOLD', 100, 2.5);
      expect(result.value).toBeCloseTo(100 * (1 + 2.5 / 30), 2);
    });
  });
});
