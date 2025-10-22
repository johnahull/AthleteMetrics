import { describe, it, expect } from 'vitest';
import {
  safeNumberConversion,
  requireNumber,
  safeNumber,
  safeNumberArray,
  convertAthleteMetricValue
} from '../utils/number-conversion';

describe('Number Conversion Utilities', () => {
  describe('safeNumberConversion', () => {
    it('should handle valid numbers correctly', () => {
      const result = safeNumberConversion(42);
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(42);
      expect(result.error).toBeUndefined();
    });

    it('should handle valid string numbers', () => {
      const result = safeNumberConversion('123.45');
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(123.45);
    });

    it('should handle null/undefined values', () => {
      const nullResult = safeNumberConversion(null);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.value).toBe(0);
      expect(nullResult.error).toBe('Value is null or undefined');

      const undefinedResult = safeNumberConversion(undefined);
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.value).toBe(0);
    });

    it('should handle empty strings', () => {
      const result = safeNumberConversion('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Empty string');

      const whitespaceResult = safeNumberConversion('   ');
      expect(whitespaceResult.isValid).toBe(false);
      expect(whitespaceResult.error).toBe('Empty string');
    });

    it('should handle NaN values', () => {
      const result = safeNumberConversion(NaN);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Value is NaN');

      const allowNaNResult = safeNumberConversion(NaN, { allowNaN: true });
      expect(allowNaNResult.isValid).toBe(true);
      expect(isNaN(allowNaNResult.value)).toBe(true);
    });

    it('should handle infinite values', () => {
      const result = safeNumberConversion(Infinity);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Value is infinite');

      const allowInfinityResult = safeNumberConversion(Infinity, { allowInfinity: true });
      expect(allowInfinityResult.isValid).toBe(true);
      expect(allowInfinityResult.value).toBe(Infinity);
    });

    it('should enforce min/max constraints', () => {
      const belowMinResult = safeNumberConversion(5, { min: 10 });
      expect(belowMinResult.isValid).toBe(false);
      expect(belowMinResult.error).toContain('less than minimum');

      const aboveMaxResult = safeNumberConversion(15, { max: 10 });
      expect(aboveMaxResult.isValid).toBe(false);
      expect(aboveMaxResult.error).toContain('greater than maximum');

      const validRangeResult = safeNumberConversion(8, { min: 5, max: 10 });
      expect(validRangeResult.isValid).toBe(true);
      expect(validRangeResult.value).toBe(8);
    });

    it('should use custom default values', () => {
      const result = safeNumberConversion(null, { defaultValue: 42 });
      expect(result.isValid).toBe(false);
      expect(result.value).toBe(42);
    });

    it('should handle invalid string formats', () => {
      const result = safeNumberConversion('not-a-number');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('String value resulted in NaN');
    });

    it('should handle object types', () => {
      const result = safeNumberConversion({});
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Cannot convert value of type object');
    });
  });

  describe('requireNumber', () => {
    it('should return valid numbers', () => {
      expect(requireNumber(42)).toBe(42);
      expect(requireNumber('123.45')).toBe(123.45);
    });

    it('should throw error for invalid values', () => {
      expect(() => requireNumber(null)).toThrow('Number conversion failed');
      expect(() => requireNumber('invalid')).toThrow('Number conversion failed');
      expect(() => requireNumber(NaN)).toThrow('Number conversion failed');
    });

    it('should throw error for out-of-range values', () => {
      expect(() => requireNumber(5, { min: 10 })).toThrow('less than minimum');
      expect(() => requireNumber(15, { max: 10 })).toThrow('greater than maximum');
    });
  });

  describe('safeNumber', () => {
    it('should return valid numbers', () => {
      expect(safeNumber(42)).toBe(42);
      expect(safeNumber('123.45')).toBe(123.45);
    });

    it('should return default for invalid values', () => {
      expect(safeNumber(null)).toBe(0);
      expect(safeNumber('invalid')).toBe(0);
      expect(safeNumber(null, 99)).toBe(99);
    });

    it('should enforce constraints and return default', () => {
      expect(safeNumber(5, 42, { min: 10 })).toBe(42);
      expect(safeNumber(15, 42, { max: 10 })).toBe(42);
    });
  });

  describe('safeNumberArray', () => {
    it('should convert valid arrays', () => {
      const input = [1, '2', 3.5, '4.7'];
      const result = safeNumberArray(input);
      expect(result).toEqual([1, 2, 3.5, 4.7]);
    });

    it('should filter out invalid values', () => {
      const input = [1, 'invalid', null, '2', NaN, 3];
      const result = safeNumberArray(input);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle empty arrays', () => {
      expect(safeNumberArray([])).toEqual([]);
    });

    it('should apply constraints', () => {
      const input = [1, 5, 10, 15];
      const result = safeNumberArray(input, { min: 3, max: 12 });
      expect(result).toEqual([5, 10]);
    });
  });

  describe('convertAthleteMetricValue', () => {
    it('should handle valid athletic metrics', () => {
      const result = convertAthleteMetricValue('4.5'); // 40-yard dash time
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(4.5);
    });

    it('should reject negative values', () => {
      const result = convertAthleteMetricValue(-5);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('less than minimum');
    });

    it('should reject extremely large values', () => {
      const result = convertAthleteMetricValue(99999999);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('greater than maximum');
    });

    it('should handle typical athletic ranges', () => {
      const dashTime = convertAthleteMetricValue('4.3');
      expect(dashTime.isValid).toBe(true);

      const verticalJump = convertAthleteMetricValue('35.5');
      expect(verticalJump.isValid).toBe(true);

      const benchPress = convertAthleteMetricValue('225');
      expect(benchPress.isValid).toBe(true);
    });
  });
});