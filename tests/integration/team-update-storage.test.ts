/**
 * Storage Layer Integration Tests for Team Update Functionality
 *
 * These tests validate the storage.updateTeam() method including:
 * - Unique constraint violation handling
 * - Whitespace trimming and data normalization
 * - organizationId immutability protection (storage layer defense-in-depth)
 * - Partial update functionality
 *
 * NOTE: These tests use the storage layer directly and do not test:
 * - HTTP status codes and response formats
 * - Authentication and authorization middleware
 * - Route-level error handling
 * For full API endpoint testing with HTTP, see separate API test files.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../../server/storage';
import type { Organization, Team, User } from '@shared/schema';

describe('Team Update Storage Layer Integration Tests', () => {
  let testOrg: Organization;
  let otherOrg: Organization;
  let testTeam: Team;
  let otherTeam: Team;
  let siteAdminUser: User;
  let orgAdminUser: User;
  let coachUser: User;
  let athleteUser: User;
  let createdUsers: string[] = [];
  let createdTeams: string[] = [];
  let createdOrgs: string[] = [];

  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test organizations
    testOrg = await storage.createOrganization({
      name: `Team API Test Org ${timestamp}`,
      contactEmail: `team-api-${timestamp}@example.com`,
    });
    createdOrgs.push(testOrg.id);

    otherOrg = await storage.createOrganization({
      name: `Other API Test Org ${timestamp}`,
      contactEmail: `other-api-${timestamp}@example.com`,
    });
    createdOrgs.push(otherOrg.id);

    // Create test teams
    testTeam = await storage.createTeam({
      name: `API Test Team ${timestamp}`,
      level: 'Club',
      organizationId: testOrg.id,
      notes: 'Original notes',
      season: '2024-Fall',
    });
    createdTeams.push(testTeam.id);

    otherTeam = await storage.createTeam({
      name: `Other API Team ${timestamp}`,
      level: 'HS',
      organizationId: testOrg.id,
    });
    createdTeams.push(otherTeam.id);

    // Create site admin user
    siteAdminUser = await storage.createUser({
      username: `site-admin-api-${timestamp}`,
      password: 'password123',
      emails: [`site-admin-api-${timestamp}@test.com`],
      firstName: 'Site',
      lastName: 'Admin',
      role: 'site_admin',
      isSiteAdmin: true,
    });
    createdUsers.push(siteAdminUser.id);

    // Create org admin user
    orgAdminUser = await storage.createUser({
      username: `org-admin-api-${timestamp}`,
      password: 'password123',
      emails: [`org-admin-api-${timestamp}@test.com`],
      firstName: 'Org',
      lastName: 'Admin',
      role: 'org_admin',
    });
    createdUsers.push(orgAdminUser.id);
    await storage.addUserToOrganization(orgAdminUser.id, testOrg.id, 'org_admin');

    // Create coach user
    coachUser = await storage.createUser({
      username: `coach-api-${timestamp}`,
      password: 'password123',
      emails: [`coach-api-${timestamp}@test.com`],
      firstName: 'Coach',
      lastName: 'User',
      role: 'coach',
    });
    createdUsers.push(coachUser.id);
    await storage.addUserToOrganization(coachUser.id, testOrg.id, 'coach');

    // Create athlete user
    athleteUser = await storage.createUser({
      username: `athlete-api-${timestamp}`,
      password: 'password123',
      emails: [`athlete-api-${timestamp}@test.com`],
      firstName: 'Athlete',
      lastName: 'User',
      role: 'athlete',
    });
    createdUsers.push(athleteUser.id);
    await storage.addUserToOrganization(athleteUser.id, testOrg.id, 'athlete');
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
        console.error(`Failed to delete organization ${orgId}:`, error);
      }
    }
  }, 30000); // Extended timeout for cleanup operations that may involve cascading deletes

  describe('Unique Constraint Handling', () => {
    it('should reject duplicate team names in same organization', async () => {
      // Attempt to update otherTeam to have the same name as testTeam
      await expect(async () => {
        await storage.updateTeam(otherTeam.id, {
          name: testTeam.name,
        });
      }).rejects.toThrow();
    });

    it('should allow same team name in different organizations', async () => {
      // Teams with the same name in different orgs should be allowed
      const teamInOtherOrg = await storage.createTeam({
        name: testTeam.name, // Same name as testTeam
        organizationId: otherOrg.id, // Different org
        level: 'Club',
      });

      createdTeams.push(teamInOtherOrg.id);

      // Should succeed - same name, different org
      expect(teamInOtherOrg.name).toBe(testTeam.name);
      expect(teamInOtherOrg.organizationId).not.toBe(testTeam.organizationId);
    });
  });

  describe('Data Validation & Normalization', () => {
    it('should trim whitespace from team name', async () => {
      const nameWithWhitespace = '  Test Team With Spaces  ';
      const expectedName = 'Test Team With Spaces';

      const updatedTeam = await storage.updateTeam(testTeam.id, {
        name: nameWithWhitespace,
      });

      // Zod schema should trim whitespace from the name
      expect(updatedTeam.name).toBe(expectedName);
      expect(updatedTeam.name).not.toMatch(/^\s|\s$/); // No leading/trailing spaces
    });

    it('should prevent duplicate names even with different whitespace', async () => {
      // Create a team with a specific name
      const baseTeam = await storage.createTeam({
        name: 'Whitespace Test Team',
        organizationId: testOrg.id,
        level: 'Club',
      });
      createdTeams.push(baseTeam.id);

      // Try to update another team with the same name but different whitespace
      await expect(async () => {
        await storage.updateTeam(otherTeam.id, {
          name: '  Whitespace Test Team  ', // Same name with whitespace
        });
      }).rejects.toThrow();
    });
  });

  describe('Organization Immutability (Storage Layer Defense)', () => {
    it('should strip organizationId from updates at storage layer', async () => {
      // Attempt to change organizationId at storage layer
      const updatedTeam = await storage.updateTeam(testTeam.id, {
        name: testTeam.name,
        organizationId: otherOrg.id as any, // Try to change org
      });

      // organizationId should remain unchanged due to storage layer protection
      expect(updatedTeam.organizationId).toBe(testOrg.id);
      expect(updatedTeam.organizationId).not.toBe(otherOrg.id);
    });
  });

  describe('Partial Updates', () => {
    it('should allow updating only the name', async () => {
      const newName = `Updated Name ${Date.now()}`;

      const updatedTeam = await storage.updateTeam(testTeam.id, {
        name: newName,
      });

      expect(updatedTeam.name).toBe(newName);
      expect(updatedTeam.level).toBe(testTeam.level); // Unchanged
      expect(updatedTeam.organizationId).toBe(testTeam.organizationId); // Unchanged
    });

    it('should allow updating only the level', async () => {
      const currentName = (await storage.getTeam(testTeam.id))!.name;

      const updatedTeam = await storage.updateTeam(testTeam.id, {
        level: 'College',
      });

      expect(updatedTeam.level).toBe('College');
      expect(updatedTeam.name).toBe(currentName); // Unchanged
    });

    it('should allow updating notes and season', async () => {
      const newNotes = 'Updated notes';
      const newSeason = '2025-Spring';

      const updatedTeam = await storage.updateTeam(testTeam.id, {
        notes: newNotes,
        season: newSeason,
      });

      expect(updatedTeam.notes).toBe(newNotes);
      expect(updatedTeam.season).toBe(newSeason);
    });

    it('should allow updating multiple fields at once', async () => {
      const updates = {
        name: `Multi Update ${Date.now()}`,
        level: 'HS' as const,
        notes: 'Multi-field update',
        season: '2025-Fall',
      };

      const updatedTeam = await storage.updateTeam(testTeam.id, updates);

      expect(updatedTeam.name).toBe(updates.name);
      expect(updatedTeam.level).toBe(updates.level);
      expect(updatedTeam.notes).toBe(updates.notes);
      expect(updatedTeam.season).toBe(updates.season);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent team', async () => {
      const fakeTeamId = '00000000-0000-0000-0000-000000000000';

      await expect(async () => {
        await storage.updateTeam(fakeTeamId, {
          name: 'Should Fail',
        });
      }).rejects.toThrow('Team not found');
    });

    it('should throw error when no valid fields provided', async () => {
      await expect(async () => {
        await storage.updateTeam(testTeam.id, {
          organizationId: otherOrg.id as any, // Only field, but it gets stripped
        });
      }).rejects.toThrow('No valid fields to update');
    });
  });
});
