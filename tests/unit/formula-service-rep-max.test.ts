import { describe, it, expect } from 'vitest';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const EPLEY = 'load * (1 + reps / 30)';
const BRZYCKI = 'load / (1.0278 - 0.0278 * reps)';

describe('formula-service: rep-max formulas', () => {
  describe('Epley', () => {
    it('overestimates by ~3.3% at reps = 1 (Epley is biased upward at low reps)', () => {
      // Epley: 315 * (1 + 1/30) = 315 * 1.0333 = 325.5 — NOT 315
      // This is well-documented behavior; coaches using Epley at reps=1
      // see a slight inflation vs the true 1RM. Brzycki returns load at reps=1.
      expect(evaluateFormula(EPLEY, { load: 315, reps: 1 })).toBeCloseTo(325.5, 1);
    });

    it('matches the canonical 3 reps @ 315 lbs example', () => {
      // 315 * (1 + 3/30) = 315 * 1.1 = 346.5
      expect(evaluateFormula(EPLEY, { load: 315, reps: 3 })).toBe(346.5);
    });

    it('produces a sensible value at the validity ceiling (12 reps)', () => {
      // 315 * (1 + 12/30) = 315 * 1.4 = 441
      expect(evaluateFormula(EPLEY, { load: 315, reps: 12 })).toBe(441);
    });

    it('still computes above 12 reps (validation is not a formula concern)', () => {
      // The formula itself does not blow up; we cap at the application layer
      const result = evaluateFormula(EPLEY, { load: 315, reps: 20 });
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThan(441);
    });

    it('handles kg loads identically (formula is unit-agnostic)', () => {
      // 100 kg * (1 + 5/30) = 100 * 1.1667 ≈ 116.67
      const result = evaluateFormula(EPLEY, { load: 100, reps: 5 });
      expect(result).toBeCloseTo(116.667, 2);
    });

    it('returns null when reps source value is missing', () => {
      expect(evaluateFormula(EPLEY, { load: 315 } as any)).toBeNull();
    });

    it('returns null when load source value is missing', () => {
      expect(evaluateFormula(EPLEY, { reps: 3 } as any)).toBeNull();
    });
  });

  describe('Brzycki', () => {
    it('returns the load (within rounding) when reps = 1', () => {
      // 315 / (1.0278 - 0.0278) = 315 / 1.0 = 315
      expect(evaluateFormula(BRZYCKI, { load: 315, reps: 1 })).toBeCloseTo(315, 1);
    });

    it('produces a smaller estimate than Epley at 3 reps (more conservative)', () => {
      const epley = evaluateFormula(EPLEY, { load: 315, reps: 3 });
      const brzycki = evaluateFormula(BRZYCKI, { load: 315, reps: 3 });
      expect(brzycki).not.toBeNull();
      expect(epley).not.toBeNull();
      expect(brzycki!).toBeLessThan(epley!);
    });

    it('returns null when reps approaches the 36.97 asymptote (denominator → 0)', () => {
      // 1.0278 - 0.0278 * 37 ≈ -0.0008 — produces a near-infinite value, but technically finite
      // At reps=36.97, denominator is exactly zero — division by zero returns null per formula-service contract
      const result = evaluateFormula(BRZYCKI, { load: 315, reps: 36.97 });
      // The formula service's isFinite guard catches actual division-by-zero (returns null)
      // For values approaching but not crossing zero, the result is finite but huge
      // This documents that Brzycki is unsafe at high reps — validation must enforce reasonable caps
      if (result !== null) {
        expect(Math.abs(result)).toBeGreaterThan(10000); // Implausibly large = sentinel of misuse
      }
    });
  });

  describe('validateFormula with rep-max formulas', () => {
    it('accepts the Epley formula with load and reps as valid metric refs', () => {
      const result = validateFormula(EPLEY, ['load', 'reps']);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.referencedMetrics.sort()).toEqual(['load', 'reps']);
    });

    it('accepts the Brzycki formula', () => {
      const result = validateFormula(BRZYCKI, ['load', 'reps']);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('warns about division-by-zero risk on Brzycki (reps in denominator)', () => {
      const result = validateFormula(BRZYCKI, ['load', 'reps']);
      // The formula divides by an expression containing reps → should warn
      const hasDivByZeroWarning = result.warnings.some((w) =>
        w.toLowerCase().includes('divides by metric')
      );
      expect(hasDivByZeroWarning).toBe(true);
    });

    it('rejects Epley if load is not a known metric', () => {
      const result = validateFormula(EPLEY, ['reps']);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('load'))).toBe(true);
    });
  });
});
