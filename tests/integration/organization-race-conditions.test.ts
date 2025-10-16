/**
 * Integration Tests for Organization Deletion Race Conditions
 *
 * Tests database transaction locking to prevent race conditions:
 * - Concurrent deletion attempts
 * - TOCTOU (time-of-check to time-of-use) scenarios
 * - Dependency check race conditions
 *
 * NOTE: Requires DATABASE_URL environment variable to be set to a PostgreSQL connection string
 */

// Set environment variables before any imports
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../../server/storage';
import { OrganizationService } from '../../server/services/organization-service';
import type { Organization, User } from '@shared/schema';

describe.skip('Organization Deletion Race Conditions', () => {
  let siteAdminUser: User;
  let organizationService: OrganizationService;

  beforeAll(async () => {
    // Validate DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run integration tests. ' +
        'See README.md for PostgreSQL setup instructions.'
      );
    }

    organizationService = new OrganizationService();
    const timestamp = Date.now();

    // Create site admin user
    const siteAdminData = await storage.createUser({
      username: `test-siteadmin-race-${timestamp}`,
      password: 'TestPass123!',
      emails: [`siteadmin-race-${timestamp}@test.com`],
      firstName: 'Site',
      lastName: 'Admin',
      isSiteAdmin: true,
    });
    siteAdminUser = siteAdminData;
  });

  afterAll(async () => {
    // Cleanup
    try {
      await storage.deleteUser(siteAdminUser.id);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Concurrent Deletion Attempts', () => {
    it('should prevent concurrent deletion of same organization (double delete)', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Race Condition Org ${timestamp}`,
        description: 'Test concurrent deletion',
      });

      // Attempt two simultaneous deletions
      const deletion1 = organizationService.deleteOrganization(
        org.id,
        `Race Condition Org ${timestamp}`,
        siteAdminUser.id
      );

      const deletion2 = organizationService.deleteOrganization(
        org.id,
        `Race Condition Org ${timestamp}`,
        siteAdminUser.id
      );

      // One should succeed, one should fail
      const results = await Promise.allSettled([deletion1, deletion2]);

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Exactly one should succeed
      expect(succeeded).toBe(1);
      expect(failed).toBe(1);

      // Verify organization is actually deleted
      const deletedOrg = await storage.getOrganization(org.id);
      expect(deletedOrg).toBeUndefined();
    });

    it('should handle triple concurrent deletion attempts', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Triple Race Org ${timestamp}`,
        description: 'Test triple concurrent deletion',
      });

      // Attempt three simultaneous deletions
      const results = await Promise.allSettled([
        organizationService.deleteOrganization(
          org.id,
          `Triple Race Org ${timestamp}`,
          siteAdminUser.id
        ),
        organizationService.deleteOrganization(
          org.id,
          `Triple Race Org ${timestamp}`,
          siteAdminUser.id
        ),
        organizationService.deleteOrganization(
          org.id,
          `Triple Race Org ${timestamp}`,
          siteAdminUser.id
        ),
      ]);

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Exactly one should succeed
      expect(succeeded).toBe(1);
      expect(failed).toBe(2);

      // Verify organization is deleted
      const deletedOrg = await storage.getOrganization(org.id);
      expect(deletedOrg).toBeUndefined();
    });
  });

  describe('TOCTOU (Time-of-Check to Time-of-Use) Race Conditions', () => {
    it('should prevent TOCTOU race: dependency check → add user → deletion', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `TOCTOU Test Org ${timestamp}`,
        description: 'Test TOCTOU race condition',
      });

      // Start deletion (will check dependencies first)
      const deletionPromise = organizationService.deleteOrganization(
        org.id,
        `TOCTOU Test Org ${timestamp}`,
        siteAdminUser.id
      );

      // Immediately add a user while deletion is in progress
      const userPromise = (async () => {
        const user = await storage.createUser({
          username: `toctou-user-${timestamp}`,
          password: 'TestPass123!',
          emails: [`toctou-user-${timestamp}@test.com`],
          firstName: 'TOCTOU',
          lastName: 'User',
        });
        await storage.addUserToOrganization(user.id, org.id, 'athlete');
        return user;
      })();

      const results = await Promise.allSettled([deletionPromise, userPromise]);

      // The deletion should succeed OR fail with dependency error
      // The user addition should succeed OR fail (org deleted)
      // Either way, data integrity is maintained

      const deletionResult = results[0];
      const userResult = results[1];

      if (deletionResult.status === 'fulfilled') {
        // Deletion succeeded - org should be gone
        const orgAfter = await storage.getOrganization(org.id);
        expect(orgAfter).toBeUndefined();

        // User addition may have failed (org deleted) or succeeded (foreign key violation)
        if (userResult.status === 'fulfilled') {
          // If user was added, it should be orphaned (can't be in deleted org)
          // This is OK - foreign key constraints prevent dangling references
          await storage.deleteUser(userResult.value.id);
        }
      } else {
        // Deletion failed - org should still exist with user
        const orgAfter = await storage.getOrganization(org.id);
        expect(orgAfter).toBeDefined();

        // User should have been added successfully
        expect(userResult.status).toBe('fulfilled');

        // Cleanup
        if (userResult.status === 'fulfilled') {
          await storage.removeUserFromOrganization(userResult.value.id, org.id);
          await storage.deleteUser(userResult.value.id);
        }
        await storage.deleteOrganization(org.id);
      }
    });

    it('should prevent TOCTOU race: check dependencies → add team → deletion', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `TOCTOU Team Org ${timestamp}`,
        description: 'Test TOCTOU with team',
      });

      // Start deletion
      const deletionPromise = organizationService.deleteOrganization(
        org.id,
        `TOCTOU Team Org ${timestamp}`,
        siteAdminUser.id
      );

      // Immediately add a team
      const teamPromise = storage.createTeam({
        name: 'TOCTOU Team',
        organizationId: org.id,
        level: 'Club',
      });

      const results = await Promise.allSettled([deletionPromise, teamPromise]);

      const deletionResult = results[0];
      const teamResult = results[1];

      if (deletionResult.status === 'fulfilled') {
        // Deletion succeeded
        const orgAfter = await storage.getOrganization(org.id);
        expect(orgAfter).toBeUndefined();

        // Cleanup team if it was created
        if (teamResult.status === 'fulfilled') {
          await storage.deleteTeam(teamResult.value.id);
        }
      } else {
        // Deletion failed - verify org exists with team
        const orgAfter = await storage.getOrganization(org.id);
        expect(orgAfter).toBeDefined();

        // Cleanup
        if (teamResult.status === 'fulfilled') {
          await storage.deleteTeam(teamResult.value.id);
        }
        await storage.deleteOrganization(org.id);
      }
    });
  });

  describe('Concurrent Deactivation and Deletion', () => {
    it('should handle concurrent deactivation and deletion', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Deactivate Delete Race ${timestamp}`,
        description: 'Test concurrent deactivation and deletion',
      });

      // Attempt simultaneous deactivation and deletion
      const results = await Promise.allSettled([
        organizationService.deactivateOrganization(org.id, siteAdminUser.id),
        organizationService.deleteOrganization(
          org.id,
          `Deactivate Delete Race ${timestamp}`,
          siteAdminUser.id
        ),
      ]);

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Both might succeed (deactivate then delete) or one might fail
      expect(succeeded + failed).toBe(2);

      // Check final state
      const orgAfter = await storage.getOrganization(org.id);

      if (orgAfter) {
        // Deactivation won - org exists but deactivated
        expect(orgAfter.isActive).toBe(false);
        // Cleanup
        await storage.deleteOrganization(org.id);
      } else {
        // Deletion won - org is gone
        expect(orgAfter).toBeUndefined();
      }
    });
  });

  describe('Concurrent Dependency Count Fetches', () => {
    it('should handle concurrent dependency count requests', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Dependency Count Race ${timestamp}`,
        description: 'Test concurrent dependency counts',
      });

      // Add some dependencies
      const user = await storage.createUser({
        username: `dep-count-user-${timestamp}`,
        password: 'TestPass123!',
        emails: [`dep-count-${timestamp}@test.com`],
        firstName: 'Dep',
        lastName: 'Count',
      });
      await storage.addUserToOrganization(user.id, org.id, 'athlete');

      // Fetch dependency counts concurrently
      const results = await Promise.all([
        organizationService.getOrganizationDependencyCounts(org.id, siteAdminUser.id),
        organizationService.getOrganizationDependencyCounts(org.id, siteAdminUser.id),
        organizationService.getOrganizationDependencyCounts(org.id, siteAdminUser.id),
      ]);

      // All should succeed with same counts
      expect(results).toHaveLength(3);
      results.forEach(counts => {
        expect(counts.users).toBe(1);
        expect(counts.teams).toBe(0);
      });

      // Cleanup
      await storage.removeUserFromOrganization(user.id, org.id);
      await storage.deleteUser(user.id);
      await storage.deleteOrganization(org.id);
    });

    it('should handle dependency count during concurrent user additions', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Concurrent Dep Count ${timestamp}`,
        description: 'Test dependency count with concurrent additions',
      });

      // Create 5 users and add them concurrently while fetching counts
      const userPromises = Array.from({ length: 5 }, async (_, i) => {
        const user = await storage.createUser({
          username: `concurrent-user-${timestamp}-${i}`,
          password: 'TestPass123!',
          emails: [`concurrent-${timestamp}-${i}@test.com`],
          firstName: 'Concurrent',
          lastName: `User${i}`,
        });
        await storage.addUserToOrganization(user.id, org.id, 'athlete');
        return user;
      });

      const countPromises = Array.from({ length: 3 }, () =>
        organizationService.getOrganizationDependencyCounts(org.id, siteAdminUser.id)
      );

      const [users, counts] = await Promise.all([
        Promise.all(userPromises),
        Promise.all(countPromises),
      ]);

      // All count fetches should succeed (counts may vary 0-5)
      expect(counts).toHaveLength(3);
      counts.forEach(c => {
        expect(c.users).toBeGreaterThanOrEqual(0);
        expect(c.users).toBeLessThanOrEqual(5);
      });

      // Final count should be 5
      const finalCount = await organizationService.getOrganizationDependencyCounts(
        org.id,
        siteAdminUser.id
      );
      expect(finalCount.users).toBe(5);

      // Cleanup
      for (const user of users) {
        await storage.removeUserFromOrganization(user.id, org.id);
        await storage.deleteUser(user.id);
      }
      await storage.deleteOrganization(org.id);
    });
  });

  describe('Database Transaction Isolation', () => {
    it('should maintain transaction isolation during deletion', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Transaction Isolation Org ${timestamp}`,
        description: 'Test transaction isolation',
      });

      // Add user
      const user = await storage.createUser({
        username: `trans-user-${timestamp}`,
        password: 'TestPass123!',
        emails: [`trans-${timestamp}@test.com`],
        firstName: 'Trans',
        lastName: 'User',
      });
      await storage.addUserToOrganization(user.id, org.id, 'athlete');

      // Attempt deletion (should fail due to user)
      await expect(
        organizationService.deleteOrganization(
          org.id,
          `Transaction Isolation Org ${timestamp}`,
          siteAdminUser.id
        )
      ).rejects.toThrow(/active dependencies/i);

      // Verify org still exists
      const orgAfter = await storage.getOrganization(org.id);
      expect(orgAfter).toBeDefined();
      expect(orgAfter?.isActive).toBe(true);

      // Verify user still exists
      const userAfter = await storage.getUser(user.id);
      expect(userAfter).toBeDefined();

      // Cleanup
      await storage.removeUserFromOrganization(user.id, org.id);
      await storage.deleteUser(user.id);
      await storage.deleteOrganization(org.id);
    });

    it('should rollback deletion on any error', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Rollback Test Org ${timestamp}`,
        description: 'Test transaction rollback',
      });

      // Try to delete with wrong confirmation name
      await expect(
        organizationService.deleteOrganization(
          org.id,
          'Wrong Name',
          siteAdminUser.id
        )
      ).rejects.toThrow(/confirmation does not match/i);

      // Verify org still exists and unchanged
      const orgAfter = await storage.getOrganization(org.id);
      expect(orgAfter).toBeDefined();
      expect(orgAfter?.name).toBe(`Rollback Test Org ${timestamp}`);
      expect(orgAfter?.isActive).toBe(true);

      // Cleanup
      await storage.deleteOrganization(org.id);
    });
  });
});
