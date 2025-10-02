import { describe, it, expect } from 'vitest';
import { isSiteAdmin } from '../../shared/auth-utils';

/**
 * Tests for site admin detection logic
 *
 * Note: isSiteAdmin is now stored as a boolean in the database.
 * These tests ensure the detection works correctly with boolean values
 * and legacy role/admin fields.
 */
describe('Site Admin Detection', () => {

  describe('isSiteAdmin helper', () => {
    it('should detect site admin from boolean true', () => {
      const user = { id: '1', isSiteAdmin: true };
      expect(isSiteAdmin(user)).toBe(true);
    });

    it('should detect site admin from role field', () => {
      const user = { id: '1', role: 'site_admin' };
      expect(isSiteAdmin(user)).toBe(true);
    });

    it('should detect site admin from admin flag (legacy)', () => {
      const user = { id: '1', admin: true };
      expect(isSiteAdmin(user)).toBe(true);
    });

    it('should reject boolean false', () => {
      const user = { id: '1', isSiteAdmin: false };
      expect(isSiteAdmin(user)).toBe(false);
    });

    it('should reject non-admin roles', () => {
      const roles = ['athlete', 'coach', 'org_admin', 'user'];

      roles.forEach(role => {
        const user = { id: '1', role };
        expect(isSiteAdmin(user)).toBe(false);
      });
    });

    it('should handle null user', () => {
      expect(isSiteAdmin(null)).toBe(false);
    });

    it('should handle undefined user', () => {
      expect(isSiteAdmin(undefined)).toBe(false);
    });

    it('should handle empty object', () => {
      expect(isSiteAdmin({})).toBe(false);
    });

    it('should handle user with no admin fields', () => {
      const user = { id: '1', username: 'test', role: 'athlete' };
      expect(isSiteAdmin(user)).toBe(false);
    });

    it('should prioritize isSiteAdmin over role field', () => {
      const user = {
        id: '1',
        isSiteAdmin: true,
        role: 'athlete' // Conflicting role
      };
      expect(isSiteAdmin(user)).toBe(true);
    });

    it('should reject numeric values (edge case)', () => {
      const user1 = { id: '1', isSiteAdmin: 1 as any };
      const user2 = { id: '1', isSiteAdmin: 0 as any };

      // These should be false because they aren't boolean true
      expect(isSiteAdmin(user1)).toBe(false);
      expect(isSiteAdmin(user2)).toBe(false);
    });

    it('should handle case sensitivity in role field', () => {
      const users = [
        { id: '1', role: 'SITE_ADMIN' },
        { id: '2', role: 'Site_Admin' },
        { id: '3', role: 'SiteAdmin' }
      ];

      // Only exact match should work
      expect(isSiteAdmin(users[0])).toBe(false);
      expect(isSiteAdmin(users[1])).toBe(false);
      expect(isSiteAdmin(users[2])).toBe(false);
    });
  });

  describe('Session user scenarios', () => {
    it('should correctly identify site admin in typical session', () => {
      const sessionUser = {
        id: 'user-123',
        username: 'admin',
        email: 'admin@example.com',
        firstName: 'Site',
        lastName: 'Administrator',
        role: 'site_admin',
        isSiteAdmin: true
      };

      expect(isSiteAdmin(sessionUser)).toBe(true);
    });

    it('should correctly identify regular user in session', () => {
      const sessionUser = {
        id: 'user-456',
        username: 'johndoe',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'athlete',
        isSiteAdmin: false
      };

      expect(isSiteAdmin(sessionUser)).toBe(false);
    });

    it('should handle session user with legacy role field', () => {
      const sessionUser = {
        id: 'user-789',
        username: 'admin2',
        isSiteAdmin: false,
        role: 'site_admin' // Legacy role-based detection
      };

      expect(isSiteAdmin(sessionUser)).toBe(true);
    });
  });

  describe('Edge cases and security', () => {
    it('should not be fooled by manipulation attempts', () => {
      const maliciousAttempts = [
        { isSiteAdmin: 'true' as any }, // String instead of boolean
        { isSiteAdmin: 'TRUE' as any },
        { isSiteAdmin: 'True' as any },
        { isSiteAdmin: 'yes' as any },
        { isSiteAdmin: 1 as any },
        { role: 'site_admin ' },
        { role: ' site_admin' },
        { role: 'SITE_ADMIN' }
      ];

      maliciousAttempts.forEach((user, index) => {
        const result = isSiteAdmin(user);
        // Only exact matches should work (role === 'site_admin')
        if (user.role === 'site_admin') {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      });
    });

    it('should handle prototype pollution attempts', () => {
      const user = Object.create({ isSiteAdmin: true });
      user.id = '1';

      // Should still detect site admin from prototype
      expect(isSiteAdmin(user)).toBe(true);
    });
  });
});
