import { describe, it, expect } from 'vitest';
import { formatValue } from '@shared/eval-report-copy';
import { recomputeDerived, lsiPercent, cmjAsymmetryPercent } from '../derived';

describe('lsiPercent', () => {
  it('is faster leg / slower leg x 100', () => {
    expect(lsiPercent(5.4, 6.0)).toBeCloseTo(90, 6);
    expect(lsiPercent(6.0, 5.4)).toBeCloseTo(90, 6);
  });
  it('is null for non-positive times', () => {
    expect(lsiPercent(0, 5)).toBeNull();
  });
});

describe('non-finite inputs', () => {
  it('give null, never NaN', () => {
    expect(lsiPercent(Number.NaN, 5)).toBeNull();
    expect(lsiPercent(5, Number.POSITIVE_INFINITY)).toBeNull();
    expect(cmjAsymmetryPercent(Number.NaN, 5)).toBeNull();
  });
});

describe('cmjAsymmetryPercent', () => {
  it('is abs(L-R) / higher x 100', () => {
    expect(cmjAsymmetryPercent(18, 20)).toBeCloseTo(10, 6);
    expect(cmjAsymmetryPercent(20, 18)).toBeCloseTo(10, 6);
  });
});

describe('recomputeDerived', () => {
  it('recomputes LSI from the per-leg bests and ignores a stored LSI', () => {
    const bests = new Map([
      ['AGILITY_505_M_L', 5.4],
      ['AGILITY_505_M_R', 6.0],
      ['AGILITY_505_M_LSI', 99], // stale stored total
    ]);
    expect(recomputeDerived(bests).get('AGILITY_505_M_LSI')).toBeCloseTo(90, 6);
  });

  it('drops a stored LSI when only one leg was tested', () => {
    const bests = new Map([
      ['AGILITY_505_M_L', 5.4],
      ['AGILITY_505_M_LSI', 99],
    ]);
    expect(recomputeDerived(bests).has('AGILITY_505_M_LSI')).toBe(false);
  });

  it('recomputes single-leg CMJ asymmetry from the per-leg bests', () => {
    const bests = new Map([
      ['JUMP_CMJ_SL_L', 18],
      ['JUMP_CMJ_SL_R', 20],
      ['JUMP_CMJ_SL_ASYM', 1],
    ]);
    expect(recomputeDerived(bests).get('JUMP_CMJ_SL_ASYM')).toBeCloseTo(10, 6);
  });

  it('does not mutate its input', () => {
    const bests = new Map([['AGILITY_505_M_LSI', 99]]);
    recomputeDerived(bests);
    expect(bests.get('AGILITY_505_M_LSI')).toBe(99);
  });
});

