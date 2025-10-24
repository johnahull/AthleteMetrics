import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TeamService } from '../team-service';
import { db } from '../../db';
import { teams, organizations, userTeams, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('TeamService', () => {
  let teamService: TeamService;
  let testOrgId: string;
  let testUserId: string;

  beforeEach(async () => {
    teamService = new TeamService();

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${Date.now()}`,
      description: 'Test organization for team service tests',
    }).returning();
    testOrgId = org.id;

    // Create test user
    const [user] = await db.insert(users).values({
      username: `testuser${Date.now()}`,
      emails: ['test@example.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'User',
      fullName: 'Test User',
    }).returning();
    testUserId = user.id;
  });

  afterEach(async () => {
    // Cleanup: delete test data in reverse dependency order
    if (testOrgId) {
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId));
      await db.delete(teams).where(eq(teams.organizationId, testOrgId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('getTeams', () => {
    it('should return all non-archived teams for an organization', async () => {
      // Create active team
      const [activeTeam] = await db.insert(teams).values({
        name: 'Active Team',
        organizationId: testOrgId,
        level: 'College',
        isArchived: false,
      }).returning();

      // Create archived team (should not be returned)
      await db.insert(teams).values({
        name: 'Archived Team',
        organizationId: testOrgId,
        level: 'College',
        isArchived: true,
        archivedAt: new Date(),
      }).returning();

      const result = await teamService.getTeams(testOrgId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(activeTeam.id);
      expect(result[0].name).toBe('Active Team');
      expect(result[0].organization).toBeDefined();
      expect(result[0].organization.id).toBe(testOrgId);
    });

    it('should return empty array for organization with no teams', async () => {
      const result = await teamService.getTeams(testOrgId);
      expect(result).toEqual([]);
    });

    it('should order teams by name ascending', async () => {
      await db.insert(teams).values([
        { name: 'Zebra Team', organizationId: testOrgId, isArchived: false },
        { name: 'Alpha Team', organizationId: testOrgId, isArchived: false },
        { name: 'Beta Team', organizationId: testOrgId, isArchived: false },
      ]);

      const result = await teamService.getTeams(testOrgId);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Alpha Team');
      expect(result[1].name).toBe('Beta Team');
      expect(result[2].name).toBe('Zebra Team');
    });
  });

  describe('getTeam', () => {
    it('should return a team with organization by ID', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Test Team',
        organizationId: testOrgId,
        level: 'HS',
        notes: 'Test notes',
      }).returning();

      const result = await teamService.getTeam(team.id);

      expect(result).toBeDefined();
      expect(result!.id).toBe(team.id);
      expect(result!.name).toBe('Test Team');
      expect(result!.level).toBe('HS');
      expect(result!.organization).toBeDefined();
      expect(result!.organization.id).toBe(testOrgId);
    });

    it('should return undefined for non-existent team', async () => {
      const result = await teamService.getTeam('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('createTeam', () => {
    it('should create a new team', async () => {
      const teamData = {
        name: 'New Team',
        organizationId: testOrgId,
        level: 'Club',
        notes: 'Created via service',
      };

      const result = await teamService.createTeam(teamData);

      expect(result).toBeDefined();
      expect(result.name).toBe('New Team');
      expect(result.organizationId).toBe(testOrgId);
      expect(result.level).toBe('Club');
      expect(result.notes).toBe('Created via service');
      expect(result.isArchived).toBe(false);
    });

    it('should handle null optional fields', async () => {
      const teamData = {
        name: 'Minimal Team',
        organizationId: testOrgId,
      };

      const result = await teamService.createTeam(teamData);

      expect(result).toBeDefined();
      expect(result.name).toBe('Minimal Team');
      expect(result.level).toBeNull();
      expect(result.notes).toBeNull();
    });
  });

  describe('updateTeam', () => {
    it('should update team fields', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Original Name',
        organizationId: testOrgId,
        level: 'Club',
      }).returning();

      const result = await teamService.updateTeam(team.id, {
        name: 'Updated Name',
        level: 'College',
        notes: 'New notes',
      });

      expect(result.name).toBe('Updated Name');
      expect(result.level).toBe('College');
      expect(result.notes).toBe('New notes');
    });

    it('should strip organizationId from updates (security)', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Security Test',
        organizationId: testOrgId,
      }).returning();

      // Create another org to attempt unauthorized transfer
      const [otherOrg] = await db.insert(organizations).values({
        name: 'Other Org',
      }).returning();

      const result = await teamService.updateTeam(team.id, {
        name: 'Updated',
        organizationId: otherOrg.id, // This should be stripped
      } as any);

      expect(result.name).toBe('Updated');
      expect(result.organizationId).toBe(testOrgId); // Should remain unchanged

      // Cleanup
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
    });

    it('should trim whitespace from name', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Original',
        organizationId: testOrgId,
      }).returning();

      const result = await teamService.updateTeam(team.id, {
        name: '  Trimmed Name  ',
      });

      expect(result.name).toBe('Trimmed Name');
    });

    it('should throw error if no valid fields to update', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Test',
        organizationId: testOrgId,
      }).returning();

      await expect(
        teamService.updateTeam(team.id, { organizationId: 'some-id' } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('should throw error if team not found', async () => {
      await expect(
        teamService.updateTeam('non-existent-id', { name: 'Update' })
      ).rejects.toThrow('Team not found');
    });
  });

  describe('deleteTeam', () => {
    it('should delete a team and all memberships', async () => {
      const [team] = await db.insert(teams).values({
        name: 'To Delete',
        organizationId: testOrgId,
      }).returning();

      // Add user to team
      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
      });

      await teamService.deleteTeam(team.id);

      // Verify team is deleted
      const teamCheck = await db.select().from(teams).where(eq(teams.id, team.id));
      expect(teamCheck).toHaveLength(0);

      // Verify memberships are deleted
      const membershipCheck = await db.select().from(userTeams)
        .where(eq(userTeams.teamId, team.id));
      expect(membershipCheck).toHaveLength(0);
    });
  });

  describe('archiveTeam', () => {
    it('should archive a team and mark memberships inactive', async () => {
      const [team] = await db.insert(teams).values({
        name: 'To Archive',
        organizationId: testOrgId,
      }).returning();

      // Add active user to team
      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: true,
      });

      const archiveDate = new Date('2024-12-31');
      const season = '2024-Fall';

      const result = await teamService.archiveTeam(team.id, archiveDate, season);

      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toEqual(archiveDate);
      expect(result.season).toBe(season);

      // Verify membership is now inactive
      const [membership] = await db.select().from(userTeams)
        .where(eq(userTeams.teamId, team.id));

      expect(membership.isActive).toBe(false);
      expect(membership.leftAt).toEqual(archiveDate);
      expect(membership.season).toBe(season);
    });

    it('should only affect active memberships', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Archive Test',
        organizationId: testOrgId,
      }).returning();

      // Add inactive membership
      const leftDate = new Date('2024-01-01');
      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: false,
        leftAt: leftDate,
        season: '2023-Fall',
      });

      const archiveDate = new Date('2024-12-31');
      await teamService.archiveTeam(team.id, archiveDate, '2024-Fall');

      // Verify inactive membership unchanged
      const [membership] = await db.select().from(userTeams)
        .where(eq(userTeams.teamId, team.id));

      expect(membership.leftAt).toEqual(leftDate);
      expect(membership.season).toBe('2023-Fall');
    });
  });

  describe('unarchiveTeam', () => {
    it('should unarchive a team', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Archived Team',
        organizationId: testOrgId,
        isArchived: true,
        archivedAt: new Date(),
        season: '2023-Fall',
      }).returning();

      const result = await teamService.unarchiveTeam(team.id);

      expect(result.isArchived).toBe(false);
      expect(result.archivedAt).toBeNull();
      // Season should remain as historical record
      expect(result.season).toBe('2023-Fall');
    });

    it('should not reactivate team memberships', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Archived Team',
        organizationId: testOrgId,
        isArchived: true,
        archivedAt: new Date(),
      }).returning();

      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: false,
        leftAt: new Date(),
      });

      await teamService.unarchiveTeam(team.id);

      // Membership should still be inactive
      const [membership] = await db.select().from(userTeams)
        .where(eq(userTeams.teamId, team.id));

      expect(membership.isActive).toBe(false);
    });
  });

  describe('updateTeamMembership', () => {
    it('should update membership leftAt and season', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Membership Test',
        organizationId: testOrgId,
      }).returning();

      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: true,
      });

      const leftDate = new Date('2024-06-01');
      const result = await teamService.updateTeamMembership(
        team.id,
        testUserId,
        { leftAt: leftDate, season: '2024-Spring' }
      );

      expect(result.leftAt).toEqual(leftDate);
      expect(result.season).toBe('2024-Spring');
      expect(result.isActive).toBe(false);
    });

    it('should reactivate membership when leftAt is null', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Reactivation Test',
        organizationId: testOrgId,
      }).returning();

      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: false,
        leftAt: new Date(),
      });

      const result = await teamService.updateTeamMembership(
        team.id,
        testUserId,
        { leftAt: undefined }
      );

      expect(result.isActive).toBe(true);
      expect(result.leftAt).toBeUndefined();
    });
  });

  describe('addUserToTeam', () => {
    it('should add a user to a team', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Add User Test',
        organizationId: testOrgId,
      }).returning();

      const result = await teamService.addUserToTeam(testUserId, team.id);

      expect(result.userId).toBe(testUserId);
      expect(result.teamId).toBe(team.id);
      expect(result.isActive).toBe(true);
      expect(result.leftAt).toBeNull();
    });

    it('should return existing active membership', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Existing Member Test',
        organizationId: testOrgId,
      }).returning();

      const [existing] = await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: true,
      }).returning();

      const result = await teamService.addUserToTeam(testUserId, team.id);

      expect(result.id).toBe(existing.id);
    });

    it('should reactivate inactive membership', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Reactivation Test',
        organizationId: testOrgId,
      }).returning();

      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: false,
        leftAt: new Date('2024-01-01'),
      });

      const result = await teamService.addUserToTeam(testUserId, team.id);

      expect(result.isActive).toBe(true);
      expect(result.leftAt).toBeNull();
    });

    it('should create new membership if only historical exists', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Historical Test',
        organizationId: testOrgId,
      }).returning();

      const [historical] = await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: false,
        leftAt: new Date('2023-01-01'),
      }).returning();

      const result = await teamService.addUserToTeam(testUserId, team.id);

      expect(result.id).not.toBe(historical.id);
      expect(result.isActive).toBe(true);
    });
  });

  describe('removeUserFromTeam', () => {
    it('should mark membership as inactive', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Remove User Test',
        organizationId: testOrgId,
      }).returning();

      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: true,
      });

      await teamService.removeUserFromTeam(testUserId, team.id);

      const [membership] = await db.select().from(userTeams)
        .where(eq(userTeams.teamId, team.id));

      expect(membership.isActive).toBe(false);
      expect(membership.leftAt).toBeDefined();
      expect(membership.leftAt!.getTime()).toBeCloseTo(Date.now(), -2); // Within 2 digits (100ms)
    });

    it('should only affect active memberships', async () => {
      const [team] = await db.insert(teams).values({
        name: 'Already Inactive Test',
        organizationId: testOrgId,
      }).returning();

      const leftDate = new Date('2024-01-01');
      await db.insert(userTeams).values({
        userId: testUserId,
        teamId: team.id,
        isActive: false,
        leftAt: leftDate,
      });

      await teamService.removeUserFromTeam(testUserId, team.id);

      const [membership] = await db.select().from(userTeams)
        .where(eq(userTeams.teamId, team.id));

      expect(membership.leftAt).toEqual(leftDate);
    });
  });
});
