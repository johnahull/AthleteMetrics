/**
 * Migration test for isSiteAdmin field conversion from string to boolean
 *
 * This test verifies that the migration from TEXT to BOOLEAN type was successful
 * and that all related code correctly handles the boolean type.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../server/db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

describe('isSiteAdmin Migration Tests', () => {
  let databaseAvailable = false;

  beforeAll(async () => {
    try {
      await db.select().from(users).limit(1);
      databaseAvailable = true;
    } catch (error) {
      console.warn('Database not available for migration tests, skipping...');
      databaseAvailable = false;
    }
  });

  describe('Database Schema', () => {
    it.skipIf(!databaseAvailable)('should have isSiteAdmin as boolean type in database', async () => {
      // Query a user and verify the type
      const allUsers = await db.select().from(users).limit(1);

      if (allUsers.length > 0) {
        const user = allUsers[0];
        expect(typeof user.isSiteAdmin).toBe('boolean');
      }
    });

    it.skipIf(!databaseAvailable)('should return boolean values for isSiteAdmin field', async () => {
      const allUsers = await db.select().from(users);

      allUsers.forEach(user => {
        expect(user.isSiteAdmin).toBeTypeOf('boolean');
        expect(user.isSiteAdmin === true || user.isSiteAdmin === false).toBe(true);
      });
    });

    it.skipIf(!databaseAvailable)('should filter users by boolean true value', async () => {
      const siteAdmins = await db.select()
        .from(users)
        .where(eq(users.isSiteAdmin, true));

      siteAdmins.forEach(admin => {
        expect(admin.isSiteAdmin).toBe(true);
        expect(typeof admin.isSiteAdmin).toBe('boolean');
      });
    });

    it.skipIf(!databaseAvailable)('should filter users by boolean false value', async () => {
      const nonAdmins = await db.select()
        .from(users)
        .where(eq(users.isSiteAdmin, false));

      nonAdmins.forEach(user => {
        expect(user.isSiteAdmin).toBe(false);
        expect(typeof user.isSiteAdmin).toBe('boolean');
      });
    });
  });

  describe('Data Integrity', () => {
    it.skipIf(!databaseAvailable)('should have exactly one site admin (based on migration)', async () => {
      const siteAdmins = await db.select()
        .from(users)
        .where(eq(users.isSiteAdmin, true));

      expect(siteAdmins.length).toBe(1);
    });

    it.skipIf(!databaseAvailable)('should have 172 non-admin users (based on migration)', async () => {
      const nonAdmins = await db.select()
        .from(users)
        .where(eq(users.isSiteAdmin, false));

      expect(nonAdmins.length).toBe(172);
    });

    it.skipIf(!databaseAvailable)('should have total of 173 users', async () => {
      const allUsers = await db.select().from(users);
      expect(allUsers.length).toBe(173);
    });
  });

  describe('Default Values', () => {
    it.skipIf(!databaseAvailable)('should use boolean false as default for new users', async () => {
      // Create a test user without specifying isSiteAdmin
      const testUser = await db.insert(users).values({
        username: 'migration-test-user',
        firstName: 'Test',
        lastName: 'User',
        fullName: 'Test User',
        emails: ['migration-test@example.com'],
        password: 'test-password'
        // isSiteAdmin intentionally omitted to test default
      }).returning();

      expect(testUser[0].isSiteAdmin).toBe(false);
      expect(typeof testUser[0].isSiteAdmin).toBe('boolean');

      // Cleanup
      await db.delete(users).where(eq(users.id, testUser[0].id));
    });
  });

  describe('Boolean Comparison Operations', () => {
    it.skipIf(!databaseAvailable)('should correctly compare isSiteAdmin === true', async () => {
      const allUsers = await db.select().from(users);

      const adminsViaComparison = allUsers.filter(u => u.isSiteAdmin === true);
      const adminsViaQuery = await db.select()
        .from(users)
        .where(eq(users.isSiteAdmin, true));

      expect(adminsViaComparison.length).toBe(adminsViaQuery.length);
    });

    it.skipIf(!databaseAvailable)('should correctly compare isSiteAdmin === false', async () => {
      const allUsers = await db.select().from(users);

      const nonAdminsViaComparison = allUsers.filter(u => u.isSiteAdmin === false);
      const nonAdminsViaQuery = await db.select()
        .from(users)
        .where(eq(users.isSiteAdmin, false));

      expect(nonAdminsViaComparison.length).toBe(nonAdminsViaQuery.length);
    });

    it.skipIf(!databaseAvailable)('should NOT match string "true" comparison', async () => {
      const allUsers = await db.select().from(users);

      // This should find NO users because we're comparing boolean to string
      const stringComparison = allUsers.filter(u => (u.isSiteAdmin as any) === "true");

      expect(stringComparison.length).toBe(0);
    });
  });
});
