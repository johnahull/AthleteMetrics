import { describe, it, expect } from 'vitest';
import { evaluateTierBenchmark } from './benchmark-tiers';

const tiers = [
  { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: '28', maxValue: '40', name: 'VJ Elite' },
  { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: '24', maxValue: '28', name: 'VJ Varsity' },
  { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, minValue: '20', maxValue: '24', name: 'VJ JV' },
];

describe('evaluateTierBenchmark', () => {
  it('matches the tier a higher-is-better value falls into and distance to next', () => {
    const c = evaluateTierBenchmark(25.5, false, tiers)!;
    expect(c.tierName).toBe('Varsity');
    expect(c.nextTierName).toBe('Elite');
    expect(c.distanceToNextTier).toBeCloseTo(2.5);
    expect(c.isBestTier).toBe(false);
    expect(c.allTiers).toHaveLength(3);
  });

  it('flags the best tier with no next', () => {
    const c = evaluateTierBenchmark(30, false, tiers)!;
    expect(c.tierName).toBe('Elite');
    expect(c.isBestTier).toBe(true);
    expect(c.distanceToNextTier).toBeNull();
  });

  it('computes distance for lower-is-better (time) metrics', () => {
    const timeTiers = [
      { tierName: 'Elite', tierColor: '#a', tierOrder: 1, minValue: '1.00', maxValue: '1.20', name: 'Fly Elite' },
      { tierName: 'Varsity', tierColor: '#b', tierOrder: 2, minValue: '1.20', maxValue: '1.40', name: 'Fly Varsity' },
    ];
    const c = evaluateTierBenchmark(1.32, true, timeTiers)!;
    expect(c.tierName).toBe('Varsity');
    expect(c.distanceToNextTier).toBeCloseTo(0.12);
  });

  it('returns null for empty tiers', () => {
    expect(evaluateTierBenchmark(10, false, [])).toBeNull();
  });
});
