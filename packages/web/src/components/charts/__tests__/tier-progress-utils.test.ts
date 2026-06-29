import { describe, it, expect } from 'vitest';
import { tierSegments, athletePositionPct, nextTierCaption } from '../tier-progress-utils';
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
  it('captions distance to next tier', () => {
    expect(nextTierCaption(cmp, 'in')).toBe('2.5 in to Elite');
    expect(nextTierCaption({ ...cmp, isBestTier: true, nextTierName: null, distanceToNextTier: null }, 'in')).toBe('Top tier ✓');
  });
});
