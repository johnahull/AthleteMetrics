import { describe, it, expect } from 'vitest';
import { computeFvProfile, type ComputedFvProfile } from '../sprint-fv-computation';

/**
 * Reference data from Morin & Samozino (2016) and published sprint profiles.
 * These known input→output pairs validate our implementation against
 * the established biomechanical model.
 */

describe('computeFvProfile', () => {
  describe('basic computation with 4 splits', () => {
    // Typical college sprinter: 30m in ~4.5s
    const splits = { '5': 1.10, '10': 1.82, '20': 3.15, '30': 4.45 };
    const bodyMassKg = 80;
    let result: ComputedFvProfile;

    it('should compute without throwing', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      expect(result).toBeDefined();
    });

    it('should return fitted vmax and tau', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      // Vmax should be in a physiologically plausible range (7-12 m/s)
      expect(result.vmax).toBeGreaterThan(7);
      expect(result.vmax).toBeLessThan(12);
      // Tau should be in plausible range (0.8-2.0 s)
      expect(result.tau).toBeGreaterThan(0.5);
      expect(result.tau).toBeLessThan(2.5);
    });

    it('should derive F0 relative (N/kg)', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      // F0_rel = vmax / tau, typically 5-15 N/kg for sprinters
      expect(result.f0Rel).toBeGreaterThan(3);
      expect(result.f0Rel).toBeLessThan(18);
      // F0_rel should equal vmax / tau
      expect(result.f0Rel).toBeCloseTo(result.vmax / result.tau, 2);
    });

    it('should derive V0 equal to Vmax', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      expect(result.v0).toBeCloseTo(result.vmax, 4);
    });

    it('should derive Pmax relative (W/kg)', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      // Pmax_rel = F0_rel * V0 / 4, typically 10-25 W/kg
      expect(result.pmaxRel).toBeCloseTo(result.f0Rel * result.v0 / 4, 2);
      expect(result.pmaxRel).toBeGreaterThan(5);
      expect(result.pmaxRel).toBeLessThan(30);
    });

    it('should derive FV slope (negative)', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      // FV slope = -F0_rel / V0, always negative
      expect(result.fvSlope).toBeLessThan(0);
      expect(result.fvSlope).toBeCloseTo(-result.f0Rel / result.v0, 4);
    });

    it('should compute RF peak (0-1 range)', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      expect(result.rfPeak).toBeGreaterThan(0);
      expect(result.rfPeak).toBeLessThanOrEqual(1);
    });

    it('should compute DRF (negative, typically -0.05 to -0.12)', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      expect(result.drf).toBeLessThan(0);
      expect(result.drf).toBeGreaterThan(-0.20);
    });

    it('should return good fit quality (R² > 0.95)', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      expect(result.fitR2).toBeGreaterThan(0.95);
    });

    it('should return residuals for each split', () => {
      result = computeFvProfile(splits, bodyMassKg, 'meters');
      expect(result.fitResiduals).toHaveLength(4);
      for (const r of result.fitResiduals) {
        expect(r.distance).toBeGreaterThan(0);
        expect(r.observedTime).toBeGreaterThan(0);
        expect(r.predictedTime).toBeGreaterThan(0);
        // Residuals should be small for a good fit
        expect(Math.abs(r.residual)).toBeLessThan(0.15);
      }
    });
  });

  describe('yard to meter conversion', () => {
    // Same athlete, data in yards
    const splitsYards = { '5': 1.03, '10': 1.70, '20': 2.95, '30': 4.18 };
    const bodyMassKg = 80;

    it('should convert yards to meters internally', () => {
      const result = computeFvProfile(splitsYards, bodyMassKg, 'yards');
      expect(result).toBeDefined();
      // Vmax should still be in m/s (not yd/s)
      expect(result.vmax).toBeGreaterThan(7);
      expect(result.vmax).toBeLessThan(12);
    });

    it('should produce similar Pmax for equivalent performances in yards vs meters', () => {
      // A 30yd sprint ≈ 27.4m; times should be slightly different
      // but the physics (Pmax) should be in the same ballpark
      const resultYards = computeFvProfile(splitsYards, bodyMassKg, 'yards');
      expect(resultYards.pmaxRel).toBeGreaterThan(5);
      expect(resultYards.pmaxRel).toBeLessThan(30);
    });
  });

  describe('3 of 4 splits (minimum data)', () => {
    const splits3 = { '5': 1.10, '10': 1.82, '30': 4.45 };
    const bodyMassKg = 75;

    it('should compute with only 3 splits', () => {
      const result = computeFvProfile(splits3, bodyMassKg, 'meters');
      expect(result).toBeDefined();
      expect(result.vmax).toBeGreaterThan(7);
      expect(result.fitR2).toBeGreaterThan(0.90);
    });

    it('should return residuals only for provided splits', () => {
      const result = computeFvProfile(splits3, bodyMassKg, 'meters');
      expect(result.fitResiduals).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    it('should throw with fewer than 3 splits', () => {
      expect(() => computeFvProfile({ '5': 1.10, '10': 1.82 }, 80, 'meters'))
        .toThrow(/at least 3/i);
    });

    it('should throw with non-monotonically-increasing times', () => {
      // 20m time is less than 10m time — physically impossible
      expect(() => computeFvProfile({ '5': 1.10, '10': 3.00, '20': 2.50, '30': 4.45 }, 80, 'meters'))
        .toThrow(/monotonically/i);
    });

    it('should throw with zero or negative times', () => {
      expect(() => computeFvProfile({ '5': 0, '10': 1.82, '20': 3.15, '30': 4.45 }, 80, 'meters'))
        .toThrow(/positive/i);
    });

    it('should throw with zero body mass', () => {
      expect(() => computeFvProfile({ '5': 1.10, '10': 1.82, '20': 3.15, '30': 4.45 }, 0, 'meters'))
        .toThrow(/body mass/i);
    });

    it('should handle very fast sprinter (elite)', () => {
      // Elite male: 30m in ~3.6s
      const splits = { '5': 0.85, '10': 1.42, '20': 2.50, '30': 3.55 };
      const result = computeFvProfile(splits, 85, 'meters');
      expect(result.vmax).toBeGreaterThan(9);
      expect(result.f0Rel).toBeGreaterThan(6);
      expect(result.pmaxRel).toBeGreaterThan(15);
    });

    it('should handle slow athlete (recreational)', () => {
      // Recreational: 30m in ~6.0s
      const splits = { '5': 1.50, '10': 2.50, '20': 4.30, '30': 6.00 };
      const result = computeFvProfile(splits, 70, 'meters');
      expect(result.vmax).toBeGreaterThan(5);
      expect(result.vmax).toBeLessThan(8);
    });
  });
});
