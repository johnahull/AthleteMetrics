import { describe, it, expect } from 'vitest';
import { computeDistribution } from '../report-distributions';

describe('computeDistribution', () => {
  it('computes five-number stats from the full population (peers + athlete); values are the peers', () => {
    // peers already exclude the focal athlete (removed by id upstream)
    const d = computeDistribution([10, 20, 40, 50], 30)!;
    // stats population = peers + athlete = [10,20,30,40,50]
    expect(d.stats.min).toBe(10);
    expect(d.stats.max).toBe(50);
    expect(d.stats.median).toBe(30);
    expect(d.stats.q1).toBeCloseTo(20, 5);
    expect(d.stats.q3).toBeCloseTo(40, 5);
    expect(d.athleteValue).toBe(30);
    // values are the peers only (athlete is added back by the consumer as the marker)
    expect(d.values).toEqual([10, 20, 40, 50]);
  });

  it('returns null for fewer than 2 peers', () => {
    expect(computeDistribution([42], 42)).toBeNull();
    expect(computeDistribution([], 1)).toBeNull();
  });

  it('does not sample — returns every peer so counts are exact for large orgs', () => {
    const peers = Array.from({ length: 1000 }, (_, i) => i + 1); // 1..1000
    const d = computeDistribution(peers, 500)!;
    expect(d.values).toHaveLength(1000);
    expect(d.stats.min).toBe(1);
    expect(d.stats.max).toBe(1000);
    // a peer legitimately sharing the athlete's value is kept (exclusion is by id upstream)
    expect(d.values).toContain(500);
  });

  it('returns sorted values for unsorted peer input', () => {
    const d = computeDistribution([40, 10, 30, 20], 25)!;
    expect(d.values).toEqual([10, 20, 30, 40]);
    // stats population includes the athlete (25)
    expect(d.stats.min).toBe(10);
    expect(d.stats.median).toBe(25);
    expect(d.stats.max).toBe(40);
  });
});
