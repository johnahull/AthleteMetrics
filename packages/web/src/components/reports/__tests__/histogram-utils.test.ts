import { describe, it, expect } from 'vitest';
import { computeHistogram, percentBetterThanPeers } from '../histogram-utils';

describe('computeHistogram', () => {
  it('counts the whole org population (peers + the athlete) across the bins', () => {
    const peers = [10, 12, 14, 16, 18, 20];
    const bins = computeHistogram(peers, 15, 4);
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    // 6 peers + the athlete = 7 people distributed across the bins
    expect(total).toBe(7);
  });

  it('flags exactly one bin as the athlete bin, and it contains the athlete value', () => {
    const bins = computeHistogram([10, 12, 14, 16, 18, 20], 15, 4);
    const athleteBins = bins.filter((b) => b.isAthlete);
    expect(athleteBins).toHaveLength(1);
    const b = athleteBins[0];
    expect(15).toBeGreaterThanOrEqual(b.start);
    expect(15).toBeLessThanOrEqual(b.end);
  });

  it('places the athlete at the population maximum into the last bin', () => {
    const bins = computeHistogram([10, 12, 14, 16, 18], 20, 5);
    expect(bins[bins.length - 1].isAthlete).toBe(true);
    // the max value must be counted, not dropped past the final edge
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(6);
  });

  it('produces a single bin when every value is identical', () => {
    const bins = computeHistogram([12, 12, 12], 12, 8);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(4); // 3 peers + athlete
    expect(bins[0].isAthlete).toBe(true);
  });

  it('never creates more bins than there are people', () => {
    const bins = computeHistogram([10, 20], 30, 8); // 3 people, asked for 8 bins
    expect(bins.length).toBeLessThanOrEqual(3);
  });

  it('computes correct per-bin counts for a known dataset', () => {
    // population = peers [0,1,2,3] + athlete 4 = [0,1,2,3,4], range 0..4, 4 bins width 1
    // bin0 [0,1): {0}=1  bin1 [1,2): {1}=1  bin2 [2,3): {2}=1  bin3 [3,4]: {3,4}=2
    const bins = computeHistogram([0, 1, 2, 3], 4, 4);
    expect(bins.map((b) => b.count)).toEqual([1, 1, 1, 2]);
    expect(bins[3].isAthlete).toBe(true);
  });
});

describe('percentBetterThanPeers', () => {
  it('higher-is-better: counts peers with a lower value', () => {
    // athlete 15 beats [10,12,14] but not [16,18] → 3/5 = 60%
    expect(percentBetterThanPeers([10, 12, 14, 16, 18], 15, 'higher')).toBe(60);
  });

  it('lower-is-better: counts peers with a higher (worse) value', () => {
    // athlete 4.5s beats slower peers [5,6] but not [4,3] → 2/4 = 50%
    expect(percentBetterThanPeers([3, 4, 5, 6], 4.5, 'lower')).toBe(50);
  });

  it('returns 0 when there are no peers', () => {
    expect(percentBetterThanPeers([], 10, 'higher')).toBe(0);
  });
});
