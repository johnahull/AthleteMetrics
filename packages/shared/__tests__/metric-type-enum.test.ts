import { describe, it, expect } from 'vitest';
import { metricTypeEnum } from '../schema';

/**
 * Test suite for the new metricType enum
 * Part of TDD implementation for tracking metrics (HEIGHT, WEIGHT, etc.)
 */
describe('metricTypeEnum', () => {
  it('should define three metric types', () => {
    expect(metricTypeEnum).toBeDefined();
    expect(metricTypeEnum.length).toBe(3);
  });

  it('should include lower_is_better type', () => {
    expect(metricTypeEnum).toContain('lower_is_better');
  });

  it('should include higher_is_better type', () => {
    expect(metricTypeEnum).toContain('higher_is_better');
  });

  it('should include tracking type', () => {
    expect(metricTypeEnum).toContain('tracking');
  });

  it('should be a readonly array (TypeScript compile-time only)', () => {
    // Note: TypeScript 'as const' provides compile-time immutability
    // At runtime, the array is still technically mutable, but TypeScript prevents this
    // This test verifies the array structure is correct
    expect(Array.isArray(metricTypeEnum)).toBe(true);
    expect(metricTypeEnum.length).toBe(3);
  });
});
