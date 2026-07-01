import { describe, it, expect } from 'vitest';
import { computeDistribution } from '../report-distributions';

describe('computeDistribution', () => {
  it('computes five-number stats from the full set; values exclude the athlete', () => {
    const d = computeDistribution([10, 20, 30, 40, 50], 30, 100)!;
    expect(d.stats.min).toBe(10);
    expect(d.stats.max).toBe(50);
    expect(d.stats.median).toBe(30);
    expect(d.stats.q1).toBeCloseTo(20, 5);
    expect(d.stats.q3).toBeCloseTo(40, 5);
    expect(d.athleteValue).toBe(30);
    // One occurrence of the athlete's own value (30) is removed from the dots.
    expect(d.values).toEqual([10, 20, 40, 50]);
    expect(d.values).toHaveLength(4);
  });

  it('returns null for fewer than 2 peers', () => {
    expect(computeDistribution([42], 42, 100)).toBeNull();
    expect(computeDistribution([], 1, 100)).toBeNull();
  });

  it('samples values deterministically down to the cap; stats use the full set; athlete excluded', () => {
    const full = Array.from({ length: 1000 }, (_, i) => i + 1); // 1..1000
    const d = computeDistribution(full, 500, 150)!;
    expect(d.values.length).toBeLessThanOrEqual(150);
    expect(d.stats.min).toBe(1);
    expect(d.stats.max).toBe(1000);
    expect(computeDistribution(full, 500, 150)!.values).toEqual(d.values);
    // The athlete's own value is removed before sampling, so it never appears as a dot.
    expect(d.values).not.toContain(500);
  });

  it('does not sample when under the cap; excludes one occurrence of the athlete value', () => {
    const d = computeDistribution([1, 2, 3, 4], 3, 150)!;
    expect(d.values).toEqual([1, 2, 4]);
  });

  it('returns sorted values for unsorted input under the cap; nothing removed when athlete absent', () => {
    const d = computeDistribution([40, 10, 30, 20], 25, 150)!;
    expect(d.values).toEqual([10, 20, 30, 40]);
    expect(d.stats.min).toBe(10);
    expect(d.stats.max).toBe(40);
  });
});
