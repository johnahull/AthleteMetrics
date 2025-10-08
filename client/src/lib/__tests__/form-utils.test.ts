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

  describe('Unicode Whitespace Handling', () => {
    it('should handle zero-width spaces', () => {
      expect(normalizeString('\u200BTeam Alpha\u200B')).toBe('Team Alpha');
    });

    it('should handle non-breaking spaces', () => {
      expect(normalizeString('\xA0Team Alpha\xA0')).toBe('Team Alpha');
    });

    it('should handle zero-width non-joiner', () => {
      expect(normalizeString('\u200CTeam Alpha\u200C')).toBe('Team Alpha');
    });

    it('should handle zero-width joiner', () => {
      expect(normalizeString('\u200DTeam Alpha\u200D')).toBe('Team Alpha');
    });

    it('should handle line separator', () => {
      expect(normalizeString('\u2028Team Alpha\u2028')).toBe('Team Alpha');
    });

    it('should handle paragraph separator', () => {
      expect(normalizeString('\u2029Team Alpha\u2029')).toBe('Team Alpha');
    });

    it('should handle BOM (byte order mark)', () => {
      expect(normalizeString('\uFEFFTeam Alpha\uFEFF')).toBe('Team Alpha');
    });

    it('should convert Unicode whitespace-only strings to null', () => {
      expect(normalizeString('\u200B\u200C\u200D')).toBe(null);
      expect(normalizeString('\xA0\xA0\xA0')).toBe(null);
      expect(normalizeString('\uFEFF\u2028\u2029')).toBe(null);
    });

    it('should handle mixed ASCII and Unicode whitespace', () => {
      expect(normalizeString('  \u200B\xA0Team Alpha\xA0\u200B  ')).toBe('Team Alpha');
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
