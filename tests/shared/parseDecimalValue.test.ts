/**
 * Tests for parseDecimalValue utility function
 * Ensures type-safe conversion of PostgreSQL DECIMAL values
 */

import { describe, it, expect } from 'vitest';
import { parseDecimalValue } from '@shared/analytics-utils';

describe('parseDecimalValue', () => {
  describe('Valid inputs', () => {
    it('should parse valid string decimal values', () => {
      expect(parseDecimalValue('10.5')).toBe(10.5);
      expect(parseDecimalValue('0.001')).toBe(0.001);
      expect(parseDecimalValue('100')).toBe(100);
      expect(parseDecimalValue('99.999')).toBe(99.999);
    });

    it('should handle negative numbers', () => {
      expect(parseDecimalValue('-5.5')).toBe(-5.5);
      expect(parseDecimalValue('-100')).toBe(-100);
    });

    it('should handle zero', () => {
      expect(parseDecimalValue('0')).toBe(0);
      expect(parseDecimalValue('0.0')).toBe(0);
      expect(parseDecimalValue(0)).toBe(0);
    });

    it('should pass through valid number values', () => {
      expect(parseDecimalValue(10.5)).toBe(10.5);
      expect(parseDecimalValue(0.001)).toBe(0.001);
      expect(parseDecimalValue(100)).toBe(100);
    });

    it('should handle scientific notation strings', () => {
      expect(parseDecimalValue('1e-5')).toBe(0.00001);
      expect(parseDecimalValue('1.5e2')).toBe(150);
    });

    it('should handle very small numbers', () => {
      expect(parseDecimalValue('0.00000001')).toBe(0.00000001);
      expect(parseDecimalValue(0.00000001)).toBe(0.00000001);
    });

    it('should handle very large numbers', () => {
      expect(parseDecimalValue('999999999')).toBe(999999999);
      expect(parseDecimalValue(999999999)).toBe(999999999);
    });
  });

  describe('Invalid inputs - null/undefined', () => {
    it('should throw on null', () => {
      expect(() => parseDecimalValue(null)).toThrow('Measurement value cannot be null or undefined');
    });

    it('should throw on undefined', () => {
      expect(() => parseDecimalValue(undefined)).toThrow('Measurement value cannot be null or undefined');
    });
  });

  describe('Invalid inputs - NaN/Infinity', () => {
    it('should throw on NaN string', () => {
      expect(() => parseDecimalValue('not a number')).toThrow('Invalid measurement value: "not a number"');
      expect(() => parseDecimalValue('abc')).toThrow('Invalid measurement value: "abc"');
      expect(() => parseDecimalValue('')).toThrow('Invalid measurement value: ""');
    });

    it('should throw on NaN number', () => {
      expect(() => parseDecimalValue(NaN)).toThrow('Invalid measurement value: NaN');
    });

    it('should throw on Infinity', () => {
      expect(() => parseDecimalValue(Infinity)).toThrow('Invalid measurement value: Infinity');
      expect(() => parseDecimalValue(-Infinity)).toThrow('Invalid measurement value: -Infinity');
    });

    it('should throw on Infinity string', () => {
      expect(() => parseDecimalValue('Infinity')).toThrow('Invalid measurement value: "Infinity"');
      expect(() => parseDecimalValue('-Infinity')).toThrow('Invalid measurement value: "-Infinity"');
    });
  });

  describe('Invalid inputs - unexpected types', () => {
    it('should throw on boolean', () => {
      expect(() => parseDecimalValue(true as any)).toThrow('Unexpected value type: boolean');
      expect(() => parseDecimalValue(false as any)).toThrow('Unexpected value type: boolean');
    });

    it('should throw on object', () => {
      expect(() => parseDecimalValue({} as any)).toThrow('Unexpected value type: object');
      expect(() => parseDecimalValue({ value: 10 } as any)).toThrow('Unexpected value type: object');
    });

    it('should throw on array', () => {
      expect(() => parseDecimalValue([10] as any)).toThrow('Unexpected value type: object');
    });
  });

  describe('Edge cases', () => {
    it('should handle whitespace in strings', () => {
      expect(parseDecimalValue('  10.5  ')).toBe(10.5);
      expect(parseDecimalValue('\n100\n')).toBe(100);
      expect(parseDecimalValue('\t5.5\t')).toBe(5.5);
    });

    it('should handle leading zeros', () => {
      expect(parseDecimalValue('0010.5')).toBe(10.5);
      expect(parseDecimalValue('00100')).toBe(100);
    });

    it('should handle trailing zeros', () => {
      expect(parseDecimalValue('10.500')).toBe(10.5);
      expect(parseDecimalValue('100.00')).toBe(100);
    });

    it('should handle positive sign prefix', () => {
      expect(parseDecimalValue('+10.5')).toBe(10.5);
      expect(parseDecimalValue('+100')).toBe(100);
    });
  });

  describe('Real-world PostgreSQL DECIMAL scenarios', () => {
    it('should handle typical measurement values', () => {
      // 10-yard fly time (seconds)
      expect(parseDecimalValue('1.234')).toBe(1.234);

      // Vertical jump (inches)
      expect(parseDecimalValue('30.5')).toBe(30.5);

      // Agility tests (seconds)
      expect(parseDecimalValue('4.567')).toBe(4.567);

      // 40-yard dash (seconds)
      expect(parseDecimalValue('4.89')).toBe(4.89);

      // RSI (unitless)
      expect(parseDecimalValue('2.345')).toBe(2.345);
    });

    it('should preserve precision from database', () => {
      // PostgreSQL DECIMAL(10,3) precision
      expect(parseDecimalValue('123.456')).toBe(123.456);
      expect(parseDecimalValue('0.001')).toBe(0.001);
      expect(parseDecimalValue('9999999.999')).toBe(9999999.999);
    });
  });
});
