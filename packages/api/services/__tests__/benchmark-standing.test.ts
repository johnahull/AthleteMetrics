import { describe, it, expect } from 'vitest';
import { belowAverageStanding, isBelowAverageComparison, tierPlace } from '../benchmark-standing';

const range = (tierName: string, tiers: string[]) => ({ comparisonOperator: 'range', tierName, allTiers: tiers.map((tierName) => ({ tierName })) });
const single = (meetsOrExceeds: boolean) => ({ comparisonOperator: 'gte', meetsOrExceeds });

describe('isBelowAverageComparison', () => {
  it('a tier is below average in the bottom half of its group (index >= size / 2)', () => {
    const t4 = ['A', 'B', 'C', 'D'];
    expect(['A', 'B', 'C', 'D'].map((n) => isBelowAverageComparison(range(n, t4)))).toEqual([false, false, true, true]);
    const t3 = ['A', 'B', 'C'];
    expect(['A', 'B', 'C'].map((n) => isBelowAverageComparison(range(n, t3)))).toEqual([false, false, true]);
    expect(isBelowAverageComparison(range('Average', ['Good', 'Average']))).toBe(true);
    expect(isBelowAverageComparison(range('Good', ['Good', 'Average']))).toBe(false);
  });
  it('a single-threshold benchmark is below average when it is failed', () => {
    expect(isBelowAverageComparison(single(false))).toBe(true);
    expect(isBelowAverageComparison(single(true))).toBe(false);
  });
  it('a group of one tier, or an unknown tier, says nothing', () => {
    expect(isBelowAverageComparison(range('A', ['A']))).toBeUndefined();
    expect(isBelowAverageComparison(range('Z', ['A', 'B']))).toBeUndefined();
    expect(isBelowAverageComparison({ comparisonOperator: 'gte' })).toBeUndefined();
  });
});

describe('tierPlace', () => {
  it('reports the bottom tier', () => {
    expect(tierPlace(range('B', ['A', 'B']))).toEqual({ i: 1, n: 2, bottom: true });
    expect(tierPlace(range('A', ['A', 'B']))?.bottom).toBe(false);
  });
});

describe('belowAverageStanding', () => {
  it('benchmark comparisons decide; a Good-tier result at the 40th percentile is not below average', () => {
    expect(belowAverageStanding([range('Good', ['Good', 'Average'])], 40)).toBe(false);
  });
  it('any failed comparison makes it below average', () => {
    expect(belowAverageStanding([range('Good', ['Good', 'Average']), single(false)], 90)).toBe(true);
  });
  it('the percentile is used only when there is no benchmark comparison at all', () => {
    expect(belowAverageStanding(undefined, 30)).toBe(true);
    expect(belowAverageStanding([], 50)).toBe(false);
    expect(belowAverageStanding([], undefined)).toBeUndefined();
  });
  it('comparisons that say nothing fall back to the percentile', () => {
    expect(belowAverageStanding([range('A', ['A'])], 30)).toBe(true);
  });
});
