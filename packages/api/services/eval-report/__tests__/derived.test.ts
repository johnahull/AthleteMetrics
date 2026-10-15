import { describe, it, expect } from 'vitest';
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
      ['AGILITY_505_YD_L', 5.4],
      ['AGILITY_505_YD_R', 6.0],
      ['AGILITY_505_YD_LSI', 99], // stale stored total
    ]);
    expect(recomputeDerived(bests).get('AGILITY_505_YD_LSI')).toBeCloseTo(90, 6);
  });

  it('drops a stored LSI when only one leg was tested', () => {
    const bests = new Map([
      ['AGILITY_505_YD_L', 5.4],
      ['AGILITY_505_YD_LSI', 99],
    ]);
    expect(recomputeDerived(bests).has('AGILITY_505_YD_LSI')).toBe(false);
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
    const bests = new Map([['AGILITY_505_YD_LSI', 99]]);
    recomputeDerived(bests);
    expect(bests.get('AGILITY_505_YD_LSI')).toBe(99);
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

  it('recomputes the COD deficit as faster leg minus the 10-yard dash', () => {
    const bests = new Map([['AGILITY_505_YD_L', 2.6], ['AGILITY_505_YD_R', 2.5], ['DASH_10YD', 1.9], ['AGILITY_COD_DEFICIT_YD', 9]]);
    expect(recomputeDerived(bests).get('AGILITY_COD_DEFICIT_YD')).toBeCloseTo(0.6, 6);
  });

  it('drops the COD deficit when a leg or the dash is missing', () => {
    const base = [['AGILITY_505_YD_L', 2.6], ['AGILITY_505_YD_R', 2.5], ['DASH_10YD', 1.9]] as [string, number][];
    for (const missing of ['AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'DASH_10YD']) {
      const bests = new Map([...base.filter(([c]) => c !== missing), ['AGILITY_COD_DEFICIT_YD', 9] as [string, number]]);
      expect(recomputeDerived(bests).has('AGILITY_COD_DEFICIT_YD')).toBe(false);
    }
  });

  it('derives the headline 5-0-5 from the faster leg when only the legs exist', () => {
    const bests = new Map([['AGILITY_505_YD_L', 2.6], ['AGILITY_505_YD_R', 2.5]]);
    expect(recomputeDerived(bests).get('AGILITY_505_YD')).toBe(2.5);
  });

  it('uses the better of the direct 5-0-5 and the faster leg', () => {
    const legs: [string, number][] = [['AGILITY_505_YD_L', 2.6], ['AGILITY_505_YD_R', 2.5]];
    expect(recomputeDerived(new Map([...legs, ['AGILITY_505_YD', 2.4]])).get('AGILITY_505_YD')).toBe(2.4);
    expect(recomputeDerived(new Map([...legs, ['AGILITY_505_YD', 2.7]])).get('AGILITY_505_YD')).toBe(2.5);
  });

  it('keeps a direct 5-0-5 when no leg was tested, and never mixes in meter codes', () => {
    expect(recomputeDerived(new Map([['AGILITY_505_YD', 2.7]])).get('AGILITY_505_YD')).toBe(2.7);
    const meters = new Map([['AGILITY_505_M_L', 2.0], ['AGILITY_505_M_R', 2.1]]);
    expect(recomputeDerived(meters).has('AGILITY_505_YD')).toBe(false);
  });
});