describe('recomputeDerived: EUR, COD deficit and the headline 5-0-5', () => {
  it('recomputes EUR as CMJ / squat jump and ignores a stored value', () => {
    const bests = new Map([['JUMP_CMJ_HOH', 21], ['JUMP_SJ_HEIGHT', 20], ['POWER_EUR', 9]]);
    expect(recomputeDerived(bests).get('POWER_EUR')).toBeCloseTo(1.05, 6);
  });

  it('drops EUR when an input is missing', () => {
    expect(recomputeDerived(new Map([['JUMP_CMJ_HOH', 21], ['POWER_EUR', 9]])).has('POWER_EUR')).toBe(false);
  });

  it('recomputes the COD deficit as faster leg minus the 10 m time interpolated from the 10 and 20 yd splits', () => {
    const bests = new Map([
      ['AGILITY_505_M_L', 2.85],
      ['AGILITY_505_M_R', 2.8],
      ['DASH_10YD', 1.8],
      ['DASH_20YD', 3.05],
      ['AGILITY_COD_DEFICIT_M_INTERP', 9], // stale stored total
    ]);
    const deficit = recomputeDerived(bests).get('AGILITY_COD_DEFICIT_M_INTERP')!;
    // 2.80 - (1.80 + 0.0936 * (3.05 - 1.80)) = 0.883; the report prints seconds to 2 places
    expect(deficit).toBeCloseTo(0.883, 6);
    expect(formatValue(deficit, 's')).toBe('0.88 s');
  });

  it('drops the COD deficit when a leg, the 10 yd split or the 20 yd split is missing', () => {
    const base = [['AGILITY_505_M_L', 2.85], ['AGILITY_505_M_R', 2.8], ['DASH_10YD', 1.8], ['DASH_20YD', 3.05]] as [string, number][];
    for (const missing of ['AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10YD', 'DASH_20YD']) {
      const bests = new Map([...base.filter(([c]) => c !== missing), ['AGILITY_COD_DEFICIT_M_INTERP', 9] as [string, number]]);
      expect(recomputeDerived(bests).has('AGILITY_COD_DEFICIT_M_INTERP')).toBe(false);
    }
  });

  it('never derives a yard code from meter data', () => {
    const bests = new Map([['AGILITY_505_M_L', 2.85], ['AGILITY_505_M_R', 2.8], ['DASH_10YD', 1.8], ['DASH_20YD', 3.05]]);
    const codes = [...recomputeDerived(bests).keys()];
    expect(codes.filter((c) => /^AGILITY_.*_YD/.test(c))).toEqual([]);
  });

  it('uses only the meter legs when both protocols were recorded', () => {
    const bests = new Map([
      ['AGILITY_505_M_L', 2.85], ['AGILITY_505_M_R', 2.8],
      ['AGILITY_505_YD_L', 2.5], ['AGILITY_505_YD_R', 2.4],
      ['DASH_10YD', 1.8], ['DASH_20YD', 3.05],
    ]);
    const out = recomputeDerived(bests);
    expect(out.get('AGILITY_505_M')).toBe(2.8);
    expect(out.get('AGILITY_505_M_LSI')).toBeCloseTo((2.8 / 2.85) * 100, 6);
    expect(out.get('AGILITY_COD_DEFICIT_M_INTERP')).toBeCloseTo(0.883, 6);
  });

  it('drops stored derived totals the report does not recompute (yard LSI and deficits)', () => {
    const bests = new Map([
      ['AGILITY_505_YD_L', 2.5], ['AGILITY_505_YD_R', 2.4],
      ['AGILITY_505_YD_LSI', 96], ['AGILITY_COD_DEFICIT_YD', 0.6], ['AGILITY_COD_DEFICIT_M', 0.7],
    ]);
    const out = recomputeDerived(bests);
    expect(out.has('AGILITY_505_YD_LSI')).toBe(false);
    expect(out.has('AGILITY_COD_DEFICIT_YD')).toBe(false);
    expect(out.has('AGILITY_COD_DEFICIT_M')).toBe(false);
    expect(out.get('AGILITY_505_YD_L')).toBe(2.5); // measured legs stay
  });

  it('derives the headline 5-0-5 from the faster leg when only the legs exist', () => {
    const bests = new Map([['AGILITY_505_M_L', 2.6], ['AGILITY_505_M_R', 2.5]]);
    expect(recomputeDerived(bests).get('AGILITY_505_M')).toBe(2.5);
  });

  it('uses the better of the direct 5-0-5 and the faster leg', () => {
    const legs: [string, number][] = [['AGILITY_505_M_L', 2.6], ['AGILITY_505_M_R', 2.5]];
    expect(recomputeDerived(new Map([...legs, ['AGILITY_505_M', 2.4]])).get('AGILITY_505_M')).toBe(2.4);
    expect(recomputeDerived(new Map([...legs, ['AGILITY_505_M', 2.7]])).get('AGILITY_505_M')).toBe(2.5);
  });

  it('keeps a direct 5-0-5 when no leg was tested, and never mixes in yard codes', () => {
    expect(recomputeDerived(new Map([['AGILITY_505_M', 2.7]])).get('AGILITY_505_M')).toBe(2.7);
    const yards = new Map([['AGILITY_505_YD_L', 2.0], ['AGILITY_505_YD_R', 2.1]]);
    const out = recomputeDerived(yards);
    expect(out.has('AGILITY_505_M')).toBe(false);
    expect(out.has('AGILITY_505_M_LSI')).toBe(false);
  });
});
