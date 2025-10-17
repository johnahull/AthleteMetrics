/**
 * Tests for chart validation utilities
 *
 * Tests cover maxAthletes validation with various edge cases including
 * negative values, zero, extremely large values, and proper warning/error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateMaxAthletes, validateChartData, logValidationResult } from '../chart-validation';
import { DEFAULT_SELECTION_COUNT } from '../chart-constants';

describe('chart-validation', () => {
  describe('validateMaxAthletes', () => {
    it('should return default value when maxAthletes is undefined', () => {
      const result = validateMaxAthletes(undefined, 10);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(DEFAULT_SELECTION_COUNT);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should accept valid positive number', () => {
      const result = validateMaxAthletes(5, 10);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(5);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should reject negative values and use default', () => {
      const result = validateMaxAthletes(-5, 10);

      expect(result.isValid).toBe(false);
      expect(result.value).toBe(DEFAULT_SELECTION_COUNT);
      expect(result.errors).toContain('maxAthletes cannot be negative, received: -5');
    });

    it('should handle zero with warning and use minimum of 1', () => {
      const result = validateMaxAthletes(0, 10);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(1);
      expect(result.warnings).toContain('maxAthletes of 0 means no athletes can be selected');
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about extremely large values', () => {
      const result = validateMaxAthletes(150, 10);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(150);
      expect(result.warnings).toContain('maxAthletes of 150 is unusually large and may impact performance');
    });

    it('should warn when maxAthletes exceeds available athletes', () => {
      const result = validateMaxAthletes(20, 10);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(20);
      expect(result.warnings).toContain('maxAthletes (20) exceeds available athletes (10)');
    });

    it('should reject invalid types (NaN)', () => {
      const result = validateMaxAthletes(NaN, 10);

      expect(result.isValid).toBe(false);
      expect(result.value).toBe(DEFAULT_SELECTION_COUNT);
      expect(result.errors).toContain('maxAthletes must be a valid number, received: number');
    });

    it('should enforce minimum of 1', () => {
      const result1 = validateMaxAthletes(0, 10);
      expect(result1.value).toBe(1);

      const result2 = validateMaxAthletes(-10, 10);
      expect(result2.value).toBeGreaterThanOrEqual(1);
    });

    it('should work without availableAthletes parameter', () => {
      const result = validateMaxAthletes(5);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(5);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle boundary value of 100', () => {
      const result = validateMaxAthletes(100, 50);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(100);
      // Should not warn at exactly 100
      expect(result.warnings).not.toContain(expect.stringContaining('unusually large'));
    });

    it('should warn at 101', () => {
      const result = validateMaxAthletes(101, 50);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(101);
      expect(result.warnings).toContain('maxAthletes of 101 is unusually large and may impact performance');
    });
  });

  describe('validateChartData', () => {
    it('should accept valid array', () => {
      const data = [{ value: 1 }, { value: 2 }, { value: 3 }];
      const result = validateChartData(data);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn about empty array', () => {
      const result = validateChartData([]);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(0);
      expect(result.warnings).toContain('Chart data is empty');
    });

    it('should reject non-array data', () => {
      const result = validateChartData({} as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Chart data must be an array');
    });

    it('should warn about large datasets', () => {
      const largeData = Array(15000).fill({ value: 1 });
      const result = validateChartData(largeData);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(15000);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Large dataset detected');
      expect(result.warnings[0]).toContain('pagination or virtualization');
    });

    it('should not warn for dataset at boundary (10000)', () => {
      const data = Array(10000).fill({ value: 1 });
      const result = validateChartData(data);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn for dataset just over boundary (10001)', () => {
      const data = Array(10001).fill({ value: 1 });
      const result = validateChartData(data);

      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Large dataset detected (10001 items)');
    });
  });

  describe('logValidationResult', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should log errors to console.error in development', () => {
      const result = {
        isValid: false,
        value: 0,
        warnings: [],
        errors: ['Test error']
      };

      logValidationResult('TestComponent', result);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[TestComponent] Validation errors:',
          ['Test error']
        );
      }
    });

    it('should log warnings to console.warn in development', () => {
      const result = {
        isValid: true,
        value: 0,
        warnings: ['Test warning'],
        errors: []
      };

      logValidationResult('TestComponent', result);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[TestComponent] Validation warnings:',
          ['Test warning']
        );
      }
    });

    it('should not log when no errors or warnings', () => {
      const result = {
        isValid: true,
        value: 5,
        warnings: [],
        errors: []
      };

      logValidationResult('TestComponent', result);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should log both errors and warnings', () => {
      const result = {
        isValid: false,
        value: 0,
        warnings: ['Test warning'],
        errors: ['Test error']
      };

      logValidationResult('TestComponent', result);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalled();
      }
    });

    it('should handle multiple errors and warnings', () => {
      const result = {
        isValid: false,
        value: 0,
        warnings: ['Warning 1', 'Warning 2'],
        errors: ['Error 1', 'Error 2', 'Error 3']
      };

      logValidationResult('TestComponent', result);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[TestComponent] Validation errors:',
          ['Error 1', 'Error 2', 'Error 3']
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[TestComponent] Validation warnings:',
          ['Warning 1', 'Warning 2']
        );
      }
    });
  });
});
