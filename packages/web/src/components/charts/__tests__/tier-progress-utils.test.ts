import { describe, it, expect } from 'vitest';
import { tierSegments, athletePositionPct, athletePositionPctForValue, nextTierCaption, benchmarkStandingPct, benchmarkStandingPctForValue, benchmarkStandingCaption, benchmarkBetterDirection, evaluateTierStanding } from '../tier-progress-utils';
import type { BenchmarkComparison, TierInfo } from '@shared/benchmark-types';

const cmp: BenchmarkComparison = {
  benchmarkName: 'VJ', benchmarkValue: 26, athleteValue: 25.5, meetsOrExceeds: true,
  percentageDiff: 0, comparisonOperator: 'range', tierName: 'Varsity', tierColor: '#86efac',
  tierOrder: 2, distanceToNextTier: 2.5, nextTierName: 'Elite', isBestTier: false,
  allTiers: [
    { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, minValue: 20, maxValue: 24 },
    { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: 24, maxValue: 28 },
    { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: 28, maxValue: 32 },
  ],
};

describe('tier-progress-utils', () => {
  it('orders segments worst->best (left->right)', () => {
    expect(tierSegments(cmp).map(s => s.tierName)).toEqual(['JV', 'Varsity', 'Elite']);
  });
  it('positions the athlete within the overall value range (0..1)', () => {
    expect(athletePositionPct(cmp)).toBeCloseTo(0.458, 2); // (25.5-20)/(32-20)
  });
  it('lands the marker within the correct segment for unequal/open-ended bands', () => {
    const n = 3;
    const openEnded: BenchmarkComparison = {
      ...cmp,
      athleteValue: 25, // falls in the open-ended top tier
      tierName: 'Elite',
      allTiers: [
        { tierName: 'Below', tierColor: '#fde68a', tierOrder: 3, minValue: null, maxValue: 10 },
        { tierName: 'Mid', tierColor: '#86efac', tierOrder: 2, minValue: 10, maxValue: 20 },
        { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: 20, maxValue: null },
      ],
    };
    const pos = athletePositionPct(openEnded);
    const index = 2; // Elite is worst->best index 2
    // Marker must sit within the Elite segment's index range.
    expect(pos).toBeGreaterThanOrEqual(index / n);
    expect(pos).toBeLessThanOrEqual((index + 1) / n);
    // Open-ended band uses the segment center -> (2 + 0.5) / 3.
    expect(pos).toBeCloseTo((index + 0.5) / n, 5);
  });
  it('returns 0 (no NaN) when there are no tiers', () => {
    expect(athletePositionPct({ ...cmp, allTiers: [] })).toBe(0);
    expect(athletePositionPct({ ...cmp, allTiers: undefined })).toBe(0);
  });
  it('handles a degenerate band (min === max) without producing NaN', () => {
    const degenerate: BenchmarkComparison = {
      ...cmp,
      athleteValue: 10,
      allTiers: [{ tierName: 'Only', tierColor: '#ccc', tierOrder: 1, minValue: 10, maxValue: 10 }],
    };
    const pos = athletePositionPct(degenerate);
    expect(Number.isFinite(pos)).toBe(true);
    expect(pos).toBeCloseTo(0.5, 5); // single segment, center fraction
  });
  it('handles fully open-ended (null/null) bands without producing NaN', () => {
    const allNull: BenchmarkComparison = {
      ...cmp,
      athleteValue: 5,
      allTiers: [{ tierName: 'Any', tierColor: '#ccc', tierOrder: 1, minValue: null, maxValue: null }],
    };
    const pos = athletePositionPct(allNull);
    expect(Number.isFinite(pos)).toBe(true);
    expect(pos).toBeCloseTo(0.5, 5);
  });
  it('captions distance to next tier', () => {
    expect(nextTierCaption(cmp, 'in')).toBe('2.5 in to Elite');
    expect(nextTierCaption({ ...cmp, isBestTier: true, nextTierName: null, distanceToNextTier: null }, 'in')).toBe('Top tier ✓');
  });
});

