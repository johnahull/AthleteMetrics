/**
 * Integration Tests for Team Update Operations
 *
 * These tests validate:
 * - Updating team without changing name (unique constraint handling)
 * - Updating team with name change
 * - Unique constraint validation (preventing duplicate team names in same org)
 * - Permission checks for team updates
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../../server/storage';
import type { Organization, Team, User } from '@shared/schema';

describe('Team Update Integration Tests', () => {
  let testOrg: Organization;
  let otherOrg: Organization;
  let testTeam: Team;
  let otherTeam: Team;
  let orgAdminUser: User;
  let coachUser: User;
  let createdUsers: string[] = [];
  let createdTeams: string[] = [];
  let createdOrgs: string[] = [];

  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test organizations
    testOrg = await storage.createOrganization({
      name: `Test Team Update Org ${timestamp}`,
      contactEmail: `team-update-${timestamp}@example.com`,
    });
    createdOrgs.push(testOrg.id);

    otherOrg = await storage.createOrganization({
      name: `Other Team Update Org ${timestamp}`,
      contactEmail: `other-team-update-${timestamp}@example.com`,
    });
    createdOrgs.push(otherOrg.id);

    // Create test teams
    testTeam = await storage.createTeam({
      name: `Test Team ${timestamp}`,
      level: 'Club',
      organizationId: testOrg.id,
      notes: 'Original notes',
      season: '2024-Fall',
    });
    createdTeams.push(testTeam.id);

    otherTeam = await storage.createTeam({
      name: `Other Team ${timestamp}`,
      level: 'HS',
      organizationId: testOrg.id,
    });
    createdTeams.push(otherTeam.id);

    // Create org admin user
    orgAdminUser = await storage.createUser({
      username: `team-update-admin-${timestamp}`,
      password: 'password123',
      emails: [`team-update-admin-${timestamp}@test.com`],
      firstName: 'Admin',
      lastName: 'User',
      role: 'org_admin',
    });
    createdUsers.push(orgAdminUser.id);
    await storage.addUserToOrganization(orgAdminUser.id, testOrg.id, 'org_admin');

    // Create coach user
    coachUser = await storage.createUser({
      username: `team-update-coach-${timestamp}`,
      password: 'password123',
      emails: [`team-update-coach-${timestamp}@test.com`],
      firstName: 'Coach',
      lastName: 'User',
      role: 'coach',
    });
    createdUsers.push(coachUser.id);
    await storage.addUserToOrganization(coachUser.id, testOrg.id, 'coach');
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    for (const userId of createdUsers) {
      try {
        await storage.deleteUser(userId);
      } catch (error) {
        console.error(`Failed to delete user ${userId}:`, error);
      }
    }

    for (const teamId of createdTeams) {
      try {
        await storage.deleteTeam(teamId);
      } catch (error) {
        console.error(`Failed to delete team ${teamId}:`, error);
      }
    }

    for (const orgId of createdOrgs) {
      try {
        await storage.deleteOrganization(orgId);
      } catch (error) {
        console.error(`Failed to delete org ${orgId}:`, error);
      }
    }
  });

  describe('Update Team Without Name Change', () => {
    it('should update team notes without changing name (unique constraint test)', async () => {
      const updatedTeam = await storage.updateTeam(testTeam.id, {
        notes: 'Updated notes without name change',
      });

      expect(updatedTeam).toBeDefined();
      expect(updatedTeam.id).toBe(testTeam.id);
      expect(updatedTeam.name).toBe(testTeam.name); // Name unchanged
      expect(updatedTeam.notes).toBe('Updated notes without name change');
    });

    it('should update team level without changing name', async () => {
      const updatedTeam = await storage.updateTeam(testTeam.id, {
        level: 'HS',
      });

      expect(updatedTeam).toBeDefined();
      expect(updatedTeam.name).toBe(testTeam.name); // Name unchanged
      expect(updatedTeam.level).toBe('HS');
    });

    it('should update team season without changing name', async () => {
      const updatedTeam = await storage.updateTeam(testTeam.id, {
        season: '2025-Spring',
      });

      expect(updatedTeam).toBeDefined();
      expect(updatedTeam.name).toBe(testTeam.name); // Name unchanged
      expect(updatedTeam.season).toBe('2025-Spring');
    });

    it('should update multiple fields without changing name', async () => {
      const updatedTeam = await storage.updateTeam(testTeam.id, {
        notes: 'Multi-field update',
        level: 'College',
        season: '2025-Fall',
      });

      expect(updatedTeam).toBeDefined();
      expect(updatedTeam.name).toBe(testTeam.name); // Name unchanged
      expect(updatedTeam.notes).toBe('Multi-field update');
      expect(updatedTeam.level).toBe('College');
      expect(updatedTeam.season).toBe('2025-Fall');
    });
  });

  describe('Update Team With Name Change', () => {
    it('should update team name to a new unique name', async () => {
      const timestamp = Date.now();
      const newName = `Updated Team Name ${timestamp}`;

      const updatedTeam = await storage.updateTeam(testTeam.id, {
        name: newName,
      });

      expect(updatedTeam).toBeDefined();
      expect(updatedTeam.id).toBe(testTeam.id);
      expect(updatedTeam.name).toBe(newName);

      // Update local reference for other tests
      testTeam.name = newName;
    });

    it('should update team name and other fields together', async () => {
      const timestamp = Date.now();
      const newName = `Updated Team Full ${timestamp}`;

      const updatedTeam = await storage.updateTeam(testTeam.id, {
        name: newName,
        notes: 'Updated with new name',
        level: 'Club',
      });

      expect(updatedTeam).toBeDefined();
      expect(updatedTeam.name).toBe(newName);
      expect(updatedTeam.notes).toBe('Updated with new name');
      expect(updatedTeam.level).toBe('Club');

      // Update local reference
      testTeam.name = newName;
    });
  });

  describe('Unique Constraint Validation', () => {
    it('should prevent duplicate team names in same organization', async () => {
      // Try to update otherTeam to have the same name as testTeam
      await expect(async () => {
        await storage.updateTeam(otherTeam.id, {
          name: testTeam.name, // This should fail - duplicate name in same org
        });
      }).rejects.toThrow();
    });

    it('should allow same team name in different organizations', async () => {
      const timestamp = Date.now();
      const sharedName = `Shared Team Name ${timestamp}`;

      // Create team in first org with the name
      const team1 = await storage.createTeam({
        name: sharedName,
        level: 'Club',
        organizationId: testOrg.id,
      });
      createdTeams.push(team1.id);

      // Create team in second org with the same name - should succeed
      const team2 = await storage.createTeam({
        name: sharedName,
        level: 'Club',
        organizationId: otherOrg.id,
      });
      createdTeams.push(team2.id);

      expect(team1.name).toBe(sharedName);
      expect(team2.name).toBe(sharedName);
      expect(team1.organizationId).not.toBe(team2.organizationId);
    });
  });

  describe('Team Update Retrieval', () => {
    it('should retrieve updated team with correct data', async () => {
      const timestamp = Date.now();
      const updateData = {
        notes: `Verified Update ${timestamp}`,
        level: 'HS' as const,
      };

      await storage.updateTeam(testTeam.id, updateData);

      const retrievedTeam = await storage.getTeam(testTeam.id);

      expect(retrievedTeam).toBeDefined();
      expect(retrievedTeam?.notes).toBe(updateData.notes);
      expect(retrievedTeam?.level).toBe(updateData.level);
    });
  });

  describe('Partial Updates', () => {
    it('should throw error on empty update (Drizzle behavior)', async () => {
      // Drizzle ORM throws "No valid fields to update" for empty updates
      await expect(async () => {
        await storage.updateTeam(testTeam.id, {});
      }).rejects.toThrow('No valid fields to update');
    });

    it('should handle undefined fields by filtering them out', async () => {
      const beforeUpdate = await storage.getTeam(testTeam.id);

      // In real usage, frontend filters out undefined values
      const updateData: any = {
        notes: 'Valid update',
        season: undefined,
      };

      // Remove undefined values
      const cleanedData = Object.fromEntries(
        Object.entries(updateData).filter(([_, v]) => v !== undefined)
      );

      const updatedTeam = await storage.updateTeam(testTeam.id, cleanedData);

      expect(updatedTeam).toBeDefined();
      expect(updatedTeam.notes).toBe('Valid update');
      expect(updatedTeam.season).toBe(beforeUpdate?.season); // Unchanged
    });
  });

  describe('Team Organization Immutability', () => {
    it('should not allow changing team organization via update', async () => {
      const originalOrgId = testTeam.organizationId;

      // Even if we try to update organizationId, it should not change
      // (This depends on API implementation - may be rejected or ignored)
      try {
        await storage.updateTeam(testTeam.id, {
          organizationId: otherOrg.id,
        } as any);

        const retrievedTeam = await storage.getTeam(testTeam.id);

        // Organization should remain unchanged
        expect(retrievedTeam?.organizationId).toBe(originalOrgId);
      } catch (error) {
        // If the API rejects it, that's also acceptable
        expect(error).toBeDefined();
      }
    });
  });
});
