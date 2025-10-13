/**
 * Integration Tests for Organization Deletion and Deactivation
 *
 * Tests for soft delete (deactivation) and hard delete functionality for organizations.
 * Validates permission checks, dependency validation, and audit logging.
 *
 * NOTE: Requires DATABASE_URL environment variable to be set to a PostgreSQL connection string
 */

// Set environment variables before any imports (DATABASE_URL must be provided externally)
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../../server/storage';
import { OrganizationService } from '../../server/services/organization-service';
import type { Organization, User, Team } from '@shared/schema';

describe('Organization Deletion and Deactivation', () => {
  let testOrg: Organization;
  let siteAdminUser: User;
  let orgAdminUser: User;
  let coachUser: User;
  let athleteUser: User;
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

    // Create test organization
    testOrg = await storage.createOrganization({
      name: `Test Deletion Org ${timestamp}`,
      description: 'Test organization for deletion tests',
    });

    // Create site admin user
    const siteAdminData = await storage.createUser({
      username: `test-siteadmin-del-${timestamp}`,
      password: 'TestPass123!',
      emails: [`siteadmin-del-${timestamp}@test.com`],
      firstName: 'Site',
      lastName: 'Admin',
      isSiteAdmin: true,
    });
    siteAdminUser = siteAdminData;

    // Create org admin user
    const orgAdminData = await storage.createUser({
      username: `test-orgadmin-del-${timestamp}`,
      password: 'TestPass123!',
      emails: [`orgadmin-del-${timestamp}@test.com`],
      firstName: 'Org',
      lastName: 'Admin',
    });
    orgAdminUser = orgAdminData;
    await storage.addUserToOrganization(orgAdminUser.id, testOrg.id, 'org_admin');

    // Create coach user
    const coachData = await storage.createUser({
      username: `test-coach-del-${timestamp}`,
      password: 'TestPass123!',
      emails: [`coach-del-${timestamp}@test.com`],
      firstName: 'Coach',
      lastName: 'User',
    });
    coachUser = coachData;
    await storage.addUserToOrganization(coachUser.id, testOrg.id, 'coach');

    // Create athlete user
    const athleteData = await storage.createUser({
      username: `test-athlete-del-${timestamp}`,
      password: 'TestPass123!',
      emails: [`athlete-del-${timestamp}@test.com`],
      firstName: 'Athlete',
      lastName: 'User',
    });
    athleteUser = athleteData;
    await storage.addUserToOrganization(athleteUser.id, testOrg.id, 'athlete');
  });

  afterAll(async () => {
    // Cleanup
    try {
      // Remove users from organization first
      await storage.removeUserFromOrganization(athleteUser.id, testOrg.id);
      await storage.removeUserFromOrganization(coachUser.id, testOrg.id);
      await storage.removeUserFromOrganization(orgAdminUser.id, testOrg.id);

      // Delete users
      await storage.deleteUser(athleteUser.id);
      await storage.deleteUser(coachUser.id);
      await storage.deleteUser(orgAdminUser.id);
      await storage.deleteUser(siteAdminUser.id);

      // Delete organization (hard delete to cleanup)
      await storage.deleteOrganization(testOrg.id);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Organization Deactivation (Soft Delete)', () => {
    it('should allow site admin to deactivate an organization', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Deactivate Test Org ${timestamp}`,
        description: 'Test org for deactivation',
      });

      // Deactivate organization
      await organizationService.deactivateOrganization(org.id, siteAdminUser.id);

      // Verify organization is deactivated
      const deactivatedOrg = await storage.getOrganization(org.id);
      expect(deactivatedOrg?.isActive).toBe(false);

      // Cleanup
      await storage.deleteOrganization(org.id);
    });

    it('should allow site admin to reactivate an organization', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Reactivate Test Org ${timestamp}`,
        description: 'Test org for reactivation',
      });

      // Deactivate first
      await organizationService.deactivateOrganization(org.id, siteAdminUser.id);
      let updatedOrg = await storage.getOrganization(org.id);
      expect(updatedOrg?.isActive).toBe(false);

      // Reactivate
      await organizationService.reactivateOrganization(org.id, siteAdminUser.id);
      updatedOrg = await storage.getOrganization(org.id);
      expect(updatedOrg?.isActive).toBe(true);

      // Cleanup
      await storage.deleteOrganization(org.id);
    });

    it('should exclude deactivated organizations from getAllOrganizations by default', async () => {
      const timestamp = Date.now();
      const activeOrg = await storage.createOrganization({
        name: `Active Org ${timestamp}`,
        description: 'Active test org',
      });

      const inactiveOrg = await storage.createOrganization({
        name: `Inactive Org ${timestamp}`,
        description: 'Inactive test org',
      });

      // Deactivate second org
      await organizationService.deactivateOrganization(inactiveOrg.id, siteAdminUser.id);

      // Get organizations (should exclude inactive by default)
      const orgs = await storage.getOrganizations();
      const foundActive = orgs.find(o => o.id === activeOrg.id);
      const foundInactive = orgs.find(o => o.id === inactiveOrg.id);

      expect(foundActive).toBeDefined();
      expect(foundInactive).toBeUndefined();

      // Cleanup
      await storage.deleteOrganization(activeOrg.id);
      await storage.deleteOrganization(inactiveOrg.id);
    });

    it('should include deactivated organizations when includeInactive is true', async () => {
      const timestamp = Date.now();
      const inactiveOrg = await storage.createOrganization({
        name: `Include Inactive Org ${timestamp}`,
        description: 'Test inactive org',
      });

      // Deactivate org
      await organizationService.deactivateOrganization(inactiveOrg.id, siteAdminUser.id);

      // Get organizations including inactive
      const orgs = await storage.getOrganizations({ includeInactive: true });
      const foundInactive = orgs.find(o => o.id === inactiveOrg.id);

      expect(foundInactive).toBeDefined();
      expect(foundInactive?.isActive).toBe(false);

      // Cleanup
      await storage.deleteOrganization(inactiveOrg.id);
    });

    it('should prevent non-site-admin users from deactivating organizations', async () => {
      await expect(async () => {
        await organizationService.deactivateOrganization(testOrg.id, orgAdminUser.id);
      }).rejects.toThrow(/Only site administrators/i);
    });

    it('should prevent coaches from deactivating organizations', async () => {
      await expect(async () => {
        await organizationService.deactivateOrganization(testOrg.id, coachUser.id);
      }).rejects.toThrow(/Only site administrators/i);
    });

    it('should prevent athletes from deactivating organizations', async () => {
      await expect(async () => {
        await organizationService.deactivateOrganization(testOrg.id, athleteUser.id);
      }).rejects.toThrow(/Only site administrators/i);
    });

    it('should NOT delete users/teams/measurements when deactivating', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Preserve Data Org ${timestamp}`,
        description: 'Test data preservation',
      });

      // Create user in organization
      const user = await storage.createUser({
        username: `preserve-user-${timestamp}`,
        password: 'TestPass123!',
        emails: [`preserve-${timestamp}@test.com`],
        firstName: 'Preserve',
        lastName: 'User',
      });
      await storage.addUserToOrganization(user.id, org.id, 'athlete');

      // Create team
      const team = await storage.createTeam({
        name: 'Preserve Team',
        organizationId: org.id,
        level: 'Club',
      });

      // Deactivate organization
      await organizationService.deactivateOrganization(org.id, siteAdminUser.id);

      // Verify data still exists
      const stillExistsUser = await storage.getUser(user.id);
      const stillExistsTeam = await storage.getTeam(team.id);

      expect(stillExistsUser).toBeDefined();
      expect(stillExistsTeam).toBeDefined();

      // Cleanup
      await storage.removeUserFromOrganization(user.id, org.id);
      await storage.deleteUser(user.id);
      await storage.deleteTeam(team.id);
      await storage.deleteOrganization(org.id);
    });

    it('should create audit log entry when deactivating organization', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Audit Deactivate Org ${timestamp}`,
        description: 'Test audit logging',
      });

      // Deactivate organization
      await organizationService.deactivateOrganization(org.id, siteAdminUser.id);

      // Check audit logs
      const auditLogs = await storage.getAuditLogs({
        userId: siteAdminUser.id,
        action: 'organization_deactivated',
      });

      const relevantLog = auditLogs.find(log =>
        log.resourceId === org.id &&
        log.resourceType === 'organization'
      );

      expect(relevantLog).toBeDefined();
      expect(relevantLog?.action).toBe('organization_deactivated');

      // Cleanup
      await storage.deleteOrganization(org.id);
    });

    it('should create audit log entry when reactivating organization', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Audit Reactivate Org ${timestamp}`,
        description: 'Test audit logging',
      });

      // Deactivate then reactivate
      await organizationService.deactivateOrganization(org.id, siteAdminUser.id);
      await organizationService.reactivateOrganization(org.id, siteAdminUser.id);

      // Check audit logs
      const auditLogs = await storage.getAuditLogs({
        userId: siteAdminUser.id,
        action: 'organization_reactivated',
      });

      const relevantLog = auditLogs.find(log =>
        log.resourceId === org.id &&
        log.resourceType === 'organization'
      );

      expect(relevantLog).toBeDefined();
      expect(relevantLog?.action).toBe('organization_reactivated');

      // Cleanup
      await storage.deleteOrganization(org.id);
    });
  });

  describe('Organization Hard Delete', () => {
    it('should allow site admin to delete organization with no dependencies', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Delete Empty Org ${timestamp}`,
        description: 'Empty org for deletion',
      });

      // Delete organization with confirmation
      await organizationService.deleteOrganization(
        org.id,
        `Delete Empty Org ${timestamp}`,
        siteAdminUser.id
      );

      // Verify organization is deleted
      const deletedOrg = await storage.getOrganization(org.id);
      expect(deletedOrg).toBeUndefined();
    });

    it('should require exact name confirmation for deletion', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Confirm Name Org ${timestamp}`,
        description: 'Test name confirmation',
      });

      // Try to delete with wrong confirmation name
      await expect(async () => {
        await organizationService.deleteOrganization(
          org.id,
          'Wrong Name',
          siteAdminUser.id
        );
      }).rejects.toThrow(/Organization name confirmation does not match/i);

      // Verify organization still exists
      const stillExists = await storage.getOrganization(org.id);
      expect(stillExists).toBeDefined();

      // Cleanup
      await storage.deleteOrganization(org.id);
    });

    it('should prevent deletion when organization has active users', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Has Users Org ${timestamp}`,
        description: 'Org with users',
      });

      // Add user to organization
      const user = await storage.createUser({
        username: `block-user-${timestamp}`,
        password: 'TestPass123!',
        emails: [`block-user-${timestamp}@test.com`],
        firstName: 'Block',
        lastName: 'User',
      });
      await storage.addUserToOrganization(user.id, org.id, 'athlete');

      // Try to delete organization
      await expect(async () => {
        await organizationService.deleteOrganization(
          org.id,
          `Has Users Org ${timestamp}`,
          siteAdminUser.id
        );
      }).rejects.toThrow(/Cannot delete organization with active dependencies.*users/i);

      // Cleanup
      await storage.removeUserFromOrganization(user.id, org.id);
      await storage.deleteUser(user.id);
      await storage.deleteOrganization(org.id);
    });

    it('should prevent deletion when organization has teams', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Has Teams Org ${timestamp}`,
        description: 'Org with teams',
      });

      // Create team in organization
      const team = await storage.createTeam({
        name: 'Block Team',
        organizationId: org.id,
        level: 'Club',
      });

      // Try to delete organization
      await expect(async () => {
        await organizationService.deleteOrganization(
          org.id,
          `Has Teams Org ${timestamp}`,
          siteAdminUser.id
        );
      }).rejects.toThrow(/Cannot delete organization with active dependencies.*teams/i);

      // Cleanup
      await storage.deleteTeam(team.id);
      await storage.deleteOrganization(org.id);
    });

    it('should prevent deletion when organization has measurements', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Has Measurements Org ${timestamp}`,
        description: 'Org with measurements',
      });

      // Create user and add to organization
      const user = await storage.createUser({
        username: `meas-user-${timestamp}`,
        password: 'TestPass123!',
        emails: [`meas-user-${timestamp}@test.com`],
        firstName: 'Measurement',
        lastName: 'User',
        birthDate: '2005-01-01',
      });
      await storage.addUserToOrganization(user.id, org.id, 'athlete');

      // Create measurement for user
      const measurement = await storage.createMeasurement({
        userId: user.id,
        date: '2024-01-15',
        metric: 'VERTICAL_JUMP',
        value: 30,
      }, user.id);

      // Try to delete organization
      await expect(async () => {
        await organizationService.deleteOrganization(
          org.id,
          `Has Measurements Org ${timestamp}`,
          siteAdminUser.id
        );
      }).rejects.toThrow(/Cannot delete organization with active dependencies.*measurements/i);

      // Cleanup
      await storage.deleteMeasurement(measurement.id);
      await storage.removeUserFromOrganization(user.id, org.id);
      await storage.deleteUser(user.id);
      await storage.deleteOrganization(org.id);
    });

    it('should return detailed dependency counts in error message', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Dependency Counts Org ${timestamp}`,
        description: 'Test dependency counts',
      });

      // Add 2 users
      const user1 = await storage.createUser({
        username: `dep-user1-${timestamp}`,
        password: 'TestPass123!',
        emails: [`dep-user1-${timestamp}@test.com`],
        firstName: 'Dep',
        lastName: 'User1',
      });
      await storage.addUserToOrganization(user1.id, org.id, 'athlete');

      const user2 = await storage.createUser({
        username: `dep-user2-${timestamp}`,
        password: 'TestPass123!',
        emails: [`dep-user2-${timestamp}@test.com`],
        firstName: 'Dep',
        lastName: 'User2',
      });
      await storage.addUserToOrganization(user2.id, org.id, 'coach');

      // Add 1 team
      const team = await storage.createTeam({
        name: 'Dep Team',
        organizationId: org.id,
        level: 'Club',
      });

      // Try to delete and check error message includes counts
      try {
        await organizationService.deleteOrganization(
          org.id,
          `Dependency Counts Org ${timestamp}`,
          siteAdminUser.id
        );
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Check that error mentions dependencies
        expect(error.message).toMatch(/Cannot delete organization/i);
        expect(error.message).toMatch(/users/i);
        expect(error.message).toMatch(/teams/i);
      }

      // Cleanup
      await storage.removeUserFromOrganization(user1.id, org.id);
      await storage.removeUserFromOrganization(user2.id, org.id);
      await storage.deleteUser(user1.id);
      await storage.deleteUser(user2.id);
      await storage.deleteTeam(team.id);
      await storage.deleteOrganization(org.id);
    });

    it('should prevent non-site-admin users from deleting organizations', async () => {
      await expect(async () => {
        await organizationService.deleteOrganization(
          testOrg.id,
          testOrg.name,
          orgAdminUser.id
        );
      }).rejects.toThrow(/Only site administrators/i);
    });

    it('should prevent coaches from deleting organizations', async () => {
      await expect(async () => {
        await organizationService.deleteOrganization(
          testOrg.id,
          testOrg.name,
          coachUser.id
        );
      }).rejects.toThrow(/Only site administrators/i);
    });

    it('should prevent athletes from deleting organizations', async () => {
      await expect(async () => {
        await organizationService.deleteOrganization(
          testOrg.id,
          testOrg.name,
          athleteUser.id
        );
      }).rejects.toThrow(/Only site administrators/i);
    });

    it('should create audit log entry when deleting organization', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Audit Delete Org ${timestamp}`,
        description: 'Test audit logging',
      });

      // Delete organization
      await organizationService.deleteOrganization(
        org.id,
        `Audit Delete Org ${timestamp}`,
        siteAdminUser.id
      );

      // Check audit logs
      const auditLogs = await storage.getAuditLogs({
        userId: siteAdminUser.id,
        action: 'organization_deleted',
      });

      const relevantLog = auditLogs.find(log =>
        log.resourceId === org.id &&
        log.resourceType === 'organization'
      );

      expect(relevantLog).toBeDefined();
      expect(relevantLog?.action).toBe('organization_deleted');
    });
  });

  describe('Get Organization Dependency Counts', () => {
    it('should return correct dependency counts for organization', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Count Test Org ${timestamp}`,
        description: 'Test dependency counts',
      });

      // Add dependencies
      const user1 = await storage.createUser({
        username: `count-user1-${timestamp}`,
        password: 'TestPass123!',
        emails: [`count-user1-${timestamp}@test.com`],
        firstName: 'Count',
        lastName: 'User1',
        birthDate: '2005-01-01',
      });
      await storage.addUserToOrganization(user1.id, org.id, 'athlete');

      const team = await storage.createTeam({
        name: 'Count Team',
        organizationId: org.id,
        level: 'Club',
      });

      const measurement = await storage.createMeasurement({
        userId: user1.id,
        date: '2024-01-15',
        metric: 'VERTICAL_JUMP',
        value: 30,
      }, user1.id);

      // Get dependency counts
      const counts = await organizationService.getOrganizationDependencyCounts(
        org.id,
        siteAdminUser.id
      );

      expect(counts.users).toBe(1);
      expect(counts.teams).toBe(1);
      expect(counts.measurements).toBeGreaterThan(0);

      // Cleanup
      await storage.deleteMeasurement(measurement.id);
      await storage.deleteTeam(team.id);
      await storage.removeUserFromOrganization(user1.id, org.id);
      await storage.deleteUser(user1.id);
      await storage.deleteOrganization(org.id);
    });

    it('should return zero counts for empty organization', async () => {
      const timestamp = Date.now();
      const org = await storage.createOrganization({
        name: `Empty Count Org ${timestamp}`,
        description: 'Empty org',
      });

      const counts = await organizationService.getOrganizationDependencyCounts(
        org.id,
        siteAdminUser.id
      );

      expect(counts.users).toBe(0);
      expect(counts.teams).toBe(0);
      expect(counts.measurements).toBe(0);

      // Cleanup
      await storage.deleteOrganization(org.id);
    });

    it('should allow site admins to get dependency counts', async () => {
      const counts = await organizationService.getOrganizationDependencyCounts(
        testOrg.id,
        siteAdminUser.id
      );

      expect(counts).toBeDefined();
      expect(typeof counts.users).toBe('number');
      expect(typeof counts.teams).toBe('number');
      expect(typeof counts.measurements).toBe('number');
    });

    it('should prevent non-site-admins from getting dependency counts', async () => {
      await expect(async () => {
        await organizationService.getOrganizationDependencyCounts(
          testOrg.id,
          orgAdminUser.id
        );
      }).rejects.toThrow(/Only site administrators/i);
    });
  });
});
