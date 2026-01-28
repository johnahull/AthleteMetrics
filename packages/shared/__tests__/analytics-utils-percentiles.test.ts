/**
 * Tests for expanded percentile calculations (p20, p30, p40, p60, p70, p80)
 * Required for quintile and decile distribution breakdown modes
 */

import { describe, it, expect } from 'vitest';
import { calculateStatistics } from '../analytics-utils';

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
