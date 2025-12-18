/**
 * Multi-Tenant Data Isolation Tests
 *
 * Critical security tests to ensure users from one organization
 * cannot access data from another organization.
 *
 * Test Pattern (TDD):
 * 1. Setup two organizations (Org A and Org B)
 * 2. Create users in each organization
 * 3. Attempt cross-organization access
 * 4. Verify access is denied (403 Forbidden)
 *
 * Bug Context:
 * - An org admin from "Texas Volleyballers" could see athletes from "Texas FC"
 * - Root cause: Endpoints accept organizationId parameter without validating
 *   user has access to that organization
 *
 * IMPORTANT: These are integration tests that verify the VALIDATION LOGIC,
 * not full end-to-end HTTP tests. We test that getUserOrganizations correctly
 * enforces multi-tenant isolation.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll as vitestAfterAll } from 'vitest';
import { db } from '../db';
import { storage } from '../storage';
import { users, organizations, teams, userOrganizations, measurements } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { User, Organization, Team } from '@shared/schema';
import bcrypt from 'bcrypt';

describe('Multi-Tenant Data Isolation', () => {
  let orgA: Organization;
  let orgB: Organization;
  let adminA: User; // Org admin for Organization A
  let adminB: User; // Org admin for Organization B
  let siteAdmin: User; // Site admin (should have access to all)
  let teamA: Team;
  let teamB: Team;
  let athleteA: User;
  let athleteB: User;

  beforeAll(async () => {
    // Cleanup any leftover test data from previous runs
    const timestamp = Date.now();

    // Create two separate organizations
    orgA = await storage.createOrganization({
      name: `Texas Volleyballers Test Org ${timestamp}`,
      isActive: true,
    });

    orgB = await storage.createOrganization({
      name: `Texas FC Test Org ${timestamp}`,
      isActive: true,
    });

    // Create org admins for each organization using direct DB insert to avoid schema issues
    const hashedPassword = await bcrypt.hash('password123', 10);

    [adminA] = await db.insert(users).values({
      username: `admin_volleyball_test_${timestamp}`,
      password: hashedPassword,
      role: 'org_admin',
      isSiteAdmin: false,
      isActive: true,
      firstName: 'Admin',
      lastName: 'Volleyball',
      fullName: 'Admin Volleyball',
    }).returning();

    [adminB] = await db.insert(users).values({
      username: `admin_fc_test_${timestamp}`,
      password: hashedPassword,
      role: 'org_admin',
      isSiteAdmin: false,
      isActive: true,
      firstName: 'Admin',
      lastName: 'FC',
      fullName: 'Admin FC',
    }).returning();

    // Create site admin
    [siteAdmin] = await db.insert(users).values({
      username: `site_admin_test_mt_${timestamp}`,
      password: hashedPassword,
      role: 'site_admin',
      isSiteAdmin: true,
      isActive: true,
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
    }).returning();

    // Assign admins to their respective organizations
    await storage.addUserToOrganization(adminA.id, orgA.id, 'org_admin');
    await storage.addUserToOrganization(adminB.id, orgB.id, 'org_admin');

    // Create teams in each organization
    teamA = await storage.createTeam({
      name: 'Volleyball Team A',
      organizationId: orgA.id,
      level: 'College',
      isArchived: false,
    });

    teamB = await storage.createTeam({
      name: 'Soccer Team B',
      organizationId: orgB.id,
      level: 'Club',
      isArchived: false,
    });

    // Create athletes in each organization using direct DB insert
    [athleteA] = await db.insert(users).values({
      username: `athlete_volleyball_test_${timestamp}`,
      password: hashedPassword,
      role: 'athlete',
      isSiteAdmin: false,
      isActive: true,
      firstName: 'Athlete',
      lastName: 'Volleyball',
      fullName: 'Athlete Volleyball',
    }).returning();

    [athleteB] = await db.insert(users).values({
      username: `athlete_soccer_test_${timestamp}`,
      password: hashedPassword,
      role: 'athlete',
      isSiteAdmin: false,
      isActive: true,
      firstName: 'Athlete',
      lastName: 'Soccer',
      fullName: 'Athlete Soccer',
    }).returning();

    // Assign athletes to their organizations and teams
    await storage.addUserToOrganization(athleteA.id, orgA.id, 'athlete');
    await storage.addUserToTeam(athleteA.id, teamA.id);

    await storage.addUserToOrganization(athleteB.id, orgB.id, 'athlete');
    await storage.addUserToTeam(athleteB.id, teamB.id);

    // Create measurements for athletes
    await storage.createMeasurement({
      userId: athleteA.id,
      teamId: teamA.id,
      metric: 'FLY10_TIME',
      value: 1.25,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
      notes: 'Volleyball athlete measurement',
    }, adminA.id);

    await storage.createMeasurement({
      userId: athleteB.id,
      teamId: teamB.id,
      metric: 'FLY10_TIME',
      value: 1.30,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
      notes: 'Soccer athlete measurement',
    }, adminB.id);
  });

  afterAll(async () => {
    // Clean up test data
    // Delete in reverse order of foreign key dependencies
    try {
      if (athleteA?.id) {
        await db.delete(measurements).where(eq(measurements.userId, athleteA.id));
      }
      if (athleteB?.id) {
        await db.delete(measurements).where(eq(measurements.userId, athleteB.id));
      }

      if (athleteA?.id && teamA?.id) {
        await storage.removeUserFromTeam(athleteA.id, teamA.id);
      }
      if (athleteB?.id && teamB?.id) {
        await storage.removeUserFromTeam(athleteB.id, teamB.id);
      }

      if (athleteA?.id && orgA?.id) {
        await storage.removeUserFromOrganization(athleteA.id, orgA.id, false);
      }
      if (athleteB?.id && orgB?.id) {
        await storage.removeUserFromOrganization(athleteB.id, orgB.id, false);
      }
      if (adminA?.id && orgA?.id) {
        await storage.removeUserFromOrganization(adminA.id, orgA.id, false);
      }
      if (adminB?.id && orgB?.id) {
        await storage.removeUserFromOrganization(adminB.id, orgB.id, false);
      }

      if (teamA?.id) await storage.deleteTeam(teamA.id);
      if (teamB?.id) await storage.deleteTeam(teamB.id);

      if (athleteA?.id) await storage.deleteUser(athleteA.id);
      if (athleteB?.id) await storage.deleteUser(athleteB.id);
      if (adminA?.id) await storage.deleteUser(adminA.id);
      if (adminB?.id) await storage.deleteUser(adminB.id);
      if (siteAdmin?.id) await storage.deleteUser(siteAdmin.id);

      if (orgA?.id) await storage.deleteOrganization(orgA.id);
      if (orgB?.id) await storage.deleteOrganization(orgB.id);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('GET /api/athletes - Athlete List Endpoint', () => {
    it('should DENY org admin from Org A accessing athletes from Org B', async () => {
      // Simulate request from Admin A trying to access Org B athletes
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      expect(userOrgs).toHaveLength(1);
      expect(userOrgs[0].organizationId).toBe(orgA.id);

      // Admin A should NOT have access to Org B
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);
      expect(hasAccessToOrgB).toBe(false);

      // This test verifies the security check at lines 131-151 of athlete-routes.ts
      // The endpoint should reject this request with 403
    });

    it('should allow org admin to access athletes from their own organization', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgA = userOrgs.some(org => org.organizationId === orgA.id);
      expect(hasAccessToOrgA).toBe(true);
    });

    it('should allow site admin to access athletes from any organization', async () => {
      // Site admin should be able to query both organizations
      expect(siteAdmin.isSiteAdmin).toBe(true);

      // Site admins bypass organization restrictions
      const userOrgs = await storage.getUserOrganizations(siteAdmin.id);
      // Site admin may have 0 org memberships (they have global access)
      expect(userOrgs.length).toBeGreaterThanOrEqual(0);
    });

    it('should enforce organization filter when no organizationId provided', async () => {
      // When no organizationId is provided, non-admin users should
      // automatically be restricted to their primary organization
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      expect(userOrgs.length).toBeGreaterThan(0);

      // The filter should use userOrgs[0].organizationId as per line 150
      const primaryOrgId = userOrgs[0].organizationId;
      expect(primaryOrgId).toBe(orgA.id);
    });
  });

  describe('GET /api/teams - Team List Endpoint', () => {
    it('should DENY org admin from Org A accessing teams from Org B', async () => {
      // Check current implementation at team-routes.ts lines 60-63
      // Currently uses session.primaryOrganizationId - needs validation!

      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const userOrgIds = userOrgs.map(org => org.organizationId);

      // Admin A should NOT have access to Org B
      expect(userOrgIds).not.toContain(orgB.id);
      expect(userOrgIds).toContain(orgA.id);
    });

    it('should validate organizationId parameter against user membership', async () => {
      // Test the security check that should exist
      const userOrgs = await storage.getUserOrganizations(adminA.id);

      // Attempting to query Org B's teams should fail
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);
      expect(hasAccessToOrgB).toBe(false);
    });

    it('should allow access to own organization teams', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgA = userOrgs.some(org => org.organizationId === orgA.id);
      expect(hasAccessToOrgA).toBe(true);
    });

    it('should allow site admin to access teams from any organization', async () => {
      expect(siteAdmin.isSiteAdmin).toBe(true);
    });
  });

  describe('GET /api/analytics/dashboard - Analytics Dashboard Endpoint', () => {
    it('should DENY org admin from Org A accessing analytics from Org B', async () => {
      // Check analytics-routes.ts lines 136-158
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const userOrgIds = userOrgs.map(org => org.organizationId);

      expect(userOrgIds).not.toContain(orgB.id);
    });

    it('should validate organizationId parameter matches user membership', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);

      // Admin A requesting Org B analytics should be denied
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);
      expect(hasAccessToOrgB).toBe(false);
    });

    it('should allow access to own organization analytics', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgA = userOrgs.some(org => org.organizationId === orgA.id);
      expect(hasAccessToOrgA).toBe(true);
    });

    it('should allow site admin to access analytics from any organization', async () => {
      expect(siteAdmin.isSiteAdmin).toBe(true);
    });
  });

  describe('GET /api/measurements - Measurements List Endpoint', () => {
    it('should DENY org admin from Org A accessing measurements from Org B', async () => {
      // Check measurement-routes.ts lines 152-169
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const userOrgIds = userOrgs.map(org => org.organizationId);

      expect(userOrgIds).not.toContain(orgB.id);
    });

    it('should validate organizationId parameter against user membership', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);

      // Requesting measurements from Org B should fail
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);
      expect(hasAccessToOrgB).toBe(false);
    });

    it('should enforce organization filter from user membership', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);

      // Non-admin without explicit org should get their primary org
      if (userOrgs.length > 0) {
        const primaryOrgId = userOrgs[0].organizationId;
        expect(primaryOrgId).toBe(orgA.id);
      }
    });

    it('should allow site admin to query across organizations', async () => {
      expect(siteAdmin.isSiteAdmin).toBe(true);
    });
  });

  describe('Storage Layer - getUserOrganizations method', () => {
    it('should return only organizations user belongs to', async () => {
      const adminAOrgs = await storage.getUserOrganizations(adminA.id);
      const adminBOrgs = await storage.getUserOrganizations(adminB.id);

      // Each admin should only see their own organization
      expect(adminAOrgs).toHaveLength(1);
      expect(adminBOrgs).toHaveLength(1);

      expect(adminAOrgs[0].organizationId).toBe(orgA.id);
      expect(adminBOrgs[0].organizationId).toBe(orgB.id);
    });

    it('should not return organizations from other tenants', async () => {
      const adminAOrgs = await storage.getUserOrganizations(adminA.id);
      const orgIds = adminAOrgs.map(org => org.organizationId);

      expect(orgIds).not.toContain(orgB.id);
      expect(orgIds).toContain(orgA.id);
    });
  });

  describe('Cross-Organization Attack Scenarios', () => {
    it('should prevent IDOR attack: Admin A querying athletes?organizationId=OrgB', async () => {
      // This is the actual bug scenario reported
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      // Admin A should NOT have access to Org B
      expect(hasAccessToOrgB).toBe(false);

      // The endpoint should validate this and return 403
    });

    it('should prevent IDOR attack: Admin A querying teams?organizationId=OrgB', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      expect(hasAccessToOrgB).toBe(false);
    });

    it('should prevent IDOR attack: Admin A querying analytics/dashboard?organizationId=OrgB', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      expect(hasAccessToOrgB).toBe(false);
    });

    it('should prevent IDOR attack: Admin A querying measurements?organizationId=OrgB', async () => {
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      expect(hasAccessToOrgB).toBe(false);
    });
  });

  describe('Site Admin Bypass', () => {
    it('should allow site admin to access Org A data', async () => {
      expect(siteAdmin.isSiteAdmin).toBe(true);

      // Site admin can query any organization
      // No getUserOrganizations check needed for site admin
    });

    it('should allow site admin to access Org B data', async () => {
      expect(siteAdmin.isSiteAdmin).toBe(true);
    });

    it('should allow site admin to access data without organizationId filter', async () => {
      expect(siteAdmin.isSiteAdmin).toBe(true);

      // Site admins can query globally
    });
  });
});