describe('benchmarkStandingPct', () => {
  it('places the marker right of center when the athlete value is higher than the benchmark', () => {
    // value-based: higher value → right, regardless of which direction is "better"
    expect(benchmarkStandingPct({ athleteValue: 22, benchmarkValue: 20 } as BenchmarkComparison)).toBeCloseTo(0.6, 5);
  });
  it('places the marker left of center when the athlete value is lower than the benchmark', () => {
    expect(benchmarkStandingPct({ athleteValue: 18, benchmarkValue: 20 } as BenchmarkComparison)).toBeCloseTo(0.4, 5);
  });
  it('clamps the offset to 0.45 in either direction (by value, not by meets)', () => {
    expect(benchmarkStandingPct({ athleteValue: 100, benchmarkValue: 20 } as BenchmarkComparison)).toBeCloseTo(0.95, 5);
    expect(benchmarkStandingPct({ athleteValue: 5, benchmarkValue: 20 } as BenchmarkComparison)).toBeCloseTo(0.05, 5);
  });
  it('returns center when the benchmark value is zero', () => {
    expect(benchmarkStandingPct({ athleteValue: 5, benchmarkValue: 0 } as BenchmarkComparison)).toBeCloseTo(0.5, 5);
  });
});

describe('benchmarkStandingPctForValue', () => {
  it('places the marker right of center when the value is higher than the benchmark', () => {
    expect(benchmarkStandingPctForValue(22, 20)).toBeCloseTo(0.6, 5);
  });
  it('places the marker left of center when the value is lower than the benchmark', () => {
    expect(benchmarkStandingPctForValue(18, 20)).toBeCloseTo(0.4, 5);
  });
  it('clamps the offset to 0.45 in either direction', () => {
    expect(benchmarkStandingPctForValue(100, 20)).toBeCloseTo(0.95, 5);
    expect(benchmarkStandingPctForValue(5, 20)).toBeCloseTo(0.05, 5);
  });
  it('returns center when the benchmark value is zero', () => {
    expect(benchmarkStandingPctForValue(5, 0)).toBeCloseTo(0.5, 5);
  });
  it('is the core benchmarkStandingPct delegates to, producing identical results for every case in the wrapper suite above', () => {
    const cases: Array<[number, number]> = [[22, 20], [18, 20], [100, 20], [5, 20], [5, 0]];
    for (const [athleteValue, benchmarkValue] of cases) {
      expect(benchmarkStandingPct({ athleteValue, benchmarkValue } as BenchmarkComparison)).toBe(
        benchmarkStandingPctForValue(athleteValue, benchmarkValue)
      );
    }
  });
});

describe('athletePositionPctForValue', () => {
  const segs = tierSegments(cmp); // [JV(20-24), Varsity(24-28), Elite(28-32)] worst->best

  it('positions a value inside a band correctly', () => {
    // 25.5 falls in Varsity segment (index 1): (25.5-20)/(32-20) overall range fraction
    expect(athletePositionPctForValue(25.5, segs)).toBeCloseTo(0.458, 2);
  });

  it('clamps a value outside all bands to the nearest boundary segment', () => {
    const openEndedSegs: TierInfo[] = [
      { tierName: 'Below', tierColor: '#fde68a', tierOrder: 3, minValue: null, maxValue: 10 },
      { tierName: 'Mid', tierColor: '#86efac', tierOrder: 2, minValue: 10, maxValue: 20 },
      { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: 20, maxValue: null },
    ];
    const pos = athletePositionPctForValue(25, openEndedSegs);
    expect(pos).toBeGreaterThanOrEqual(2 / 3);
    expect(pos).toBeLessThanOrEqual(1);
  });

  it('positions a value exactly at a segment boundary', () => {
    // 24 sits exactly at the JV/Varsity boundary; findIndex matches JV first (inclusive on both ends).
    const pos = athletePositionPctForValue(24, segs);
    expect(pos).toBeCloseTo(1 / 3, 5); // top of JV segment (index 0, f=1) => (0+1)/3
  });

  it('returns 0 for an empty segment array', () => {
    expect(athletePositionPctForValue(10, [])).toBe(0);
  });

  it('is the core athletePositionPct delegates to, producing identical results', () => {
    expect(athletePositionPct(cmp)).toBe(athletePositionPctForValue(cmp.athleteValue, tierSegments(cmp)));
  });
});

describe('benchmarkBetterDirection', () => {
  it('infers higher-is-better from a gte operator', () => {
    expect(benchmarkBetterDirection({ comparisonOperator: 'gte' } as BenchmarkComparison)).toBe('higher');
  });
  it('infers lower-is-better from an lte operator', () => {
    expect(benchmarkBetterDirection({ comparisonOperator: 'lte' } as BenchmarkComparison)).toBe('lower');
  });
  it('returns none for eq/other operators', () => {
    expect(benchmarkBetterDirection({ comparisonOperator: 'eq' } as BenchmarkComparison)).toBe('none');
  });
});

