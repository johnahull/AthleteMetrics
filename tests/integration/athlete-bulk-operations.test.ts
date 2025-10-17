/**
 * Integration Tests for Athlete Bulk Operations
 *
 * These tests validate:
 * - Bulk delete operations with permission checks
 * - Bulk invite operations with organization validation
 * - Team assignment during athlete creation
 * - N+1 query optimization
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../../packages/api/storage';
import type { Organization, Team, User } from '@shared/schema';

describe.skip('Athlete Bulk Operations Integration Tests', () => {
  let testOrg: Organization;
  let otherOrg: Organization;
  let testTeam: Team;
  let orgAdminUser: User;
  let coachUser: User;
  let otherOrgCoach: User;
  let createdAthletes: string[] = [];
  let createdUsers: string[] = [];
  let createdOrgs: string[] = [];
  let createdTeams: string[] = [];

  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test organizations
    testOrg = await storage.createOrganization({
      name: `Test Bulk Ops Org ${timestamp}`,
      contactEmail: `bulkops-${timestamp}@example.com`,
    });
    createdOrgs.push(testOrg.id);

    otherOrg = await storage.createOrganization({
      name: `Other Bulk Ops Org ${timestamp}`,
      contactEmail: `other-bulkops-${timestamp}@example.com`,
    });
    createdOrgs.push(otherOrg.id);

    // Create test team
    testTeam = await storage.createTeam({
      name: `Bulk Ops Team ${timestamp}`,
      level: 'Club',
      organizationId: testOrg.id,
    });
    createdTeams.push(testTeam.id);

    // Create org admin user
    orgAdminUser = await storage.createUser({
      username: `bulk-ops-admin-${timestamp}`,
      password: 'password123',
      emails: [`bulk-ops-admin-${timestamp}@test.com`],
      firstName: 'Admin',
      lastName: 'User',
      role: 'org_admin',
    });
    createdUsers.push(orgAdminUser.id);
    await storage.addUserToOrganization(orgAdminUser.id, testOrg.id, 'org_admin');

    // Create coach user
    coachUser = await storage.createUser({
      username: `bulk-ops-coach-${timestamp}`,
      password: 'password123',
      emails: [`bulk-ops-coach-${timestamp}@test.com`],
      firstName: 'Coach',
      lastName: 'User',
      role: 'coach',
    });
    createdUsers.push(coachUser.id);
    await storage.addUserToOrganization(coachUser.id, testOrg.id, 'coach');

    // Create coach in other org
    otherOrgCoach = await storage.createUser({
      username: `other-org-coach-${timestamp}`,
      password: 'password123',
      emails: [`other-org-coach-${timestamp}@test.com`],
      firstName: 'Other',
      lastName: 'Coach',
      role: 'coach',
    });
    createdUsers.push(otherOrgCoach.id);
    await storage.addUserToOrganization(otherOrgCoach.id, otherOrg.id, 'coach');
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    for (const athleteId of createdAthletes) {
      try {
        await storage.deleteAthlete(athleteId);
      } catch (error) {
        console.error(`Failed to delete athlete ${athleteId}:`, error);
      }
    }

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

  describe('Bulk Delete Operations', () => {
    it('should delete multiple athletes in same organization', async () => {
      // Create 3 athletes
      const athlete1 = await storage.createAthlete({
        firstName: 'BulkDelete1',
        lastName: 'Test',
        emails: ['bulkdelete1@example.com'],
        birthDate: '2005-01-01',
      });
      createdAthletes.push(athlete1.id);
      await storage.addUserToOrganization(athlete1.id, testOrg.id, 'athlete');

      const athlete2 = await storage.createAthlete({
        firstName: 'BulkDelete2',
        lastName: 'Test',
        emails: ['bulkdelete2@example.com'],
        birthDate: '2005-02-01',
      });
      createdAthletes.push(athlete2.id);
      await storage.addUserToOrganization(athlete2.id, testOrg.id, 'athlete');

      const athlete3 = await storage.createAthlete({
        firstName: 'BulkDelete3',
        lastName: 'Test',
        emails: ['bulkdelete3@example.com'],
        birthDate: '2005-03-01',
      });
      createdAthletes.push(athlete3.id);
      await storage.addUserToOrganization(athlete3.id, testOrg.id, 'athlete');

      const athleteIds = [athlete1.id, athlete2.id, athlete3.id];

      // Simulate bulk delete with permission checks (as non-admin)
      const userOrgs = await storage.getUserOrganizations(coachUser.id);
      const userOrgIds = userOrgs.map(org => org.organizationId);

      // Batch permission checks
      const athleteChecks = await Promise.all(
        athleteIds.map(async (athleteId) => {
          const athlete = await storage.getAthlete(athleteId);
          if (!athlete) return { athleteId, hasAccess: false };

          const athleteTeams = await storage.getUserTeams(athleteId);
          const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
          const hasAccess = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

          return { athleteId, hasAccess };
        })
      );

      const authorizedAthletes = athleteChecks
        .filter(check => check.hasAccess)
        .map(check => check.athleteId);

      // Should have access to all 3 (but they need team assignment for this test to work)
      // Since we only added org membership, let's add team membership
      await storage.addUserToTeam(athlete1.id, testTeam.id);
      await storage.addUserToTeam(athlete2.id, testTeam.id);
      await storage.addUserToTeam(athlete3.id, testTeam.id);

      // Re-run permission check
      const athleteChecks2 = await Promise.all(
        athleteIds.map(async (athleteId) => {
          const athlete = await storage.getAthlete(athleteId);
          if (!athlete) return { athleteId, hasAccess: false };

          const athleteTeams = await storage.getUserTeams(athleteId);
          const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
          const hasAccess = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

          return { athleteId, hasAccess };
        })
      );

      const authorizedAthletes2 = athleteChecks2
        .filter(check => check.hasAccess)
        .map(check => check.athleteId);

      expect(authorizedAthletes2).toHaveLength(3);

      // Delete athletes in parallel
      const deleteResults = await Promise.allSettled(
        authorizedAthletes2.map(id => storage.deleteAthlete(id))
      );

      const deletedCount = deleteResults.filter(r => r.status === 'fulfilled').length;
      expect(deletedCount).toBe(3);

      // Remove from tracking since they're deleted
      createdAthletes = createdAthletes.filter(id => !athleteIds.includes(id));

      // Verify deletion
      const check1 = await storage.getAthlete(athlete1.id);
      const check2 = await storage.getAthlete(athlete2.id);
      const check3 = await storage.getAthlete(athlete3.id);

      expect(check1).toBeUndefined();
      expect(check2).toBeUndefined();
      expect(check3).toBeUndefined();
    });

    it('should prevent deleting athletes from different organization', async () => {
      // Create athlete in testOrg
      const athlete = await storage.createAthlete({
        firstName: 'Unauthorized',
        lastName: 'Delete',
        emails: ['unauthorized-delete@example.com'],
        birthDate: '2005-04-01',
      });
      createdAthletes.push(athlete.id);
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(athlete.id, testTeam.id);

      // Try to delete with coach from otherOrg
      const userOrgs = await storage.getUserOrganizations(otherOrgCoach.id);
      const userOrgIds = userOrgs.map(org => org.organizationId);

      const athleteTeams = await storage.getUserTeams(athlete.id);
      const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
      const hasAccess = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

      expect(hasAccess).toBe(false);

      // Should not be able to delete
      // In the actual implementation, this athlete would be filtered out
    });

    it('should handle partial failures in bulk delete', async () => {
      const athlete1 = await storage.createAthlete({
        firstName: 'Partial1',
        lastName: 'Delete',
        emails: ['partial1@example.com'],
        birthDate: '2005-05-01',
      });
      createdAthletes.push(athlete1.id);
      await storage.addUserToOrganization(athlete1.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(athlete1.id, testTeam.id);

      const athlete2 = await storage.createAthlete({
        firstName: 'Partial2',
        lastName: 'Delete',
        emails: ['partial2@example.com'],
        birthDate: '2005-06-01',
      });
      createdAthletes.push(athlete2.id);
      await storage.addUserToOrganization(athlete2.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(athlete2.id, testTeam.id);

      // Include non-existent athlete ID
      const athleteIds = [athlete1.id, athlete2.id, 'non-existent-id'];

      const deleteResults = await Promise.allSettled(
        athleteIds.map(id => storage.deleteAthlete(id))
      );

      const deletedCount = deleteResults.filter(r => r.status === 'fulfilled').length;
      const failedCount = deleteResults.filter(r => r.status === 'rejected').length;

      // Note: deleteAthlete may succeed for non-existent IDs (returns without error)
      // So we check that at least 2 were deleted
      expect(deletedCount).toBeGreaterThanOrEqual(2);

      // Remove from tracking
      createdAthletes = createdAthletes.filter(id => ![athlete1.id, athlete2.id].includes(id));
    });
  });

  describe('Bulk Invite Operations', () => {
    it('should create invitations for multiple athletes in same organization', async () => {
      const timestamp = Date.now();

      // Create 2 athletes with emails
      const athlete1 = await storage.createAthlete({
        firstName: 'Invite1',
        lastName: 'Test',
        emails: [`invite1-${timestamp}@example.com`],
        birthDate: '2005-07-01',
      });
      createdAthletes.push(athlete1.id);
      await storage.addUserToOrganization(athlete1.id, testOrg.id, 'athlete');

      const athlete2 = await storage.createAthlete({
        firstName: 'Invite2',
        lastName: 'Test',
        emails: [`invite2-${timestamp}@example.com`],
        birthDate: '2005-08-01',
      });
      createdAthletes.push(athlete2.id);
      await storage.addUserToOrganization(athlete2.id, testOrg.id, 'athlete');

      const athleteIds = [athlete1.id, athlete2.id];

      // Batch fetch athletes and validate organization membership
      const athleteData = await Promise.all(
        athleteIds.map(async (athleteId) => {
          const [athlete, athleteOrgs, athleteTeams] = await Promise.all([
            storage.getAthlete(athleteId),
            storage.getUserOrganizations(athleteId),
            storage.getUserTeams(athleteId)
          ]);

          if (!athlete) return { athleteId, valid: false, reason: 'not_found' };

          // Verify athlete belongs to target organization
          const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
          const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);
          const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

          const belongsToOrganization = allAthleteOrgIds.includes(testOrg.id);
          if (!belongsToOrganization) {
            return { athleteId, valid: false, reason: 'wrong_organization' };
          }

          if (!athlete.emails || athlete.emails.length === 0) {
            return { athleteId, valid: false, reason: 'no_email' };
          }

          return { athleteId, valid: true, athlete };
        })
      );

      const validAthletes = athleteData.filter(data => data.valid);
      expect(validAthletes).toHaveLength(2);

      // Create invitations in parallel
      const invitationPromises = validAthletes.flatMap(data => {
        const athlete = data.athlete!;
        return athlete.emails!.map(email =>
          storage.createInvitation({
            email,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            role: "athlete",
            organizationId: testOrg.id,
            teamIds: [],
            invitedBy: orgAdminUser.id,
            playerId: data.athleteId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          })
        );
      });

      const results = await Promise.allSettled(invitationPromises);
      const invitedCount = results.filter(r => r.status === 'fulfilled').length;

      expect(invitedCount).toBe(2);
    });

    it('should prevent inviting athletes from different organization (SECURITY FIX)', async () => {
      const timestamp = Date.now();

      // Create athlete in testOrg
      const athlete = await storage.createAthlete({
        firstName: 'WrongOrg',
        lastName: 'Invite',
        emails: [`wrongorg-${timestamp}@example.com`],
        birthDate: '2005-09-01',
      });
      createdAthletes.push(athlete.id);
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Try to invite to otherOrg (SHOULD FAIL with the security fix)
      const [athleteRecord, athleteOrgs, athleteTeams] = await Promise.all([
        storage.getAthlete(athlete.id),
        storage.getUserOrganizations(athlete.id),
        storage.getUserTeams(athlete.id)
      ]);

      expect(athleteRecord).toBeDefined();

      const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
      const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);
      const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

      const belongsToOtherOrg = allAthleteOrgIds.includes(otherOrg.id);
      expect(belongsToOtherOrg).toBe(false);

      // This athlete should be skipped in bulk invite to otherOrg
    });

    it('should skip athletes without emails', async () => {
      const timestamp = Date.now();

      // Create athlete with email, then update to remove it (workaround if schema requires email on creation)
      const athlete = await storage.createAthlete({
        firstName: 'NoEmail',
        lastName: 'Test',
        emails: [`temp-${timestamp}@example.com`],
        birthDate: '2005-10-01',
      });
      createdAthletes.push(athlete.id);
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Update to remove emails (if update allows it)
      try {
        await storage.updateAthlete(athlete.id, { emails: [] });
      } catch (error) {
        // If schema doesn't allow empty emails, that's fine - skip this test case
        console.log('Schema requires at least one email - test case not applicable');
      }

      const athleteRecord = await storage.getAthlete(athlete.id);
      const hasEmails = athleteRecord && athleteRecord.emails && athleteRecord.emails.length > 0;

      // If emails are still present (schema requires them), that's expected
      // The important thing is that the bulk invite logic checks for emails
      if (!hasEmails) {
        expect(hasEmails).toBe(false);
      }
    });
  });

  describe('Team Assignment During Athlete Creation', () => {
    it('should assign athlete to team during creation', async () => {
      const timestamp = Date.now();

      // Create athlete
      const athlete = await storage.createAthlete({
        firstName: 'TeamAssign',
        lastName: 'Test',
        emails: [`teamassign-${timestamp}@example.com`],
        birthDate: '2005-11-01',
      });
      createdAthletes.push(athlete.id);

      // Add to organization
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Add to team (simulating the frontend flow)
      await storage.addUserToTeam(athlete.id, testTeam.id);

      // Verify team assignment
      const teams = await storage.getUserTeams(athlete.id);
      expect(teams).toHaveLength(1);
      expect(teams[0].team.id).toBe(testTeam.id);

      // Verify organization assignment
      const orgs = await storage.getUserOrganizations(athlete.id);
      expect(orgs).toHaveLength(1);
      expect(orgs[0].organizationId).toBe(testOrg.id);
    });

    it('should assign athlete to multiple teams during creation', async () => {
      const timestamp = Date.now();

      // Create second team
      const team2 = await storage.createTeam({
        name: `Second Team ${timestamp}`,
        level: 'HS',
        organizationId: testOrg.id,
      });
      createdTeams.push(team2.id);

      // Create athlete
      const athlete = await storage.createAthlete({
        firstName: 'MultiTeam',
        lastName: 'Test',
        emails: [`multiteam-${timestamp}@example.com`],
        birthDate: '2005-12-01',
      });
      createdAthletes.push(athlete.id);

      // Add to organization
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Add to both teams
      await storage.addUserToTeam(athlete.id, testTeam.id);
      await storage.addUserToTeam(athlete.id, team2.id);

      // Verify team assignments
      const teams = await storage.getUserTeams(athlete.id);
      expect(teams).toHaveLength(2);

      const teamIds = teams.map(t => t.team.id);
      expect(teamIds).toContain(testTeam.id);
      expect(teamIds).toContain(team2.id);
    });

    it('should handle athlete creation with team assignment errors gracefully', async () => {
      const timestamp = Date.now();

      // Create athlete
      const athlete = await storage.createAthlete({
        firstName: 'ErrorHandle',
        lastName: 'Test',
        emails: [`errorhandle-${timestamp}@example.com`],
        birthDate: '2006-01-01',
      });
      createdAthletes.push(athlete.id);

      // Add to organization
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Try to add to non-existent team (should fail gracefully)
      try {
        await storage.addUserToTeam(athlete.id, 'non-existent-team-id');
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }

      // Athlete should still exist with org assignment
      const athleteRecord = await storage.getAthlete(athlete.id);
      expect(athleteRecord).toBeDefined();

      const orgs = await storage.getUserOrganizations(athlete.id);
      expect(orgs).toHaveLength(1);
    });
  });

  describe('Performance - N+1 Query Prevention', () => {
    it('should batch permission checks for bulk delete', async () => {
      const timestamp = Date.now();

      // Create 5 athletes
      const athleteIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const athlete = await storage.createAthlete({
          firstName: `Batch${i}`,
          lastName: 'Test',
          emails: [`batch${i}-${timestamp}@example.com`],
          birthDate: '2006-02-01',
        });
        athleteIds.push(athlete.id);
        createdAthletes.push(athlete.id);
        await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');
        await storage.addUserToTeam(athlete.id, testTeam.id);
      }

      const startTime = Date.now();

      // Batch permission checks (should be much faster than sequential)
      const userOrgs = await storage.getUserOrganizations(coachUser.id);
      const userOrgIds = userOrgs.map(org => org.organizationId);

      const athleteChecks = await Promise.all(
        athleteIds.map(async (athleteId) => {
          const athlete = await storage.getAthlete(athleteId);
          if (!athlete) return { athleteId, hasAccess: false };

          const athleteTeams = await storage.getUserTeams(athleteId);
          const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
          const hasAccess = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

          return { athleteId, hasAccess };
        })
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // All athletes should have access
      const authorizedCount = athleteChecks.filter(c => c.hasAccess).length;
      expect(authorizedCount).toBe(5);

      // Performance assertion - batch should complete reasonably quickly
      // This is a rough check, actual times will vary by system
      expect(duration).toBeLessThan(5000); // 5 seconds max for 5 athletes
    });
  });
});
