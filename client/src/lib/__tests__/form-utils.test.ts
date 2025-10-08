/**
 * Unit tests for form utility functions
 */

import { describe, it, expect } from 'vitest';
import { normalizeString } from '../form-utils';

describe('normalizeString', () => {
  describe('Whitespace Trimming', () => {
    it('should trim leading whitespace', () => {
      expect(normalizeString('  hello')).toBe('hello');
    });

    it('should trim trailing whitespace', () => {
      expect(normalizeString('hello  ')).toBe('hello');
    });

    it('should trim both leading and trailing whitespace', () => {
      expect(normalizeString('  hello  ')).toBe('hello');
    });

    it('should preserve internal whitespace', () => {
      expect(normalizeString('  hello world  ')).toBe('hello world');
    });

    it('should handle tabs and newlines', () => {
      expect(normalizeString('\t\nhello\n\t')).toBe('hello');
    });
  });

  describe('Null/Empty Handling', () => {
    it('should convert empty string to null', () => {
      expect(normalizeString('')).toBe(null);
    });

    it('should convert whitespace-only string to null', () => {
      expect(normalizeString('   ')).toBe(null);
    });

    it('should convert tabs-only string to null', () => {
      expect(normalizeString('\t\t\t')).toBe(null);
    });

    it('should convert newlines-only string to null', () => {
      expect(normalizeString('\n\n\n')).toBe(null);
    });

    it('should pass through null as null', () => {
      expect(normalizeString(null)).toBe(null);
    });

    it('should convert undefined to null', () => {
      expect(normalizeString(undefined)).toBe(null);
    });
  });

  describe('Valid String Handling', () => {
    it('should return string without leading/trailing whitespace', () => {
      expect(normalizeString('Team Name')).toBe('Team Name');
    });

    it('should handle single character strings', () => {
      expect(normalizeString('A')).toBe('A');
    });

    it('should handle strings with special characters', () => {
      expect(normalizeString('  Team-Name_2024!  ')).toBe('Team-Name_2024!');
    });

    it('should handle unicode characters', () => {
      expect(normalizeString('  Équipe Spéciale  ')).toBe('Équipe Spéciale');
    });
  });

  describe('Comparison Use Cases', () => {
    it('should normalize for case-sensitive comparison', () => {
      const input1 = '  Team Alpha  ';
      const input2 = 'Team Alpha';

      expect(normalizeString(input1)).toBe(normalizeString(input2));
    });

    it('should distinguish different strings after normalization', () => {
      const input1 = '  Team Alpha  ';
      const input2 = '  Team Beta  ';

      expect(normalizeString(input1)).not.toBe(normalizeString(input2));
    });

    it('should treat empty/null/whitespace as equivalent', () => {
      expect(normalizeString('')).toBe(normalizeString(null));
      expect(normalizeString('   ')).toBe(normalizeString(undefined));
      expect(normalizeString('\t\n')).toBe(normalizeString(''));
    });
  });
});
