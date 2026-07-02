import { describe, it, expect } from 'vitest';
import { evaluateTierBenchmark, selectTierGroup, type SourcedTierRow } from '../benchmark-tiers';

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

  it('assigns the BETTER tier when a value sits exactly on a shared boundary', () => {
    // 28 is the shared boundary between Elite (min 28) and Varsity (max 28).
    // Iteration runs best-first (tierOrder ascending); the inclusive range check
    // (>= min && <= max) matches Elite first, so the better tier wins.
    const c = evaluateTierBenchmark(28, false, tiers)!;
    expect(c.tierName).toBe('Elite');
    expect(c.tierOrder).toBe(1);
    expect(c.isBestTier).toBe(true);
  });

  it('snaps a value in a GAP between non-contiguous ranges to the nearest boundary', () => {
    // Non-contiguous, pre-sorted ascending by tierOrder. Gap is (25, 30).
    const gapTiers = [
      { tierName: 'Elite', tierColor: '#a', tierOrder: 1, minValue: '30', maxValue: '40', name: 'VJ Elite' },
      { tierName: 'Varsity', tierColor: '#b', tierOrder: 2, minValue: '20', maxValue: '25', name: 'VJ Varsity' },
    ];
    // 26 sits in the gap: distance to Varsity.max (25) = 1, to Elite.min (30) = 4.
    // Nearest boundary is Varsity's, so the athlete is assigned Varsity (tierOrder 2),
    // and the distance to the next better tier is Elite.min (30) - 26 = 4.
    const c = evaluateTierBenchmark(26, false, gapTiers)!;
    expect(c.tierName).toBe('Varsity');
    expect(c.tierOrder).toBe(2);
    expect(c.isBestTier).toBe(false);
    expect(c.nextTierName).toBe('Elite');
    expect(c.distanceToNextTier).toBeCloseTo(4);
  });

  it('falls back to the matched tier name when tierGroupId is absent', () => {
    // The `tiers` rows have no tierGroupId, so tierGroupName/benchmarkName fall
    // back to the matched tier's own `name` ('VJ Varsity') rather than a derived
    // group name.
    const c = evaluateTierBenchmark(25.5, false, tiers)!;
    expect(c.tierName).toBe('Varsity');
    expect(c.tierGroupName).toBe('VJ Varsity');
    expect(c.benchmarkName).toBe('VJ Varsity');
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

describe('selectTierGroup', () => {
  it('returns [] for no rows', () => {
    expect(selectTierGroup([])).toEqual([]);
  });

  it('returns a single group sorted ascending by tierOrder', () => {
    const rows: SourcedTierRow[] = [
      { tierName: 'JV', tierOrder: 3, _source: 'site', tierGroupId: 'g1', displayOrder: 0 },
      { tierName: 'Elite', tierOrder: 1, _source: 'site', tierGroupId: 'g1', displayOrder: 0 },
      { tierName: 'Varsity', tierOrder: 2, _source: 'site', tierGroupId: 'g1', displayOrder: 0 },
    ];
    const result = selectTierGroup(rows);
    expect(result.map((t) => t.tierName)).toEqual(['Elite', 'Varsity', 'JV']);
  });

  it('picks the group with the lower displayOrder', () => {
    const rows: SourcedTierRow[] = [
      { tierName: 'A1', tierOrder: 1, _source: 'site', tierGroupId: 'g1', displayOrder: 5 },
      { tierName: 'A2', tierOrder: 2, _source: 'site', tierGroupId: 'g1', displayOrder: 5 },
      { tierName: 'B1', tierOrder: 1, _source: 'custom', tierGroupId: 'g2', displayOrder: 1 },
      { tierName: 'B2', tierOrder: 2, _source: 'custom', tierGroupId: 'g2', displayOrder: 1 },
    ];
    const result = selectTierGroup(rows);
    // g2 has lower displayOrder (1 < 5), so it is chosen.
    expect(result.map((t) => t.tierName)).toEqual(['B1', 'B2']);
  });

  it('breaks displayOrder ties deterministically by group key', () => {
    const rows: SourcedTierRow[] = [
      // Same displayOrder for both groups -> tie broken by group key string.
      // Keys: 'site:g1' vs 'custom:g2'. 'custom:g2' < 'site:g1', so custom group wins.
      { tierName: 'Site1', tierOrder: 1, _source: 'site', tierGroupId: 'g1', displayOrder: 2 },
      { tierName: 'Site2', tierOrder: 2, _source: 'site', tierGroupId: 'g1', displayOrder: 2 },
      { tierName: 'Cust1', tierOrder: 1, _source: 'custom', tierGroupId: 'g2', displayOrder: 2 },
      { tierName: 'Cust2', tierOrder: 2, _source: 'custom', tierGroupId: 'g2', displayOrder: 2 },
    ];
    const result = selectTierGroup(rows);
    expect(result.map((t) => t.tierName)).toEqual(['Cust1', 'Cust2']);
  });
});
