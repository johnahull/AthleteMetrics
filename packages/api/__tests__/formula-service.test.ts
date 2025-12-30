import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateFormula,
  evaluateFormula,
  detectCircularDependencies,
  clearFormulaCache,
  getFormulaCacheSize,
  type FormulaValidationResult,
} from '../services/formula-service';

describe('Formula Service', () => {
  describe('validateFormula', () => {
    it('should accept valid arithmetic expressions', () => {
      const availableMetrics = ['fly10_time', 'vertical_jump'];

      const result = validateFormula('fly10_time * 2', availableMetrics);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should extract referenced metrics correctly', () => {
      const availableMetrics = ['fly10_time', 'standing_reach', 'block_jump'];

      const result = validateFormula('standing_reach + block_jump', availableMetrics);

      expect(result.valid).toBe(true);
      expect(result.referencedMetrics).toContain('standing_reach');
      expect(result.referencedMetrics).toContain('block_jump');
      expect(result.referencedMetrics).toHaveLength(2);
    });

    it('should reject unknown metric codes', () => {
      const availableMetrics = ['fly10_time'];

      const result = validateFormula('fly10_time + unknown_metric', availableMetrics);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('unknown_metric');
    });

    it('should support math functions (sqrt, pow, abs)', () => {
      const availableMetrics = ['fly10_time', 'vertical_jump'];

      const sqrtResult = validateFormula('sqrt(vertical_jump)', availableMetrics);
      expect(sqrtResult.valid).toBe(true);
      expect(sqrtResult.referencedMetrics).toContain('vertical_jump');

      const powResult = validateFormula('pow(fly10_time, 2)', availableMetrics);
      expect(powResult.valid).toBe(true);
      expect(powResult.referencedMetrics).toContain('fly10_time');

      const absResult = validateFormula('abs(fly10_time - 1.5)', availableMetrics);
      expect(absResult.valid).toBe(true);
      expect(absResult.referencedMetrics).toContain('fly10_time');
    });

    it('should support round, floor, ceil functions', () => {
      const availableMetrics = ['vertical_jump'];

      const roundResult = validateFormula('round(vertical_jump)', availableMetrics);
      expect(roundResult.valid).toBe(true);

      const floorResult = validateFormula('floor(vertical_jump)', availableMetrics);
      expect(floorResult.valid).toBe(true);

      const ceilResult = validateFormula('ceil(vertical_jump)', availableMetrics);
      expect(ceilResult.valid).toBe(true);
    });

    it('should support min and max functions', () => {
      const availableMetrics = ['fly10_time', 'dash_40yd'];

      const minResult = validateFormula('min(fly10_time, dash_40yd)', availableMetrics);
      expect(minResult.valid).toBe(true);
      expect(minResult.referencedMetrics).toContain('fly10_time');
      expect(minResult.referencedMetrics).toContain('dash_40yd');

      const maxResult = validateFormula('max(fly10_time, dash_40yd)', availableMetrics);
      expect(maxResult.valid).toBe(true);
    });

    it('should reject invalid syntax', () => {
      const availableMetrics = ['fly10_time'];

      const result = validateFormula('fly10_time +', availableMetrics);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle complex formulas with multiple operations', () => {
      const availableMetrics = ['fly10_time'];

      // Top speed formula: 10 / fly10_time * 2.045
      const result = validateFormula('10 / fly10_time * 2.045', availableMetrics);

      expect(result.valid).toBe(true);
      expect(result.referencedMetrics).toContain('fly10_time');
    });

    it('should handle formulas with constants', () => {
      const availableMetrics = ['vertical_jump'];

      const result = validateFormula('vertical_jump + 10.5', availableMetrics);

      expect(result.valid).toBe(true);
      expect(result.referencedMetrics).toContain('vertical_jump');
    });

    it('should be case-insensitive for metric names', () => {
      const availableMetrics = ['FLY10_TIME'];

      // lowercase formula should work with uppercase available metric
      const lowercaseResult = validateFormula('fly10_time * 2', availableMetrics);
      expect(lowercaseResult.valid).toBe(true);
      expect(lowercaseResult.referencedMetrics).toContain('fly10_time');

      // uppercase formula should also work (normalized to lowercase)
      const uppercaseResult = validateFormula('FLY10_TIME * 2', availableMetrics);
      expect(uppercaseResult.valid).toBe(true);
      expect(uppercaseResult.referencedMetrics).toContain('fly10_time');

      // mixed case should work too
      const mixedResult = validateFormula('Fly10_Time * 2', availableMetrics);
      expect(mixedResult.valid).toBe(true);
    });

    it('should handle empty formula', () => {
      const availableMetrics = ['fly10_time'];

      const result = validateFormula('', availableMetrics);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject formulas with unsupported functions', () => {
      const availableMetrics = ['fly10_time'];

      // eval, exec, system calls should not be allowed
      const result = validateFormula('eval("fly10_time")', availableMetrics);

      expect(result.valid).toBe(false);
    });
  });

  describe('evaluateFormula', () => {
    it('should compute correct values for simple arithmetic', () => {
      const formula = 'fly10_time * 2';
      const sourceValues = { fly10_time: 1.5 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(3.0);
    });

    it('should compute top speed formula correctly', () => {
      const formula = '10 / fly10_time * 2.045';
      const sourceValues = { fly10_time: 1.0 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBeCloseTo(20.45, 2);
    });

    it('should compute addition correctly', () => {
      const formula = 'standing_reach + block_jump';
      const sourceValues = { standing_reach: 96.0, block_jump: 30.0 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(126.0);
    });

    it('should return null for missing source values', () => {
      const formula = 'fly10_time + dash_40yd';
      const sourceValues = { fly10_time: 1.5 }; // dash_40yd is missing

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBeNull();
    });

    it('should handle math functions (sqrt)', () => {
      const formula = 'sqrt(vertical_jump)';
      const sourceValues = { vertical_jump: 16 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(4);
    });

    it('should handle math functions (pow)', () => {
      const formula = 'pow(fly10_time, 2)';
      const sourceValues = { fly10_time: 3 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(9);
    });

    it('should handle math functions (abs)', () => {
      const formula = 'abs(fly10_time - 2.0)';
      const sourceValues = { fly10_time: 1.5 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(0.5);
    });

    it('should handle round, floor, ceil functions', () => {
      const sourceValues = { vertical_jump: 15.7 };

      expect(evaluateFormula('round(vertical_jump)', sourceValues)).toBe(16);
      expect(evaluateFormula('floor(vertical_jump)', sourceValues)).toBe(15);
      expect(evaluateFormula('ceil(vertical_jump)', sourceValues)).toBe(16);
    });

    it('should handle min and max functions', () => {
      const sourceValues = { fly10_time: 1.5, dash_40yd: 5.0 };

      expect(evaluateFormula('min(fly10_time, dash_40yd)', sourceValues)).toBe(1.5);
      expect(evaluateFormula('max(fly10_time, dash_40yd)', sourceValues)).toBe(5.0);
    });

    it('should handle complex nested formulas', () => {
      const formula = 'sqrt(pow(vertical_jump, 2) + pow(fly10_time, 2))';
      const sourceValues = { vertical_jump: 3, fly10_time: 4 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(5); // 3-4-5 triangle
    });

    it('should return null for invalid formulas', () => {
      const formula = 'fly10_time +'; // Invalid syntax
      const sourceValues = { fly10_time: 1.5 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBeNull();
    });

    it('should handle division by zero gracefully', () => {
      const formula = '10 / fly10_time';
      const sourceValues = { fly10_time: 0 };

      const result = evaluateFormula(formula, sourceValues);

      // Should return Infinity or null, depending on implementation
      expect(result === null || result === Infinity).toBe(true);
    });

    it('should handle multiple source values', () => {
      const formula = '(fly10_time + dash_40yd) / 2';
      const sourceValues = { fly10_time: 1.5, dash_40yd: 5.0 };

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(3.25);
    });
  });

  describe('detectCircularDependencies', () => {
    it('should detect direct circular dependency (A -> B -> A)', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: ['metric_b'] },
        { code: 'metric_b', dependentMetrics: ['metric_a'] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(true);
      expect(result.cycle).toBeDefined();
      expect(result.cycle!.length).toBeGreaterThan(0);
    });

    it('should detect indirect circular dependency (A -> B -> C -> A)', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: ['metric_b'] },
        { code: 'metric_b', dependentMetrics: ['metric_c'] },
        { code: 'metric_c', dependentMetrics: ['metric_a'] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(true);
      expect(result.cycle).toBeDefined();
    });

    it('should detect self-referencing dependency (A -> A)', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: ['metric_a'] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(true);
      expect(result.cycle).toContain('metric_a');
    });

    it('should return false for valid DAG (directed acyclic graph)', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: ['metric_b', 'metric_c'] },
        { code: 'metric_b', dependentMetrics: [] },
        { code: 'metric_c', dependentMetrics: [] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(false);
      expect(result.cycle).toBeUndefined();
    });

    it('should return false for metrics with no dependencies', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: [] },
        { code: 'metric_b', dependentMetrics: [] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(false);
    });

    it('should return false for metrics with undefined dependentMetrics', () => {
      const metrics = [
        { code: 'metric_a' },
        { code: 'metric_b' },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(false);
    });

    it('should handle complex DAG without cycles', () => {
      const metrics = [
        { code: 'top_speed', dependentMetrics: ['fly10_time'] },
        { code: 'block_reach', dependentMetrics: ['standing_reach', 'block_jump'] },
        { code: 'fly10_time', dependentMetrics: [] },
        { code: 'standing_reach', dependentMetrics: [] },
        { code: 'block_jump', dependentMetrics: [] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(false);
    });

    it('should handle diamond dependency (A -> B, A -> C, B -> D, C -> D)', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: ['metric_b', 'metric_c'] },
        { code: 'metric_b', dependentMetrics: ['metric_d'] },
        { code: 'metric_c', dependentMetrics: ['metric_d'] },
        { code: 'metric_d', dependentMetrics: [] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(false);
    });

    it('should detect cycle in subset of metrics', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: ['metric_b'] },
        { code: 'metric_b', dependentMetrics: ['metric_c'] },
        { code: 'metric_c', dependentMetrics: ['metric_b'] }, // B -> C -> B cycle
        { code: 'metric_d', dependentMetrics: [] }, // Unrelated metric
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle formula with only constants', () => {
      const formula = '10 + 20';
      const sourceValues = {};

      const result = evaluateFormula(formula, sourceValues);

      expect(result).toBe(30);
    });

    it('should validate formula with no metrics referenced', () => {
      const availableMetrics = ['fly10_time'];

      const result = validateFormula('10 + 20', availableMetrics);

      expect(result.valid).toBe(true);
      expect(result.referencedMetrics).toHaveLength(0);
    });

    it('should handle very long formulas', () => {
      const availableMetrics = ['a', 'b', 'c', 'd', 'e'];
      const formula = 'a + b + c + d + e + a + b + c + d + e';

      const validationResult = validateFormula(formula, availableMetrics);
      expect(validationResult.valid).toBe(true);

      const sourceValues = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      const evalResult = evaluateFormula(formula, sourceValues);
      expect(evalResult).toBe(30);
    });

    it('should handle empty dependencies array in circular check', () => {
      const metrics = [
        { code: 'metric_a', dependentMetrics: [] },
      ];

      const result = detectCircularDependencies(metrics);

      expect(result.hasCircular).toBe(false);
    });
  });

  describe('formula cache', () => {
    beforeEach(() => {
      // Clear cache before each test to ensure isolation
      clearFormulaCache();
    });

    it('should start with empty cache', () => {
      expect(getFormulaCacheSize()).toBe(0);
    });

    it('should cache formulas after validation', () => {
      const availableMetrics = ['fly10_time'];

      validateFormula('fly10_time * 2', availableMetrics);

      expect(getFormulaCacheSize()).toBeGreaterThan(0);
    });

    it('should cache formulas after evaluation', () => {
      const formula = 'fly10_time + 10';
      const sourceValues = { fly10_time: 1.5 };

      evaluateFormula(formula, sourceValues);

      expect(getFormulaCacheSize()).toBeGreaterThan(0);
    });

    it('should reuse cached formulas on repeated calls', () => {
      const availableMetrics = ['fly10_time'];
      const formula = 'fly10_time * 2';

      // First call - should cache
      validateFormula(formula, availableMetrics);
      const sizeAfterFirst = getFormulaCacheSize();

      // Second call - should reuse cache
      validateFormula(formula, availableMetrics);
      const sizeAfterSecond = getFormulaCacheSize();

      // Cache size should not increase for same formula
      expect(sizeAfterSecond).toBe(sizeAfterFirst);
    });

    it('should cache different formulas separately', () => {
      const availableMetrics = ['fly10_time', 'vertical_jump'];

      validateFormula('fly10_time * 2', availableMetrics);
      const sizeAfterFirst = getFormulaCacheSize();

      validateFormula('vertical_jump / 10', availableMetrics);
      const sizeAfterSecond = getFormulaCacheSize();

      // Each unique formula should be cached
      expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst);
    });

    it('clearFormulaCache should remove all cached entries', () => {
      const availableMetrics = ['fly10_time'];

      validateFormula('fly10_time * 2', availableMetrics);
      validateFormula('fly10_time / 10', availableMetrics);

      expect(getFormulaCacheSize()).toBeGreaterThan(0);

      clearFormulaCache();

      expect(getFormulaCacheSize()).toBe(0);
    });

    it('should produce consistent results with caching', () => {
      const formula = '10 / fly10_time * 2.045';
      const sourceValues = { fly10_time: 1.0 };

      // Clear cache and evaluate
      clearFormulaCache();
      const result1 = evaluateFormula(formula, sourceValues);

      // Evaluate again with cached formula
      const result2 = evaluateFormula(formula, sourceValues);

      expect(result1).toEqual(result2);
      expect(result1).toBeCloseTo(20.45, 2);
    });
  });
});
