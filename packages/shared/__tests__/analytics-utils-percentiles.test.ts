/**
 * Tests for expanded percentile calculations (p20, p30, p40, p60, p70, p80)
 * Required for quintile and decile distribution breakdown modes
 */

import { describe, it, expect } from 'vitest';
import { calculateStatistics, filterToBestPerPlayer } from '../analytics-utils';

describe('Expanded Percentiles', () => {
  it('should return all expanded percentile keys for empty array', () => {
    const result = calculateStatistics([]);
    expect(result.percentiles.p20).toBe(0);
    expect(result.percentiles.p30).toBe(0);
    expect(result.percentiles.p40).toBe(0);
    expect(result.percentiles.p60).toBe(0);
    expect(result.percentiles.p70).toBe(0);
    expect(result.percentiles.p80).toBe(0);
  });

  it('should return single value for all expanded percentiles with one element', () => {
    const result = calculateStatistics([42]);
    expect(result.percentiles.p20).toBe(42);
    expect(result.percentiles.p30).toBe(42);
    expect(result.percentiles.p40).toBe(42);
    expect(result.percentiles.p60).toBe(42);
    expect(result.percentiles.p70).toBe(42);
    expect(result.percentiles.p80).toBe(42);
  });

  it('should compute correct expanded percentiles for 1-100 dataset', () => {
    // Values 1..100 — percentile P maps to value P (approximately)
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = calculateStatistics(values);

    // Linear interpolation on sorted 1..100 (length 100, index = P/100 * 99)
    // p20: index 19.8 → 20*0.2 + 21*0.8 ≈ 20.8
    expect(result.percentiles.p20).toBeCloseTo(20.8, 1);
    expect(result.percentiles.p30).toBeCloseTo(30.7, 1);
    expect(result.percentiles.p40).toBeCloseTo(40.6, 1);
    expect(result.percentiles.p60).toBeCloseTo(60.4, 1);
    expect(result.percentiles.p70).toBeCloseTo(70.3, 1);
    expect(result.percentiles.p80).toBeCloseTo(80.2, 1);
  });

  it('should maintain existing percentile keys alongside new ones', () => {
    const values = [10, 20, 30, 40, 50];
    const result = calculateStatistics(values);

    // Existing keys still present
    expect(result.percentiles).toHaveProperty('p5');
    expect(result.percentiles).toHaveProperty('p10');
    expect(result.percentiles).toHaveProperty('p25');
    expect(result.percentiles).toHaveProperty('p50');
    expect(result.percentiles).toHaveProperty('p75');
    expect(result.percentiles).toHaveProperty('p90');
    expect(result.percentiles).toHaveProperty('p95');

    // New keys
    expect(result.percentiles).toHaveProperty('p20');
    expect(result.percentiles).toHaveProperty('p30');
    expect(result.percentiles).toHaveProperty('p40');
    expect(result.percentiles).toHaveProperty('p60');
    expect(result.percentiles).toHaveProperty('p70');
    expect(result.percentiles).toHaveProperty('p80');
  });
});

describe('filterToBestPerPlayer direction awareness', () => {
  interface Item { id: string; playerId: string; value: number; }
  const getId = (i: Item) => i.playerId;
  const getValue = (i: Item) => i.value;

  it('should pick lowest value for lower_is_better metric (FLY10_TIME)', () => {
    const items: Item[] = [
      { id: '1', playerId: 'p1', value: 1.15 },
      { id: '2', playerId: 'p1', value: 1.08 },
      { id: '3', playerId: 'p1', value: 1.20 },
    ];
    const result = filterToBestPerPlayer(items, 'FLY10_TIME', getId, getValue);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1.08);
  });

  it('should pick highest value for higher_is_better metric (VERTICAL_JUMP)', () => {
    const items: Item[] = [
      { id: '1', playerId: 'p1', value: 28 },
      { id: '2', playerId: 'p1', value: 34 },
      { id: '3', playerId: 'p1', value: 31 },
    ];
    const result = filterToBestPerPlayer(items, 'VERTICAL_JUMP', getId, getValue);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(34);
  });

  it('should handle multiple players with mixed directions', () => {
    const items: Item[] = [
      { id: '1', playerId: 'p1', value: 4.5 },
      { id: '2', playerId: 'p1', value: 4.3 },
      { id: '3', playerId: 'p2', value: 4.8 },
      { id: '4', playerId: 'p2', value: 4.6 },
    ];
    // DASH_40YD is lower_is_better
    const result = filterToBestPerPlayer(items, 'DASH_40YD', getId, getValue);
    expect(result).toHaveLength(2);
    const p1Best = result.find(r => r.playerId === 'p1');
    const p2Best = result.find(r => r.playerId === 'p2');
    expect(p1Best?.value).toBe(4.3);
    expect(p2Best?.value).toBe(4.6);
  });
});
