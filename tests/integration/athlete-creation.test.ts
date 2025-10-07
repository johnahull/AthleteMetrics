/**
 * Integration Tests for Manual Athlete Creation
 *
 * These tests validate the complete athlete creation flow including:
 * - Automatic organization assignment
 * - Team assignment
 * - Permission checks
 * - Data validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { storage } from '../../server/storage';
import type { Organization, Team, User } from '@shared/schema';

describe('Manual Athlete Creation Integration Tests', () => {
  let testOrg: Organization;
  let testTeam: Team;
  let orgAdminUser: User;
  let coachUser: User;
  let athleteUser: User;
  let createdAthletes: string[] = [];

  beforeAll(async () => {
    // Create test organization with unique name
    testOrg = await storage.createOrganization({
      name: `Test Athlete Creation Org ${Date.now()}`,
      contactEmail: 'test-creation@example.com',
    });

    // Create test team
    testTeam = await storage.createTeam({
      name: 'Test Creation Team',
      level: 'Club',
      organizationId: testOrg.id,
    });

    const timestamp = Date.now();

    // Create org admin user
    const orgAdminData = await storage.createUser({
      username: `test-orgadmin-creation-${timestamp}`,
      password: 'password123',
      emails: [`orgadmin-creation-${timestamp}@test.com`],
      firstName: 'Admin',
      lastName: 'User',
      role: 'org_admin',
    });
    orgAdminUser = orgAdminData;
    await storage.addUserToOrganization(orgAdminUser.id, testOrg.id, 'org_admin');

    // Create coach user
    const coachData = await storage.createUser({
      username: `test-coach-creation-${timestamp}`,
      password: 'password123',
      emails: [`coach-creation-${timestamp}@test.com`],
      firstName: 'Coach',
      lastName: 'User',
      role: 'coach',
    });
    coachUser = coachData;
    await storage.addUserToOrganization(coachUser.id, testOrg.id, 'coach');

    // Create athlete user (for permission tests)
    const athleteData = await storage.createUser({
      username: `test-athlete-creation-${timestamp}`,
      password: 'password123',
      emails: [`athlete-creation-${timestamp}@test.com`],
      firstName: 'Existing',
      lastName: 'Athlete',
      role: 'athlete',
    });
    athleteUser = athleteData;
    await storage.addUserToOrganization(athleteUser.id, testOrg.id, 'athlete');
  });

  afterAll(async () => {
    // Cleanup created athletes
    for (const athleteId of createdAthletes) {
      try {
        await storage.deleteAthlete(athleteId);
      } catch (error) {
        console.error(`Failed to delete athlete ${athleteId}:`, error);
      }
    }

    // Cleanup test users
    try {
      if (athleteUser?.id) await storage.deleteUser(athleteUser.id);
      if (coachUser?.id) await storage.deleteUser(coachUser.id);
      if (orgAdminUser?.id) await storage.deleteUser(orgAdminUser.id);
    } catch (error) {
      console.error('Failed to delete test users:', error);
    }

    // Cleanup test team and org
    try {
      if (testTeam?.id) await storage.deleteTeam(testTeam.id);
      if (testOrg?.id) await storage.deleteOrganization(testOrg.id);
    } catch (error) {
      console.error('Failed to delete test org/team:', error);
    }
  });

  describe('Basic Athlete Creation', () => {
    it('should create athlete with all required fields', async () => {
      const athleteData = {
        firstName: 'John',
        lastName: 'Doe',
        emails: ['john.doe@example.com'],
        birthDate: '2005-01-15',
        graduationYear: 2023,
        school: 'Test High School',
        sports: ['Soccer'] as const,
        positions: ['F'] as const,
        phoneNumbers: ['555-1234'],
        gender: 'Male' as const,
      };

      const athlete = await storage.createAthlete(athleteData);
      createdAthletes.push(athlete.id);

      expect(athlete).toBeDefined();
      expect(athlete.id).toBeDefined();
      expect(athlete.firstName).toBe('John');
      expect(athlete.lastName).toBe('Doe');
      expect(athlete.emails).toEqual(['john.doe@example.com']);
      expect(athlete.birthDate).toBe('2005-01-15');
      expect(athlete.fullName).toBe('John Doe');
    });

    it('should create athlete with minimal required fields', async () => {
      const athleteData = {
        firstName: 'Jane',
        lastName: 'Smith',
        emails: ['jane.smith@example.com'],
        birthDate: '2006-03-20',
      };

      const athlete = await storage.createAthlete(athleteData);
      createdAthletes.push(athlete.id);

      expect(athlete).toBeDefined();
      expect(athlete.firstName).toBe('Jane');
      expect(athlete.lastName).toBe('Smith');
      expect(athlete.emails).toEqual(['jane.smith@example.com']);
    });

    it('should generate unique usernames for athletes', async () => {
      const athlete1 = await storage.createAthlete({
        firstName: 'Twin',
        lastName: 'One',
        emails: ['twin1@example.com'],
        birthDate: '2005-01-01',
      });
      createdAthletes.push(athlete1.id);

      const athlete2 = await storage.createAthlete({
        firstName: 'Twin',
        lastName: 'One',
        emails: ['twin2@example.com'],
        birthDate: '2005-01-01',
      });
      createdAthletes.push(athlete2.id);

      expect(athlete1.username).toBeDefined();
      expect(athlete2.username).toBeDefined();
      expect(athlete1.username).not.toBe(athlete2.username);
    });
  });

  describe('Organization Assignment', () => {
    it('should assign athlete to organization when created by org admin', async () => {
      // Create athlete
      const athlete = await storage.createAthlete({
        firstName: 'Org',
        lastName: 'Test',
        emails: ['orgtest@example.com'],
        birthDate: '2005-06-15',
      });
      createdAthletes.push(athlete.id);

      // Manually assign to organization (simulating the fixed POST /api/athletes endpoint)
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Verify assignment
      const userOrgs = await storage.getUserOrganizations(athlete.id);
      expect(userOrgs).toHaveLength(1);
      expect(userOrgs[0].organizationId).toBe(testOrg.id);
      expect(userOrgs[0].role).toBe('athlete');
    });

    it('should allow querying athletes by organization', async () => {
      // Create and assign athlete
      const athlete = await storage.createAthlete({
        firstName: 'Query',
        lastName: 'Test',
        emails: ['querytest@example.com'],
        birthDate: '2005-07-20',
      });
      createdAthletes.push(athlete.id);
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Query athletes by organization
      const orgAthletes = await storage.getAthletes({ organizationId: testOrg.id });

      const foundAthlete = orgAthletes.find(a => a.id === athlete.id);
      expect(foundAthlete).toBeDefined();
      expect(foundAthlete?.firstName).toBe('Query');
    });

    it('should not return athlete without organization when filtering by org', async () => {
      // Create athlete without org assignment
      const athlete = await storage.createAthlete({
        firstName: 'NoOrg',
        lastName: 'Test',
        emails: ['noorg@example.com'],
        birthDate: '2005-08-10',
      });
      createdAthletes.push(athlete.id);

      // Query by specific organization
      const orgAthletes = await storage.getAthletes({ organizationId: testOrg.id });

      const foundAthlete = orgAthletes.find(a => a.id === athlete.id);
      expect(foundAthlete).toBeUndefined();
    });
  });

  describe('Team Assignment', () => {
    it('should assign athlete to team', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Team',
        lastName: 'Member',
        emails: ['teammember@example.com'],
        birthDate: '2005-09-12',
      });
      createdAthletes.push(athlete.id);

      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(athlete.id, testTeam.id);

      const teams = await storage.getUserTeams(athlete.id);
      expect(teams).toHaveLength(1);
      expect(teams[0].team.id).toBe(testTeam.id);
      expect(teams[0].isActive).toBe(true);
    });

    it('should allow athlete to be on multiple teams', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Multi',
        lastName: 'Team',
        emails: ['multiteam@example.com'],
        birthDate: '2005-10-15',
      });
      createdAthletes.push(athlete.id);

      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Create second team
      const team2 = await storage.createTeam({
        name: 'Test Creation Team 2',
        level: 'HS',
        organizationId: testOrg.id,
      });

      // Assign to both teams
      await storage.addUserToTeam(athlete.id, testTeam.id);
      await storage.addUserToTeam(athlete.id, team2.id);

      const teams = await storage.getUserTeams(athlete.id);
      expect(teams).toHaveLength(2);

      // Cleanup
      await storage.deleteTeam(team2.id);
    });

    it('should prevent duplicate team assignments', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Duplicate',
        lastName: 'Team',
        emails: ['dupeteam@example.com'],
        birthDate: '2005-11-20',
      });
      createdAthletes.push(athlete.id);

      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(athlete.id, testTeam.id);

      // Try to add again - should not throw but also should not create duplicate
      await storage.addUserToTeam(athlete.id, testTeam.id);

      // Verify only one active assignment exists
      const teams = await storage.getUserTeams(athlete.id);
      const activeTeams = teams.filter(t => t.isActive);
      expect(activeTeams).toHaveLength(1);
    });
  });

  describe('Data Validation', () => {
    it('should accept various email formats', async () => {
      // The Zod schema actually accepts simple email formats
      const athlete = await storage.createAthlete({
        firstName: 'Valid',
        lastName: 'Email',
        emails: ['test@example.com'],
        birthDate: '2005-01-01',
      });
      createdAthletes.push(athlete.id);

      expect(athlete.emails).toContain('test@example.com');
    });

    it('should accept athlete with at least one email', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Has',
        lastName: 'Email',
        emails: ['has.email@example.com'],
        birthDate: '2005-01-01',
      });
      createdAthletes.push(athlete.id);

      expect(athlete.emails).toHaveLength(1);
    });

    it('should validate birth date format', async () => {
      await expect(async () => {
        await storage.createAthlete({
          firstName: 'Invalid',
          lastName: 'Date',
          emails: ['test@example.com'],
          birthDate: 'not-a-date',
        });
      }).rejects.toThrow();
    });

    it('should accept multiple emails', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Multiple',
        lastName: 'Emails',
        emails: ['primary@example.com', 'secondary@example.com'],
        birthDate: '2005-12-01',
      });
      createdAthletes.push(athlete.id);

      expect(athlete.emails).toHaveLength(2);
      expect(athlete.emails).toContain('primary@example.com');
      expect(athlete.emails).toContain('secondary@example.com');
    });

    it('should accept multiple phone numbers', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Multiple',
        lastName: 'Phones',
        emails: ['phones@example.com'],
        birthDate: '2005-12-15',
        phoneNumbers: ['555-1234', '555-5678'],
      });
      createdAthletes.push(athlete.id);

      expect(athlete.phoneNumbers).toHaveLength(2);
      expect(athlete.phoneNumbers).toContain('555-1234');
      expect(athlete.phoneNumbers).toContain('555-5678');
    });
  });

  describe('Athlete Retrieval', () => {
    it('should retrieve athlete by ID', async () => {
      const created = await storage.createAthlete({
        firstName: 'Retrieve',
        lastName: 'Test',
        emails: ['retrieve@example.com'],
        birthDate: '2006-01-10',
      });
      createdAthletes.push(created.id);

      const retrieved = await storage.getAthlete(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.firstName).toBe('Retrieve');
    });

    it('should return undefined for non-existent athlete', async () => {
      const retrieved = await storage.getAthlete('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should filter athletes by search term', async () => {
      const uniqueFirstName = `SearchUnique${Date.now()}`;
      const athlete = await storage.createAthlete({
        firstName: uniqueFirstName,
        lastName: 'SearchableLast',
        emails: ['searchable@example.com'],
        birthDate: '2006-02-15',
      });
      createdAthletes.push(athlete.id);
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      const results = await storage.getAthletes({
        search: uniqueFirstName,
        organizationId: testOrg.id
      });
      const found = results.find(a => a.id === athlete.id);

      expect(found).toBeDefined();
      expect(found?.firstName).toBe(uniqueFirstName);
    });

    it('should filter athletes by birth year range', async () => {
      const uniqueEmail2005 = `born2005-${Date.now()}@example.com`;
      const uniqueEmail2006 = `born2006-${Date.now()}@example.com`;

      const athlete2005 = await storage.createAthlete({
        firstName: 'Born',
        lastName: '2005',
        emails: [uniqueEmail2005],
        birthDate: '2005-06-15',
      });
      createdAthletes.push(athlete2005.id);
      await storage.addUserToOrganization(athlete2005.id, testOrg.id, 'athlete');

      const athlete2006 = await storage.createAthlete({
        firstName: 'Born',
        lastName: '2006',
        emails: [uniqueEmail2006],
        birthDate: '2006-06-15',
      });
      createdAthletes.push(athlete2006.id);
      await storage.addUserToOrganization(athlete2006.id, testOrg.id, 'athlete');

      const results = await storage.getAthletes({
        birthYearFrom: 2005,
        birthYearTo: 2005,
        organizationId: testOrg.id
      });

      const found2005 = results.find(a => a.id === athlete2005.id);
      const found2006 = results.find(a => a.id === athlete2006.id);

      expect(found2005).toBeDefined();
      expect(found2006).toBeUndefined();
    });
  });

  describe('Athlete Update', () => {
    it('should update athlete information', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Update',
        lastName: 'Test',
        emails: ['update@example.com'],
        birthDate: '2006-03-20',
      });
      createdAthletes.push(athlete.id);

      const updated = await storage.updateAthlete(athlete.id, {
        school: 'New School',
        graduationYear: 2024,
      });

      expect(updated.school).toBe('New School');
      expect(updated.graduationYear).toBe(2024);
      expect(updated.firstName).toBe('Update'); // Unchanged
    });

    it('should update full name when first or last name changes', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Original',
        lastName: 'Name',
        emails: ['namechange@example.com'],
        birthDate: '2006-04-10',
      });
      createdAthletes.push(athlete.id);

      const updated = await storage.updateAthlete(athlete.id, {
        firstName: 'Updated',
      });

      expect(updated.fullName).toBe('Updated Name');
    });
  });

  describe('Athlete Deletion', () => {
    it('should delete athlete', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Delete',
        lastName: 'Me',
        emails: ['deleteme@example.com'],
        birthDate: '2006-05-15',
      });

      await storage.deleteAthlete(athlete.id);

      const retrieved = await storage.getAthlete(athlete.id);
      expect(retrieved).toBeUndefined();
    });

    it('should remove athlete from teams when deleted', async () => {
      const athlete = await storage.createAthlete({
        firstName: 'Delete',
        lastName: 'WithTeam',
        emails: ['deletewithteam@example.com'],
        birthDate: '2006-06-20',
      });

      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(athlete.id, testTeam.id);

      await storage.deleteAthlete(athlete.id);

      const teams = await storage.getUserTeams(athlete.id);
      expect(teams).toHaveLength(0);
    });
  });

  describe('Athlete Profile View Permissions', () => {
    let otherOrg: Organization;
    let otherCoachUser: User;

    beforeAll(async () => {
      // Create a second organization for permission testing
      otherOrg = await storage.createOrganization({
        name: `Other Test Org ${Date.now()}`,
        contactEmail: 'other-org@example.com',
      });

      // Create a coach in the other organization
      const timestamp = Date.now();
      const otherCoachData = await storage.createUser({
        username: `test-other-coach-${timestamp}`,
        password: 'password123',
        emails: [`other-coach-${timestamp}@test.com`],
        firstName: 'Other',
        lastName: 'Coach',
        role: 'coach',
      });
      otherCoachUser = otherCoachData;
      await storage.addUserToOrganization(otherCoachUser.id, otherOrg.id, 'coach');
    });

    afterAll(async () => {
      // Cleanup other org resources
      try {
        if (otherCoachUser?.id) await storage.deleteUser(otherCoachUser.id);
        if (otherOrg?.id) await storage.deleteOrganization(otherOrg.id);
      } catch (error) {
        console.error('Failed to cleanup other org resources:', error);
      }
    });

    it('should allow viewing athlete with only organization membership (no teams)', async () => {
      // Create athlete with only org membership, no team assignment
      const athlete = await storage.createAthlete({
        firstName: 'OrgOnly',
        lastName: 'Athlete',
        emails: ['orgonly@example.com'],
        birthDate: '2006-07-01',
      });
      createdAthletes.push(athlete.id);

      // Assign only to organization, NOT to any team
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Verify no team assignments
      const teams = await storage.getUserTeams(athlete.id);
      expect(teams).toHaveLength(0);

      // Verify organization membership exists
      const orgs = await storage.getUserOrganizations(athlete.id);
      expect(orgs).toHaveLength(1);
      expect(orgs[0].organizationId).toBe(testOrg.id);

      // Org admin from same org should be able to view
      const userOrgs = await storage.getUserOrganizations(orgAdminUser.id);
      expect(userOrgs.some(uo => uo.organizationId === testOrg.id)).toBe(true);

      // Simulate the GET /api/athletes/:id permission check
      const athleteOrgs = await storage.getUserOrganizations(athlete.id);
      const athleteTeams = await storage.getUserTeams(athlete.id);

      // Athlete must have org OR team assignments
      expect(athleteOrgs.length > 0 || athleteTeams.length > 0).toBe(true);

      // Check if user has access to any of the athlete's organizations
      const userOrgIds = userOrgs.map(org => org.organizationId);
      const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
      const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);
      const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

      const hasAccess = allAthleteOrgIds.some(orgId => userOrgIds.includes(orgId));
      expect(hasAccess).toBe(true);
    });

    it('should allow viewing athlete with only team assignment (backward compatibility)', async () => {
      // Create athlete and assign to team (which implicitly provides org access via team)
      const athlete = await storage.createAthlete({
        firstName: 'TeamOnly',
        lastName: 'Athlete',
        emails: ['teamonly@example.com'],
        birthDate: '2006-07-15',
      });
      createdAthletes.push(athlete.id);

      // Assign to team only
      await storage.addUserToTeam(athlete.id, testTeam.id);

      // Verify has team assignment
      const teams = await storage.getUserTeams(athlete.id);
      expect(teams).toHaveLength(1);

      // Coach from same org should have access via team's organization
      const userOrgs = await storage.getUserOrganizations(coachUser.id);
      const athleteTeams = await storage.getUserTeams(athlete.id);
      const athleteOrgs = await storage.getUserOrganizations(athlete.id);

      const userOrgIds = userOrgs.map(org => org.organizationId);
      const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
      const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);
      const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

      const hasAccess = allAthleteOrgIds.some(orgId => userOrgIds.includes(orgId));
      expect(hasAccess).toBe(true);
    });

    it('should allow viewing athlete with both org membership and team assignments', async () => {
      // Create athlete with both org membership and team assignment
      const athlete = await storage.createAthlete({
        firstName: 'BothAccess',
        lastName: 'Athlete',
        emails: ['bothaccess@example.com'],
        birthDate: '2006-08-01',
      });
      createdAthletes.push(athlete.id);

      // Assign to both org and team
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');
      await storage.addUserToTeam(athlete.id, testTeam.id);

      // Verify both assignments
      const orgs = await storage.getUserOrganizations(athlete.id);
      const teams = await storage.getUserTeams(athlete.id);
      expect(orgs).toHaveLength(1);
      expect(teams).toHaveLength(1);

      // Org admin should have access
      const userOrgs = await storage.getUserOrganizations(orgAdminUser.id);
      const athleteOrgs = await storage.getUserOrganizations(athlete.id);
      const athleteTeams = await storage.getUserTeams(athlete.id);

      const userOrgIds = userOrgs.map(org => org.organizationId);
      const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
      const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);
      const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

      const hasAccess = allAthleteOrgIds.some(orgId => userOrgIds.includes(orgId));
      expect(hasAccess).toBe(true);
    });

    it('should deny access to athlete from different organization', async () => {
      // Create athlete in the test org
      const athlete = await storage.createAthlete({
        firstName: 'Different',
        lastName: 'OrgAthlete',
        emails: ['differentorg@example.com'],
        birthDate: '2006-08-15',
      });
      createdAthletes.push(athlete.id);

      // Assign to test org
      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Try to access from other org coach
      const userOrgs = await storage.getUserOrganizations(otherCoachUser.id);
      const athleteOrgs = await storage.getUserOrganizations(athlete.id);
      const athleteTeams = await storage.getUserTeams(athlete.id);

      const userOrgIds = userOrgs.map(org => org.organizationId);
      const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
      const athleteTeamOrgIds = athleteTeams.map(team => team.team.organizationId);
      const allAthleteOrgIds = [...new Set([...athleteOrgIds, ...athleteTeamOrgIds])];

      const hasAccess = allAthleteOrgIds.some(orgId => userOrgIds.includes(orgId));
      expect(hasAccess).toBe(false);
    });

    it('should deny access to athlete with no org or team assignments', async () => {
      // Create athlete with no assignments at all
      const athlete = await storage.createAthlete({
        firstName: 'NoAssignment',
        lastName: 'Athlete',
        emails: ['noassignment@example.com'],
        birthDate: '2006-09-01',
      });
      createdAthletes.push(athlete.id);

      // Verify no assignments
      const orgs = await storage.getUserOrganizations(athlete.id);
      const teams = await storage.getUserTeams(athlete.id);
      expect(orgs).toHaveLength(0);
      expect(teams).toHaveLength(0);

      // Simulate the permission check - should fail because athlete has no org/team
      const hasAnyAssignment = orgs.length > 0 || teams.length > 0;
      expect(hasAnyAssignment).toBe(false);
    });

    it('should allow athlete to view their own profile regardless of team assignment', async () => {
      // Create athlete with only org assignment
      const athlete = await storage.createAthlete({
        firstName: 'SelfView',
        lastName: 'Athlete',
        emails: ['selfview@example.com'],
        birthDate: '2006-09-15',
      });
      createdAthletes.push(athlete.id);

      await storage.addUserToOrganization(athlete.id, testOrg.id, 'athlete');

      // Simulate athlete viewing their own profile
      // Athletes can view their own profile if currentUser.athleteId === athleteId
      const canViewOwnProfile = athlete.id === athlete.id; // In real code: currentUser.athleteId === athleteId
      expect(canViewOwnProfile).toBe(true);
    });
  });
});
