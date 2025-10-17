import { describe, it, expect } from 'vitest';
import {
  dbBooleanToBoolean,
  booleanToDbBoolean,
  isDbBoolean,
  normalizeDbBoolean,
  type DbBoolean,
  type BooleanLike
} from '../boolean-utils';

describe('Boolean Utils', () => {
  describe('dbBooleanToBoolean', () => {
    it('should convert string "true" to boolean true', () => {
      expect(dbBooleanToBoolean('true')).toBe(true);
    });

    it('should convert string "false" to boolean false', () => {
      expect(dbBooleanToBoolean('false')).toBe(false);
    });

    it('should pass through boolean true', () => {
      expect(dbBooleanToBoolean(true)).toBe(true);
    });

    it('should pass through boolean false', () => {
      expect(dbBooleanToBoolean(false)).toBe(false);
    });

    it('should convert null to false', () => {
      expect(dbBooleanToBoolean(null)).toBe(false);
    });

    it('should convert undefined to false', () => {
      expect(dbBooleanToBoolean(undefined)).toBe(false);
    });

    it('should convert empty string to false', () => {
      expect(dbBooleanToBoolean('')).toBe(false);
    });

    it('should convert other strings to false', () => {
      expect(dbBooleanToBoolean('yes')).toBe(false);
      expect(dbBooleanToBoolean('1')).toBe(false);
      expect(dbBooleanToBoolean('TRUE')).toBe(false); // Case sensitive
    });
  });

  describe('booleanToDbBoolean', () => {
    it('should convert boolean true to string "true"', () => {
      expect(booleanToDbBoolean(true)).toBe('true');
    });

    it('should convert boolean false to string "false"', () => {
      expect(booleanToDbBoolean(false)).toBe('false');
    });

    it('should have correct return type', () => {
      const result: DbBoolean = booleanToDbBoolean(true);
      expect(result).toBe('true');
    });
  });

  describe('isDbBoolean', () => {
    it('should return true for string "true"', () => {
      expect(isDbBoolean('true')).toBe(true);
    });

    it('should return true for string "false"', () => {
      expect(isDbBoolean('false')).toBe(true);
    });

    it('should return false for boolean true', () => {
      expect(isDbBoolean(true)).toBe(false);
    });

    it('should return false for boolean false', () => {
      expect(isDbBoolean(false)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isDbBoolean(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isDbBoolean(undefined)).toBe(false);
    });

    it('should return false for other strings', () => {
      expect(isDbBoolean('yes')).toBe(false);
      expect(isDbBoolean('TRUE')).toBe(false);
      expect(isDbBoolean('')).toBe(false);
    });

    it('should return false for numbers', () => {
      expect(isDbBoolean(0)).toBe(false);
      expect(isDbBoolean(1)).toBe(false);
    });
  });

  describe('normalizeDbBoolean', () => {
    it('should normalize boolean true to "true"', () => {
      expect(normalizeDbBoolean(true)).toBe('true');
    });

    it('should normalize boolean false to "false"', () => {
      expect(normalizeDbBoolean(false)).toBe('false');
    });

    it('should pass through valid db boolean "true"', () => {
      expect(normalizeDbBoolean('true')).toBe('true');
    });

    it('should pass through valid db boolean "false"', () => {
      expect(normalizeDbBoolean('false')).toBe('false');
    });

    it('should use default value for null', () => {
      expect(normalizeDbBoolean(null)).toBe('false');
      expect(normalizeDbBoolean(null, true)).toBe('true');
    });

    it('should use default value for undefined', () => {
      expect(normalizeDbBoolean(undefined)).toBe('false');
      expect(normalizeDbBoolean(undefined, true)).toBe('true');
    });

    it('should use default value for invalid strings', () => {
      expect(normalizeDbBoolean('yes')).toBe('false');
      expect(normalizeDbBoolean('yes', true)).toBe('true');
    });

    it('should use default value for empty string', () => {
      expect(normalizeDbBoolean('')).toBe('false');
      expect(normalizeDbBoolean('', true)).toBe('true');
    });
  });

  describe('type safety', () => {
    it('should work with DbBoolean type', () => {
      const dbValue: DbBoolean = 'true';
      expect(dbBooleanToBoolean(dbValue)).toBe(true);
    });

    it('should work with BooleanLike type', () => {
      const values: BooleanLike[] = [true, false, 'true', 'false', null, undefined];
      
      values.forEach(value => {
        const result = normalizeDbBoolean(value);
        expect(isDbBoolean(result)).toBe(true);
      });
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain consistency in round-trip conversions', () => {
      const originalBooleans = [true, false];
      
      originalBooleans.forEach(original => {
        const dbValue = booleanToDbBoolean(original);
        const backToBoolean = dbBooleanToBoolean(dbValue);
        expect(backToBoolean).toBe(original);
      });
    });

    it('should maintain consistency for db boolean strings', () => {
      const dbValues: DbBoolean[] = ['true', 'false'];
      
      dbValues.forEach(dbValue => {
        const boolean = dbBooleanToBoolean(dbValue);
        const backToDb = booleanToDbBoolean(boolean);
        expect(backToDb).toBe(dbValue);
      });
    });
  });
});