/**
 * Tests for mutual exclusion logic between FLY10_TIME and TOP_SPEED
 */

import { describe, it, expect } from 'vitest';

// Inline the mutual exclusion logic for testing
const MUTUALLY_EXCLUSIVE_METRICS: Record<string, string> = {
  FLY10_TIME: 'TOP_SPEED',
  TOP_SPEED: 'FLY10_TIME',
};

function isMetricExcluded(metric: string, selectedMetrics: string[]): boolean {
  const exclusiveMetric = MUTUALLY_EXCLUSIVE_METRICS[metric];
  if (!exclusiveMetric) return false;
  return selectedMetrics.includes(exclusiveMetric);
}

describe('Mutual Exclusion Logic', () => {
  it('should exclude TOP_SPEED when FLY10_TIME is selected', () => {
    const selectedMetrics = ['FLY10_TIME'];
    expect(isMetricExcluded('TOP_SPEED', selectedMetrics)).toBe(true);
  });

  it('should exclude FLY10_TIME when TOP_SPEED is selected', () => {
    const selectedMetrics = ['TOP_SPEED'];
    expect(isMetricExcluded('FLY10_TIME', selectedMetrics)).toBe(true);
  });

  it('should not exclude VERTICAL_JUMP when FLY10_TIME is selected', () => {
    const selectedMetrics = ['FLY10_TIME'];
    expect(isMetricExcluded('VERTICAL_JUMP', selectedMetrics)).toBe(false);
  });

  it('should not exclude VERTICAL_JUMP when TOP_SPEED is selected', () => {
    const selectedMetrics = ['TOP_SPEED'];
    expect(isMetricExcluded('VERTICAL_JUMP', selectedMetrics)).toBe(false);
  });

  it('should allow both FLY10_TIME and VERTICAL_JUMP', () => {
    const selectedMetrics = ['VERTICAL_JUMP'];
    expect(isMetricExcluded('FLY10_TIME', selectedMetrics)).toBe(false);
  });

  it('should allow both TOP_SPEED and VERTICAL_JUMP', () => {
    const selectedMetrics = ['VERTICAL_JUMP'];
    expect(isMetricExcluded('TOP_SPEED', selectedMetrics)).toBe(false);
  });

  it('should handle empty selection', () => {
    const selectedMetrics: string[] = [];
    expect(isMetricExcluded('FLY10_TIME', selectedMetrics)).toBe(false);
    expect(isMetricExcluded('TOP_SPEED', selectedMetrics)).toBe(false);
  });

  it('should handle multiple selected metrics', () => {
    const selectedMetrics = ['VERTICAL_JUMP', 'DASH_40YD', 'FLY10_TIME'];
    expect(isMetricExcluded('TOP_SPEED', selectedMetrics)).toBe(true);
  });

  it('should be symmetric', () => {
    Object.entries(MUTUALLY_EXCLUSIVE_METRICS).forEach(([key, value]) => {
      expect(MUTUALLY_EXCLUSIVE_METRICS[value]).toBe(key);
    });
  });
});

describe('Mutual Exclusion Configuration', () => {
  it('should have symmetric mappings', () => {
    const keys = Object.keys(MUTUALLY_EXCLUSIVE_METRICS);
    keys.forEach(key => {
      const value = MUTUALLY_EXCLUSIVE_METRICS[key];
      expect(MUTUALLY_EXCLUSIVE_METRICS[value]).toBe(key);
    });
  });

  it('should only include FLY10_TIME and TOP_SPEED', () => {
    const keys = Object.keys(MUTUALLY_EXCLUSIVE_METRICS);
    expect(keys.sort()).toEqual(['FLY10_TIME', 'TOP_SPEED']);
  });

  it('should map FLY10_TIME to TOP_SPEED', () => {
    expect(MUTUALLY_EXCLUSIVE_METRICS['FLY10_TIME']).toBe('TOP_SPEED');
  });

  it('should map TOP_SPEED to FLY10_TIME', () => {
    expect(MUTUALLY_EXCLUSIVE_METRICS['TOP_SPEED']).toBe('FLY10_TIME');
  });
});