describe('benchmarkStandingCaption', () => {
  it('captions a missed benchmark standing with absolute difference', () => {
    expect(benchmarkStandingCaption({ meetsOrExceeds: false, athleteValue: 1.13, benchmarkValue: 1.10 } as BenchmarkComparison, 's')).toBe('✗ Misses by 0.03 s');
  });
  it('captions a meets standing with absolute difference', () => {
    expect(benchmarkStandingCaption({ meetsOrExceeds: true, athleteValue: 22, benchmarkValue: 20 } as BenchmarkComparison, 'in')).toBe('✓ Meets (by 2 in)');
  });
  it('omits the unit when none is provided', () => {
    expect(benchmarkStandingCaption({ meetsOrExceeds: true, athleteValue: 22, benchmarkValue: 20 } as BenchmarkComparison)).toBe('✓ Meets (by 2)');
  });
});

describe('evaluateTierStanding', () => {
  const allTiers: TierInfo[] = [
    { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, minValue: 20, maxValue: 24 },
    { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: 24, maxValue: 28 },
    { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: 28, maxValue: 32 },
  ];

  it('matches the tier band the value falls into and flags it as not-best', () => {
    const cmp = evaluateTierStanding(25.5, allTiers, 'Vertical Jump');
    expect(cmp.tierName).toBe('Varsity');
    expect(cmp.isBestTier).toBe(false);
    expect(cmp.nextTierName).toBe('Elite');
    expect(cmp.distanceToNextTier).toBeCloseTo(2.5, 2);
    expect(cmp.allTiers).toEqual([...allTiers].sort((a, b) => a.tierOrder - b.tierOrder));
    expect(cmp.athleteValue).toBe(25.5);
    expect(cmp.tierGroupName).toBe('Vertical Jump');
  });

  it('flags the best (lowest tierOrder) tier as isBestTier with no next tier', () => {
    const cmp = evaluateTierStanding(30, allTiers);
    expect(cmp.tierName).toBe('Elite');
    expect(cmp.isBestTier).toBe(true);
    expect(cmp.nextTierName).toBeUndefined();
    expect(cmp.distanceToNextTier).toBeNull();
  });

  it('clamps a value above the best tier band to the best tier', () => {
    const cmp = evaluateTierStanding(40, allTiers);
    expect(cmp.tierName).toBe('Elite');
    expect(cmp.isBestTier).toBe(true);
  });

  it('clamps a value below the worst tier band to the nearest (worst) tier', () => {
    const cmp = evaluateTierStanding(5, allTiers);
    expect(cmp.tierName).toBe('JV');
    expect(cmp.isBestTier).toBe(false);
  });

  it('does not produce NaN for a degenerate single-tier group', () => {
    const cmp = evaluateTierStanding(10, [{ tierName: 'Only', tierColor: '#ccc', tierOrder: 1, minValue: null, maxValue: null }]);
    expect(cmp.isBestTier).toBe(true);
    expect(Number.isFinite(cmp.athleteValue)).toBe(true);
  });

  // Lower-is-better tiers (e.g. a sprint time): tierOrder 1 is still "best",
  // but "best" now occupies the LOWEST numeric band, the mirror image of the
  // higher-is-better fixture above.
  const lowerIsBetterTiers: TierInfo[] = [
    { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: 1.00, maxValue: 1.20 },
    { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: 1.20, maxValue: 1.50 },
    { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, minValue: 1.50, maxValue: 1.60 },
  ];

  it('for a lower-is-better metric, clamps a value worse than every band to the worst tier, not the best', () => {
    // 1.90s is slower than JV's own worst boundary (1.60) — beyond every
    // defined band. Regression for a bug where the out-of-range fallback
    // ignored direction and always favored the "value > max" branch,
    // misclassifying this as Elite.
    const cmp = evaluateTierStanding(1.90, lowerIsBetterTiers, 'Sprint', true);
    expect(cmp.tierName).toBe('JV');
    expect(cmp.isBestTier).toBe(false);
  });

  it('for a lower-is-better metric, computes distanceToNextTier toward the next tier\'s own boundary', () => {
    // 1.45s sits in Varsity (1.20-1.50); the next better tier is Elite, whose
    // relevant boundary to cross is its OWN maxValue (1.20), not matched's.
    const cmp = evaluateTierStanding(1.45, lowerIsBetterTiers, 'Sprint', true);
    expect(cmp.tierName).toBe('Varsity');
    expect(cmp.nextTierName).toBe('Elite');
    expect(cmp.distanceToNextTier).toBeCloseTo(0.25, 2);
  });
});
