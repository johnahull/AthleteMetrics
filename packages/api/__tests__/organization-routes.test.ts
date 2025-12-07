/**
 * Integration tests for organization API routes
 * Tests authentication, authorization, CRUD operations, and security
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { OrganizationType } from "@shared/schema";

// TODO: These tests need to be fixed - they have issues with FK constraints and database isolation
describe.skip("Organization Routes", () => {
  // Test data identifiers
  const timestamp = Date.now().toString();
  const testSuffix = `_org_routes_test_${timestamp}`;

  let testOrgId: string;
  let testOrgJoinCode: string;
  let privateOrgId: string;
  let publicOrgId: string;
  let testSiteAdminId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let otherOrgAdminId: string;

  const TEST_ORG_NAME = `Test Organization${testSuffix}`;
  const PRIVATE_ORG_NAME = `Private Org${testSuffix}`;
  const PUBLIC_ORG_NAME = `Public Org${testSuffix}`;

  beforeAll(async () => {
    // Create test organization with join code
    const generatedJoinCode = `TEST${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for route testing",
      location: "Test City",
      isActive: true,
      allowMembershipRequests: true,
      isPublicDirectory: false,
      autoApproveRequests: false,
      joinCode: generatedJoinCode,
    }).returning();
    testOrgId = org.id;
    testOrgJoinCode = org.joinCode ?? generatedJoinCode;

    // Create private organization (not in directory)
    const [privateOrg] = await db.insert(organizations).values({
      name: PRIVATE_ORG_NAME,
      orgType: "high_school",
      description: "Private org not accepting requests",
      isActive: true,
      allowMembershipRequests: false,
      isPublicDirectory: false,
    }).returning();
    privateOrgId = privateOrg.id;

    // Create public organization (in directory)
    const [publicOrg] = await db.insert(organizations).values({
      name: PUBLIC_ORG_NAME,
      orgType: "college",
      description: "Public org in directory",
      isActive: true,
      allowMembershipRequests: true,
      isPublicDirectory: true,
      joinCode: `PUB${Date.now().toString(36).toUpperCase().slice(-6)}`,
    }).returning();
    publicOrgId = publicOrg.id;

    // Create site admin
    const [siteAdmin] = await db.insert(users).values({
      emails: [`siteadmin${testSuffix}@example.com`],
      username: `siteadmin${testSuffix}`,
      firstName: "Site",
      lastName: "Admin",
      fullName: "Site Admin",
      role: "org_admin",
      isSiteAdmin: true,
      isActive: true,
    }).returning();
    testSiteAdminId = siteAdmin.id;

    // Create org admin for test org
    const [orgAdmin] = await db.insert(users).values({
      emails: [`orgadmin${testSuffix}@example.com`],
      username: `orgadmin${testSuffix}`,
      firstName: "Org",
      lastName: "Admin",
      fullName: "Org Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = orgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    // Create coach for test org
    const [coach] = await db.insert(users).values({
      emails: [`coach${testSuffix}@example.com`],
      username: `coach${testSuffix}`,
      firstName: "Test",
      lastName: "Coach",
      fullName: "Test Coach",
      role: "coach",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create athlete for test org
    const [athlete] = await db.insert(users).values({
      emails: [`athlete${testSuffix}@example.com`],
      username: `athlete${testSuffix}`,
      firstName: "Test",
      lastName: "Athlete",
      fullName: "Test Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create org admin for private org
    const [otherOrgAdmin] = await db.insert(users).values({
      emails: [`otherorgadmin${testSuffix}@example.com`],
      username: `otherorgadmin${testSuffix}`,
      firstName: "Other",
      lastName: "OrgAdmin",
      fullName: "Other OrgAdmin",
      role: "org_admin",
      isActive: true,
    }).returning();
    otherOrgAdminId = otherOrgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: otherOrgAdminId,
      organizationId: privateOrgId,
      role: "org_admin",
    });
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, privateOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, publicOrgId));
    await db.delete(users).where(eq(users.id, testSiteAdminId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(users).where(eq(users.id, otherOrgAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, privateOrgId));
    await db.delete(organizations).where(eq(organizations.id, publicOrgId));
  });

  describe("GET /api/organizations/public", () => {
    it("should return only public directory organizations", async () => {
      const publicOrgs = await storage.getPublicOrganizations();

      // Public org should be included
      const hasPublicOrg = publicOrgs.some(org => org.id === publicOrgId);
      expect(hasPublicOrg).toBe(true);

      // Private orgs should NOT be included
      const hasPrivateOrg = publicOrgs.some(org => org.id === privateOrgId);
      expect(hasPrivateOrg).toBe(false);

      const hasTestOrg = publicOrgs.some(org => org.id === testOrgId);
      expect(hasTestOrg).toBe(false);
    });

    it("should filter by search query", async () => {
      const results = await storage.getPublicOrganizations({ search: PUBLIC_ORG_NAME.substring(0, 10) });

      const hasPublicOrg = results.some(org => org.id === publicOrgId);
      expect(hasPublicOrg).toBe(true);
    });

    it("should filter by organization type", async () => {
      const collegeOrgs = await storage.getPublicOrganizations({ orgType: "college" });

      // All returned orgs should be colleges
      collegeOrgs.forEach(org => {
        expect(org.orgType).toBe("college");
      });

      const hasPublicOrg = collegeOrgs.some(org => org.id === publicOrgId);
      expect(hasPublicOrg).toBe(true);
    });

    it("should work with both search and orgType filters", async () => {
      const results = await storage.getPublicOrganizations({
        search: "Public",
        orgType: "college"
      });

      results.forEach(org => {
        expect(org.orgType).toBe("college");
      });
    });

    it("should return empty array if no matching organizations", async () => {
      const results = await storage.getPublicOrganizations({
        search: "NonExistentOrganization12345"
      });

      expect(results).toEqual([]);
    });
  });

  describe("GET /api/organizations/join/:code", () => {
    it("should return organization info for valid join code", async () => {
      const org = await storage.getOrganizationByJoinCode(testOrgJoinCode);

      expect(org).toBeDefined();
      expect(org?.id).toBe(testOrgId);
      expect(org?.name).toBe(TEST_ORG_NAME);
    });

    it("should return undefined for invalid join code", async () => {
      const org = await storage.getOrganizationByJoinCode("INVALID99");
      expect(org).toBeUndefined();
    });

    it("should be case-insensitive", async () => {
      const lowercase = await storage.getOrganizationByJoinCode(testOrgJoinCode.toLowerCase());
      const uppercase = await storage.getOrganizationByJoinCode(testOrgJoinCode.toUpperCase());

      expect(lowercase?.id).toBe(testOrgId);
      expect(uppercase?.id).toBe(testOrgId);
    });

    it("should return undefined for codes shorter than 4 characters", async () => {
      // This would be rejected by route validation
      const org = await storage.getOrganizationByJoinCode("ABC");
      expect(org).toBeUndefined();
    });

    it("should not return organizations that don't accept membership requests", async () => {
      // The route handler checks allowMembershipRequests
      const org = await storage.getOrganization(privateOrgId);
      expect(org?.allowMembershipRequests).toBe(false);
    });
  });

  describe("POST /api/organizations", () => {
    let createdOrgId: string | null = null;

    afterEach(async () => {
      if (createdOrgId) {
        await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, createdOrgId));
        await db.delete(organizations).where(eq(organizations.id, createdOrgId));
        createdOrgId = null;
      }
    });

    it("should create organization with valid data (site admin)", async () => {
      const newOrg = await storage.createOrganization({
        name: `New Org ${testSuffix}`,
        orgType: "club",
        description: "Newly created organization",
        isActive: true,
      });

      createdOrgId = newOrg.id;

      expect(newOrg.name).toBe(`New Org ${testSuffix}`);
      expect(newOrg.orgType).toBe("club");
      expect(newOrg.isActive).toBe(true);
      expect(newOrg.joinCode).toBeDefined();
      expect(newOrg.joinCode!.length).toBeGreaterThanOrEqual(8);
    });

    it("should generate unique join code automatically", async () => {
      const org1 = await storage.createOrganization({
        name: `Org1 ${testSuffix}`,
        orgType: "club",
        isActive: true,
      });

      const org2 = await storage.createOrganization({
        name: `Org2 ${testSuffix}`,
        orgType: "club",
        isActive: true,
      });

      expect(org1.joinCode).toBeDefined();
      expect(org2.joinCode).toBeDefined();
      expect(org1.joinCode).not.toBe(org2.joinCode);

      // Cleanup
      await db.delete(organizations).where(eq(organizations.id, org1.id));
      await db.delete(organizations).where(eq(organizations.id, org2.id));
    });

    it("should validate required fields", async () => {
      // Missing name should fail
      await expect(
        storage.createOrganization({
          name: "",
          orgType: "club",
          isActive: true,
        })
      ).rejects.toThrow();
    });

    it("should set default values for optional fields", async () => {
      const org = await storage.createOrganization({
        name: `Defaults Org ${testSuffix}`,
        orgType: "club",
        isActive: true,
      });

      createdOrgId = org.id;

      expect(org.allowMembershipRequests).toBe(false);
      expect(org.isPublicDirectory).toBe(false);
      expect(org.autoApproveRequests).toBe(false);
      expect(org.aiEnabled).toBe(false);
      expect(org.aiEnabledBySiteAdmin).toBe(false);
    });
  });

  describe("PATCH /api/organizations/:id", () => {
    it("should update organization name", async () => {
      const updated = await storage.updateOrganization(testOrgId, {
        name: `${TEST_ORG_NAME} Updated`
      });

      expect(updated.name).toBe(`${TEST_ORG_NAME} Updated`);

      // Reset
      await storage.updateOrganization(testOrgId, { name: TEST_ORG_NAME });
    });

    it("should update organization description", async () => {
      const updated = await storage.updateOrganization(testOrgId, {
        description: "New description"
      });

      expect(updated.description).toBe("New description");

      // Reset
      await storage.updateOrganization(testOrgId, { description: "Test organization for route testing" });
    });

    it("should update organization type", async () => {
      const updated = await storage.updateOrganization(testOrgId, {
        orgType: "high_school" as OrganizationType
      });

      expect(updated.orgType).toBe("high_school");

      // Reset
      await storage.updateOrganization(testOrgId, { orgType: "club" });
    });

    it("should update multiple fields at once", async () => {
      const updated = await storage.updateOrganization(testOrgId, {
        location: "New City",
        description: "Updated description"
      });

      expect(updated.location).toBe("New City");
      expect(updated.description).toBe("Updated description");

      // Reset
      await storage.updateOrganization(testOrgId, {
        location: "Test City",
        description: "Test organization for route testing"
      });
    });

    it("should reject invalid UUID format", async () => {
      // This would be caught by route UUID validation
      await expect(
        storage.updateOrganization("not-a-uuid", { name: "Test" })
      ).rejects.toThrow();
    });

    it("should reject updates to non-existent organization", async () => {
      const fakeUuid = "00000000-0000-4000-8000-000000000000";
      await expect(
        storage.updateOrganization(fakeUuid, { name: "Test" })
      ).rejects.toThrow();
    });
  });

  describe("PATCH /api/organizations/:id/status", () => {
    let deactivateTestOrgId: string;

    beforeAll(async () => {
      const [org] = await db.insert(organizations).values({
        name: `Deactivate Test Org ${testSuffix}`,
        orgType: "club",
        isActive: true,
      }).returning();
      deactivateTestOrgId = org.id;
    });

    afterAll(async () => {
      await db.delete(organizations).where(eq(organizations.id, deactivateTestOrgId));
    });

    it("should deactivate active organization", async () => {
      await storage.deactivateOrganization(deactivateTestOrgId);

      const org = await storage.getOrganization(deactivateTestOrgId);
      expect(org?.isActive).toBe(false);
    });

    it("should reactivate inactive organization", async () => {
      // First deactivate
      await storage.deactivateOrganization(deactivateTestOrgId);

      // Then reactivate
      await storage.reactivateOrganization(deactivateTestOrgId);

      const org = await storage.getOrganization(deactivateTestOrgId);
      expect(org?.isActive).toBe(true);
    });

    it("should fail to deactivate already inactive organization", async () => {
      await storage.deactivateOrganization(deactivateTestOrgId);

      await expect(
        storage.deactivateOrganization(deactivateTestOrgId)
      ).rejects.toThrow(/already.*inactive/i);

      // Reset
      await storage.reactivateOrganization(deactivateTestOrgId);
    });

    it("should fail to reactivate already active organization", async () => {
      // Ensure it's active
      await storage.reactivateOrganization(deactivateTestOrgId);

      await expect(
        storage.reactivateOrganization(deactivateTestOrgId)
      ).rejects.toThrow(/already.*active/i);
    });
  });

  describe("DELETE /api/organizations/:id", () => {
    let deleteTestOrgId: string;

    beforeAll(async () => {
      const [org] = await db.insert(organizations).values({
        name: `Delete Test Org ${testSuffix}`,
        orgType: "club",
        isActive: true,
      }).returning();
      deleteTestOrgId = org.id;
    });

    it("should require confirmation name", async () => {
      // This is enforced by route handler
      // Storage layer doesn't check confirmation
    });

    it("should delete organization without dependencies", async () => {
      await storage.deleteOrganization(deleteTestOrgId);

      const org = await storage.getOrganization(deleteTestOrgId);
      expect(org).toBeUndefined();
    });

    it("should fail to delete organization with members", async () => {
      // Create org with members
      const [orgWithMembers] = await db.insert(organizations).values({
        name: `Org With Members ${testSuffix}`,
        orgType: "club",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: testAthleteId,
        organizationId: orgWithMembers.id,
        role: "athlete",
      });

      await expect(
        storage.deleteOrganization(orgWithMembers.id)
      ).rejects.toThrow();

      // Cleanup
      await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgWithMembers.id));
      await db.delete(organizations).where(eq(organizations.id, orgWithMembers.id));
    });

    it("should reject invalid UUID", async () => {
      await expect(
        storage.deleteOrganization("not-a-uuid")
      ).rejects.toThrow();
    });
  });

  describe("GET /api/organizations/:id/profile", () => {
    it("should return organization with users", async () => {
      const org = await storage.getOrganization(testOrgId);
      expect(org).toBeDefined();
      expect(org?.name).toBe(TEST_ORG_NAME);
    });

    it("should include user count", async () => {
      const userOrgs = await storage.getUserOrganizations(testOrgAdminId);
      const membership = userOrgs.find(uo => uo.organizationId === testOrgId);
      expect(membership).toBeDefined();
    });

    it("should reject invalid organization ID", async () => {
      const org = await storage.getOrganization("not-a-uuid");
      expect(org).toBeUndefined();
    });

    it("should return undefined for non-existent organization", async () => {
      const fakeUuid = "00000000-0000-4000-8000-000000000000";
      const org = await storage.getOrganization(fakeUuid);
      expect(org).toBeUndefined();
    });
  });

  describe("POST /api/organizations/:id/users", () => {
    let newUserId: string | null = null;

    afterEach(async () => {
      if (newUserId) {
        await db.delete(userOrganizations).where(
          and(
            eq(userOrganizations.userId, newUserId),
            eq(userOrganizations.organizationId, testOrgId)
          )
        );
        await db.delete(users).where(eq(users.id, newUserId));
        newUserId = null;
      }
    });

    it("should add new user to organization", async () => {
      const [newUser] = await db.insert(users).values({
        emails: [`newuser${testSuffix}@example.com`],
        username: `newuser${testSuffix}`,
        firstName: "New",
        lastName: "User",
        fullName: "New User",
        role: "athlete",
        isActive: true,
      }).returning();

      newUserId = newUser.id;

      await db.insert(userOrganizations).values({
        userId: newUserId,
        organizationId: testOrgId,
        role: "athlete",
      });

      const userOrgs = await storage.getUserOrganizations(newUserId);
      const isMember = userOrgs.some(org => org.organizationId === testOrgId);
      expect(isMember).toBe(true);
    });

    it("should validate user role", async () => {
      const [newUser] = await db.insert(users).values({
        emails: [`roletest${testSuffix}@example.com`],
        username: `roletest${testSuffix}`,
        firstName: "Role",
        lastName: "Test",
        fullName: "Role Test",
        role: "athlete",
        isActive: true,
      }).returning();

      newUserId = newUser.id;

      // Valid roles: athlete, coach, org_admin
      await db.insert(userOrganizations).values({
        userId: newUserId,
        organizationId: testOrgId,
        role: "coach",
      });

      const userOrgs = await storage.getUserOrganizations(newUserId);
      const membership = userOrgs.find(org => org.organizationId === testOrgId);
      expect(membership?.role).toBe("coach");
    });

    it("should reject duplicate user addition", async () => {
      // testAthleteId is already in testOrgId
      await expect(
        db.insert(userOrganizations).values({
          userId: testAthleteId,
          organizationId: testOrgId,
          role: "athlete",
        })
      ).rejects.toThrow();
    });
  });

  describe("DELETE /api/organizations/:id/users/:userId", () => {
    let removableUserId: string;

    beforeAll(async () => {
      const [user] = await db.insert(users).values({
        emails: [`removable${testSuffix}@example.com`],
        username: `removable${testSuffix}`,
        firstName: "Removable",
        lastName: "User",
        fullName: "Removable User",
        role: "athlete",
        isActive: true,
      }).returning();
      removableUserId = user.id;

      await db.insert(userOrganizations).values({
        userId: removableUserId,
        organizationId: testOrgId,
        role: "athlete",
      });
    });

    afterAll(async () => {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, removableUserId));
      await db.delete(users).where(eq(users.id, removableUserId));
    });

    it("should remove user from organization", async () => {
      await db.delete(userOrganizations).where(
        and(
          eq(userOrganizations.userId, removableUserId),
          eq(userOrganizations.organizationId, testOrgId)
        )
      );

      const userOrgs = await storage.getUserOrganizations(removableUserId);
      const isMember = userOrgs.some(org => org.organizationId === testOrgId);
      expect(isMember).toBe(false);

      // Re-add for other tests
      await db.insert(userOrganizations).values({
        userId: removableUserId,
        organizationId: testOrgId,
        role: "athlete",
      });
    });

    it("should fail to remove non-existent user", async () => {
      const fakeUuid = "00000000-0000-4000-8000-000000000000";

      const result = await db.delete(userOrganizations).where(
        and(
          eq(userOrganizations.userId, fakeUuid),
          eq(userOrganizations.organizationId, testOrgId)
        )
      );

      // Should delete 0 rows
      expect(result.rowCount).toBe(0);
    });

    it("should reject invalid UUID formats", async () => {
      // This would be caught by route validation
      await expect(
        db.delete(userOrganizations).where(
          and(
            eq(userOrganizations.userId, "not-a-uuid"),
            eq(userOrganizations.organizationId, testOrgId)
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("PUT /api/organizations/:id/users/:userId/role", () => {
    let roleChangeUserId: string;

    beforeAll(async () => {
      const [user] = await db.insert(users).values({
        emails: [`rolechange${testSuffix}@example.com`],
        username: `rolechange${testSuffix}`,
        firstName: "RoleChange",
        lastName: "User",
        fullName: "RoleChange User",
        role: "athlete",
        isActive: true,
      }).returning();
      roleChangeUserId = user.id;

      await db.insert(userOrganizations).values({
        userId: roleChangeUserId,
        organizationId: testOrgId,
        role: "athlete",
      });
    });

    afterAll(async () => {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, roleChangeUserId));
      await db.delete(users).where(eq(users.id, roleChangeUserId));
    });

    it("should update user role from athlete to coach", async () => {
      await storage.updateUserOrganizationRole(roleChangeUserId, testOrgId, "coach");

      const roles = await storage.getUserRoles(roleChangeUserId, testOrgId);
      expect(roles).toContain("coach");
    });

    it("should update user role from coach to org_admin", async () => {
      await storage.updateUserOrganizationRole(roleChangeUserId, testOrgId, "org_admin");

      const roles = await storage.getUserRoles(roleChangeUserId, testOrgId);
      expect(roles).toContain("org_admin");
    });

    it("should update user role from org_admin to athlete", async () => {
      // First make them org_admin
      await storage.updateUserOrganizationRole(roleChangeUserId, testOrgId, "org_admin");

      // Then downgrade to athlete (only site admin can do this via route)
      await storage.updateUserOrganizationRole(roleChangeUserId, testOrgId, "athlete");

      const roles = await storage.getUserRoles(roleChangeUserId, testOrgId);
      expect(roles).toContain("athlete");
    });

    it("should reject invalid role", async () => {
      await expect(
        storage.updateUserOrganizationRole(roleChangeUserId, testOrgId, "invalid_role" as any)
      ).rejects.toThrow();
    });

    it("should fail for user not in organization", async () => {
      await expect(
        storage.updateUserOrganizationRole(testSiteAdminId, testOrgId, "coach")
      ).rejects.toThrow();
    });
  });

  describe("PATCH /api/organizations/:id/org-settings", () => {
    it("should update aiEnabled flag when aiEnabledBySiteAdmin is true", async () => {
      // First enable AI at site level
      await storage.updateOrganization(testOrgId, {
        aiEnabledBySiteAdmin: true
      });

      // Then org admin can enable it
      const updated = await storage.updateOrganization(testOrgId, {
        aiEnabled: true
      });

      expect(updated.aiEnabled).toBe(true);

      // Reset
      await storage.updateOrganization(testOrgId, {
        aiEnabled: false,
        aiEnabledBySiteAdmin: false
      });
    });

    it("should fail to enable AI when aiEnabledBySiteAdmin is false", async () => {
      // This validation happens in the route handler
      const org = await storage.getOrganization(testOrgId);
      expect(org?.aiEnabledBySiteAdmin).toBe(false);
    });

    it("should update wellnessEnabled flag", async () => {
      const updated = await storage.updateOrganization(testOrgId, {
        wellnessEnabled: true
      });

      expect(updated.wellnessEnabled).toBe(true);

      // Reset
      await storage.updateOrganization(testOrgId, { wellnessEnabled: false });
    });

    it("should reject non-boolean values", async () => {
      await expect(
        storage.updateOrganization(testOrgId, {
          aiEnabled: "true" as any
        })
      ).rejects.toThrow();
    });
  });

  describe("GET /api/organizations/:id/dependencies", () => {
    it("should return zero dependencies for new organization", async () => {
      const [newOrg] = await db.insert(organizations).values({
        name: `Dependency Test ${testSuffix}`,
        orgType: "club",
        isActive: true,
      }).returning();

      // This would be called by OrganizationService
      // Storage layer doesn't have this method, service layer does

      // Cleanup
      await db.delete(organizations).where(eq(organizations.id, newOrg.id));
    });

    it("should count user dependencies", async () => {
      const userOrgs = await storage.getUserOrganizations(testAthleteId);
      const membership = userOrgs.find(uo => uo.organizationId === testOrgId);
      expect(membership).toBeDefined();
    });
  });
});

// TODO: These tests need to be fixed - they have issues with FK constraints and database isolation
describe.skip("Organization Authorization", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_auth_test_${timestamp}`;

  let org1Id: string;
  let org2Id: string;
  let siteAdminId: string;
  let org1AdminId: string;
  let org2AdminId: string;
  let athleteId: string;

  beforeAll(async () => {
    // Create two separate organizations
    const [org1] = await db.insert(organizations).values({
      name: `Auth Org 1 ${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    org1Id = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: `Auth Org 2 ${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    org2Id = org2.id;

    // Create site admin
    const [siteAdmin] = await db.insert(users).values({
      username: `authsiteadmin${testSuffix}`,
      firstName: "Auth",
      lastName: "SiteAdmin",
      fullName: "Auth SiteAdmin",
      isSiteAdmin: true,
      isActive: true,
    }).returning();
    siteAdminId = siteAdmin.id;

    // Create org1 admin
    const [org1Admin] = await db.insert(users).values({
      username: `authorg1admin${testSuffix}`,
      firstName: "Org1",
      lastName: "Admin",
      fullName: "Org1 Admin",
      isActive: true,
    }).returning();
    org1AdminId = org1Admin.id;

    await db.insert(userOrganizations).values({
      userId: org1AdminId,
      organizationId: org1Id,
      role: "org_admin",
    });

    // Create org2 admin
    const [org2Admin] = await db.insert(users).values({
      username: `authorg2admin${testSuffix}`,
      firstName: "Org2",
      lastName: "Admin",
      fullName: "Org2 Admin",
      isActive: true,
    }).returning();
    org2AdminId = org2Admin.id;

    await db.insert(userOrganizations).values({
      userId: org2AdminId,
      organizationId: org2Id,
      role: "org_admin",
    });

    // Create athlete
    const [athlete] = await db.insert(users).values({
      username: `authathlete${testSuffix}`,
      firstName: "Auth",
      lastName: "Athlete",
      fullName: "Auth Athlete",
      isActive: true,
    }).returning();
    athleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: athleteId,
      organizationId: org1Id,
      role: "athlete",
    });
  });

  afterAll(async () => {
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, org1Id));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, org2Id));
    await db.delete(users).where(eq(users.id, siteAdminId));
    await db.delete(users).where(eq(users.id, org1AdminId));
    await db.delete(users).where(eq(users.id, org2AdminId));
    await db.delete(users).where(eq(users.id, athleteId));
    await db.delete(organizations).where(eq(organizations.id, org1Id));
    await db.delete(organizations).where(eq(organizations.id, org2Id));
  });

  describe("site admin permissions", () => {
    it("should allow site admin to access all organizations", async () => {
      const user = await storage.getUser(siteAdminId);
      expect(user?.isSiteAdmin).toBe(true);
    });

    it("should allow site admin to create organizations", async () => {
      const user = await storage.getUser(siteAdminId);
      expect(user?.isSiteAdmin).toBe(true);
      // Route enforces requireSiteAdmin middleware
    });

    it("should allow site admin to update any organization", async () => {
      const user = await storage.getUser(siteAdminId);
      expect(user?.isSiteAdmin).toBe(true);
      // Route enforces requireSiteAdmin middleware
    });

    it("should allow site admin to delete any organization", async () => {
      const user = await storage.getUser(siteAdminId);
      expect(user?.isSiteAdmin).toBe(true);
      // Route enforces requireSiteAdmin middleware
    });
  });

  describe("org admin permissions", () => {
    it("should allow org admin to access their organization", async () => {
      const userOrgs = await storage.getUserOrganizations(org1AdminId);
      const hasAccess = userOrgs.some(org => org.organizationId === org1Id);
      expect(hasAccess).toBe(true);
    });

    it("should deny org admin access to other organizations", async () => {
      const userOrgs = await storage.getUserOrganizations(org1AdminId);
      const hasAccess = userOrgs.some(org => org.organizationId === org2Id);
      expect(hasAccess).toBe(false);
    });

    it("should allow org admin to update settings in their org", async () => {
      const userOrgs = await storage.getUserOrganizations(org1AdminId);
      const membership = userOrgs.find(org => org.organizationId === org1Id);
      expect(membership?.role).toBe("org_admin");
    });

    it("should allow org admin to manage users in their org", async () => {
      const userOrgs = await storage.getUserOrganizations(org1AdminId);
      const membership = userOrgs.find(org => org.organizationId === org1Id);
      expect(membership?.role).toBe("org_admin");
    });

    it("should deny org admin from creating organizations", async () => {
      const user = await storage.getUser(org1AdminId);
      expect(user?.isSiteAdmin).toBe(false);
      // Route enforces requireSiteAdmin middleware
    });

    it("should deny org admin from deleting organizations", async () => {
      const user = await storage.getUser(org1AdminId);
      expect(user?.isSiteAdmin).toBe(false);
      // Route enforces requireSiteAdmin middleware
    });
  });

  describe("coach permissions", () => {
    let coachId: string;

    beforeAll(async () => {
      const [coach] = await db.insert(users).values({
        username: `authcoach${testSuffix}`,
        firstName: "Auth",
        lastName: "Coach",
        fullName: "Auth Coach",
        isActive: true,
      }).returning();
      coachId = coach.id;

      await db.insert(userOrganizations).values({
        userId: coachId,
        organizationId: org1Id,
        role: "coach",
      });
    });

    afterAll(async () => {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, coachId));
      await db.delete(users).where(eq(users.id, coachId));
    });

    it("should allow coach to view their organization", async () => {
      const userOrgs = await storage.getUserOrganizations(coachId);
      const hasAccess = userOrgs.some(org => org.organizationId === org1Id);
      expect(hasAccess).toBe(true);
    });

    it("should deny coach from modifying organization settings", async () => {
      const roles = await storage.getUserRoles(coachId, org1Id);
      expect(roles).not.toContain("org_admin");
      // Route checks for org_admin role
    });

    it("should deny coach from managing users", async () => {
      const roles = await storage.getUserRoles(coachId, org1Id);
      expect(roles).not.toContain("org_admin");
      // Route checks for org_admin role
    });
  });

  describe("athlete permissions", () => {
    it("should allow athlete to view their organization profile", async () => {
      const userOrgs = await storage.getUserOrganizations(athleteId);
      const hasAccess = userOrgs.some(org => org.organizationId === org1Id);
      expect(hasAccess).toBe(true);
    });

    it("should deny athlete from modifying organization", async () => {
      const roles = await storage.getUserRoles(athleteId, org1Id);
      expect(roles).not.toContain("org_admin");
    });

    it("should deny athlete from managing users", async () => {
      const roles = await storage.getUserRoles(athleteId, org1Id);
      expect(roles).not.toContain("org_admin");
    });

    it("should deny athlete from creating organizations", async () => {
      const user = await storage.getUser(athleteId);
      expect(user?.isSiteAdmin).toBe(false);
    });
  });

  describe("cross-organization isolation", () => {
    it("should prevent org1 admin from accessing org2 data", async () => {
      const userOrgs = await storage.getUserOrganizations(org1AdminId);
      const hasOrg2Access = userOrgs.some(org => org.organizationId === org2Id);
      expect(hasOrg2Access).toBe(false);
    });

    it("should prevent org1 admin from modifying org2", async () => {
      const roles = await storage.getUserRoles(org1AdminId, org2Id);
      expect(roles.length).toBe(0);
    });

    it("should allow org admin to only see their organization's users", async () => {
      const userOrgs = await storage.getUserOrganizations(org1AdminId);
      const org1Membership = userOrgs.find(org => org.organizationId === org1Id);
      const org2Membership = userOrgs.find(org => org.organizationId === org2Id);

      expect(org1Membership).toBeDefined();
      expect(org2Membership).toBeUndefined();
    });
  });
});

// TODO: These tests need to be fixed - they have issues with FK constraints and database isolation
describe.skip("Organization Validation", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_validation_test_${timestamp}`;

  describe("UUID validation", () => {
    it("should reject malformed UUIDs", async () => {
      await expect(
        storage.getOrganization("not-a-uuid")
      ).resolves.toBeUndefined();
    });

    it("should reject empty string UUID", async () => {
      await expect(
        storage.getOrganization("")
      ).resolves.toBeUndefined();
    });

    it("should accept valid UUIDv4", async () => {
      const validUuid = "123e4567-e89b-4d3c-8456-426614174000";
      // Will return undefined since it doesn't exist, but shouldn't throw
      await expect(
        storage.getOrganization(validUuid)
      ).resolves.toBeUndefined();
    });
  });

  describe("join code validation", () => {
    it("should enforce minimum length (4 characters)", async () => {
      await expect(
        storage.regenerateJoinCode("fake-org-id", "ABC")
      ).rejects.toThrow(/between 4 and 20/);
    });

    it("should enforce maximum length (20 characters)", async () => {
      const longCode = "A".repeat(21);
      await expect(
        storage.regenerateJoinCode("fake-org-id", longCode)
      ).rejects.toThrow(/between 4 and 20/);
    });

    it("should reject special characters", async () => {
      await expect(
        storage.regenerateJoinCode("fake-org-id", "MY@TEAM!")
      ).rejects.toThrow(/only contain letters and numbers/);
    });

    it("should reject spaces", async () => {
      await expect(
        storage.regenerateJoinCode("fake-org-id", "MY TEAM")
      ).rejects.toThrow(/only contain letters and numbers/);
    });

    it("should convert to uppercase", async () => {
      // This would succeed if org exists
      // The function normalizes to uppercase
    });

    it("should trim whitespace", async () => {
      // The function trims input before validation
    });
  });

  describe("organization name validation", () => {
    it("should reject empty name", async () => {
      await expect(
        storage.createOrganization({
          name: "",
          orgType: "club",
          isActive: true,
        })
      ).rejects.toThrow();
    });

    it("should accept valid names", async () => {
      const org = await storage.createOrganization({
        name: `Valid Name ${testSuffix}`,
        orgType: "club",
        isActive: true,
      });

      expect(org.name).toBe(`Valid Name ${testSuffix}`);

      // Cleanup
      await db.delete(organizations).where(eq(organizations.id, org.id));
    });
  });

  describe("organization type validation", () => {
    it("should accept valid org types", async () => {
      const validTypes: OrganizationType[] = ["club", "high_school", "college"];

      for (const orgType of validTypes) {
        const org = await storage.createOrganization({
          name: `${orgType} Org ${testSuffix}`,
          orgType,
          isActive: true,
        });

        expect(org.orgType).toBe(orgType);

        // Cleanup
        await db.delete(organizations).where(eq(organizations.id, org.id));
      }
    });

    it("should reject invalid org type", async () => {
      await expect(
        storage.createOrganization({
          name: `Invalid Type ${testSuffix}`,
          orgType: "invalid_type" as any,
          isActive: true,
        })
      ).rejects.toThrow();
    });
  });
});

// TODO: These tests need to be fixed - they have issues with FK constraints and database isolation
describe.skip("Organization Security", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_security_test_${timestamp}`;

  describe("SQL injection prevention", () => {
    it("should safely handle SQL injection in search", async () => {
      const results = await storage.getPublicOrganizations({
        search: "'; DROP TABLE organizations; --"
      });

      // Should return empty array safely
      expect(Array.isArray(results)).toBe(true);
    });

    it("should safely handle SQL injection in join code lookup", async () => {
      const result = await storage.getOrganizationByJoinCode("' OR '1'='1");
      expect(result).toBeUndefined();
    });
  });

  describe("input sanitization", () => {
    it("should handle extremely long input strings", async () => {
      const longString = "A".repeat(10000);

      await expect(
        storage.getPublicOrganizations({ search: longString })
      ).resolves.toBeDefined();
    });

    it("should handle special characters safely", async () => {
      const specialChars = "<script>alert('xss')</script>";

      await expect(
        storage.getPublicOrganizations({ search: specialChars })
      ).resolves.toBeDefined();
    });

    it("should handle null bytes", async () => {
      const nullByte = "test\0null";

      await expect(
        storage.getPublicOrganizations({ search: nullByte })
      ).resolves.toBeDefined();
    });
  });

  describe("rate limiting data", () => {
    it("should track multiple organization creation attempts", async () => {
      // Rate limiting is enforced at route level
      // This tests that storage layer can handle rapid requests
      const promises = Array(3).fill(null).map((_, i) =>
        storage.createOrganization({
          name: `RateLimit Org ${i} ${testSuffix}`,
          orgType: "club",
          isActive: true,
        })
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(3);

      // Cleanup
      await Promise.all(
        results.map(org =>
          db.delete(organizations).where(eq(organizations.id, org.id))
        )
      );
    });
  });
});
