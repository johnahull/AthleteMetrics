import { describe, it, expect } from 'vitest';
import { evaluateTierBenchmark } from '../benchmark-tiers';

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

  it('matches single-value tiers with comparisonOperator "lte"', () => {
    const lteTiers = [
      { tierName: 'Gold', tierColor: '#g', tierOrder: 1, benchmarkValue: '1.10', comparisonOperator: 'lte', name: 'T Gold' },
      { tierName: 'Silver', tierColor: '#s', tierOrder: 2, benchmarkValue: '1.30', comparisonOperator: 'lte', name: 'T Silver' },
    ];
    const c = evaluateTierBenchmark(1.25, true, lteTiers)!;
    expect(c.tierName).toBe('Silver');
    expect(c.isBestTier).toBe(false);
  });

  it('matches single-value tiers with comparisonOperator "gte"', () => {
    const gteTiers = [
      { tierName: 'Gold', tierColor: '#g', tierOrder: 1, benchmarkValue: '30', comparisonOperator: 'gte', name: 'V Gold' },
      { tierName: 'Silver', tierColor: '#s', tierOrder: 2, benchmarkValue: '20', comparisonOperator: 'gte', name: 'V Silver' },
    ];
    const c = evaluateTierBenchmark(25, false, gteTiers)!;
    expect(c.tierName).toBe('Silver');
    expect(c.isBestTier).toBe(false);
  });

  it('snaps a value outside all ranges to the nearest tier by boundary distance', () => {
    // 10 is below every range; nearest boundary is JV's minValue (20), distance 10.
    const c = evaluateTierBenchmark(10, false, tiers)!;
    expect(c.tierName).toBe('JV');
    expect(c.tierOrder).toBe(3);
    expect(c.isBestTier).toBe(false);
  });

  it('assigns the best tier when a value beats the best tier boundary', () => {
    // 50 exceeds Elite's maxValue (40) for a higher-is-better metric.
    const c = evaluateTierBenchmark(50, false, tiers)!;
    expect(c.tierName).toBe('Elite');
    expect(c.isBestTier).toBe(true);
    expect(c.distanceToNextTier).toBeNull();
  });

  it('surfaces the coachingNote of the matched tier', () => {
    const noteTiers = [
      { tierName: 'Elite', tierColor: '#a', tierOrder: 1, minValue: '28', maxValue: '40', name: 'VJ Elite', coachingNote: 'Keep it up' },
      { tierName: 'Varsity', tierColor: '#b', tierOrder: 2, minValue: '24', maxValue: '28', name: 'VJ Varsity', coachingNote: 'Push harder' },
    ];
    const c = evaluateTierBenchmark(26, false, noteTiers)!;
    expect(c.tierName).toBe('Varsity');
    expect(c.coachingNote).toBe('Push harder');
  });
});
