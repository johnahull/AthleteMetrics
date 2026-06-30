import { describe, it, expect } from 'vitest';
import { tierSegments, athletePositionPct, nextTierCaption, benchmarkStandingPct, benchmarkStandingCaption, benchmarkBetterDirection } from '../tier-progress-utils';
import type { BenchmarkComparison } from '@shared/benchmark-types';

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
