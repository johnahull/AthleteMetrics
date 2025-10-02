import { describe, it, expect } from 'vitest';
import { validateUsername, getUsernameRequirementsText, RESERVED_USERNAMES } from '../../shared/username-validation';

describe('Username Validation', () => {
  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      const validUsernames = [
        'john',
        'alice_smith',
        'bob-jones',
        'user123',
        'test_user_123',
        'my-username',
        'JohnDoe',
        'a1b2c3'
      ];

      validUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject usernames shorter than 3 characters', () => {
      const shortUsernames = ['ab', 'x', 'a1'];

      shortUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('at least 3'))).toBe(true);
      });
    });

    it('should reject usernames longer than 50 characters', () => {
      const longUsername = 'a'.repeat(51);
      const result = validateUsername(longUsername);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at most 50'))).toBe(true);
    });

    it('should reject usernames not starting with a letter', () => {
      const invalidUsernames = [
        '123user',
        '_username',
        '-username',
        '9test'
      ];

      invalidUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('start with a letter'))).toBe(true);
      });
    });

    it('should reject usernames with consecutive special characters', () => {
      const invalidUsernames = [
        'user__name',
        'user--name',
        'user_-name',
        'user-_name'
      ];

      invalidUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
      });
    });

    it('should reject usernames ending with special characters', () => {
      const invalidUsernames = [
        'username_',
        'username-',
        'test_'
      ];

      invalidUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
      });
    });

    it('should reject reserved usernames (case-insensitive)', () => {
      const reservedTests = [
        'admin',
        'ADMIN',
        'Admin',
        'root',
        'ROOT',
        'administrator',
        'system',
        'oauth',
        'login',
        'team',
        'athlete'
      ];

      reservedTests.forEach(username => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('reserved'))).toBe(true);
      });
    });

    it('should reject usernames with invalid characters', () => {
      const invalidUsernames = [
        'user@name',
        'user.name', // periods not allowed by our regex
        'user#name',
        'user name', // spaces
        'user$name'
      ];

      invalidUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.valid).toBe(false);
      });
    });

    it('should handle empty string', () => {
      const result = validateUsername('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle null/undefined gracefully', () => {
      const result1 = validateUsername(null as any);
      const result2 = validateUsername(undefined as any);

      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
      expect(result1.errors[0]).toContain('required');
      expect(result2.errors[0]).toContain('required');
    });

    it('should trim whitespace before validation', () => {
      const result = validateUsername('  validuser  ');
      // The validation should work on trimmed value
      expect(result.valid).toBe(true);
    });
  });

  describe('RESERVED_USERNAMES', () => {
    it('should include critical system usernames', () => {
      const criticalUsernames = ['admin', 'root', 'system', 'administrator'];

      criticalUsernames.forEach(username => {
        expect(RESERVED_USERNAMES).toContain(username);
      });
    });

    it('should include authentication-related usernames', () => {
      const authUsernames = ['login', 'logout', 'oauth', 'auth'];

      authUsernames.forEach(username => {
        expect(RESERVED_USERNAMES).toContain(username);
      });
    });

    it('should include application route usernames', () => {
      const routeUsernames = ['team', 'athlete', 'coach', 'organization'];

      routeUsernames.forEach(username => {
        expect(RESERVED_USERNAMES).toContain(username);
      });
    });

    it('should be all lowercase', () => {
      RESERVED_USERNAMES.forEach(username => {
        expect(username).toBe(username.toLowerCase());
      });
    });
  });

  describe('getUsernameRequirementsText', () => {
    it('should return a non-empty string', () => {
      const text = getUsernameRequirementsText();
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
    });

    it('should mention key requirements', () => {
      const text = getUsernameRequirementsText().toLowerCase();
      expect(text).toContain('letter');
      expect(text).toContain('3');
      expect(text).toContain('50');
    });
  });
});
