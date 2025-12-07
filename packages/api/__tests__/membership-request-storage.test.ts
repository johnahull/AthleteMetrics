/**
 * Unit tests for membership request storage methods
 * Tests the core CRUD operations for membership requests
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, membershipRequests, userOrganizations, userTeams, teams, measurements } from "@shared/schema";
import { eq, and } from "drizzle-orm";

describe("Membership Request Storage", () => {
  // Test data identifiers
  const timestamp = Date.now().toString();
  const testSuffix = `_test_${timestamp}`;

  let testOrgId: string;
  let testUserId: string;
  let testAdminId: string;

  const TEST_ORG_NAME = `MembershipTest Org${testSuffix}`;
  const TEST_USER_EMAIL = `testathlete${testSuffix}@example.com`;
  const TEST_ADMIN_EMAIL = `testadmin${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for membership request testing",
      isActive: true,
      allowMembershipRequests: true,
      isPublicDirectory: true,
      autoApproveRequests: false,
    }).returning();
    testOrgId = org.id;

    // Create test user (athlete)
    const [user] = await db.insert(users).values({
      emails: [TEST_USER_EMAIL],
      username: `testathlete${testSuffix}`,
      firstName: "Test",
      lastName: "Athlete",
      fullName: "Test Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testUserId = user.id;

    // Create test admin
    const [admin] = await db.insert(users).values({
      emails: [TEST_ADMIN_EMAIL],
      username: `testadmin${testSuffix}`,
      firstName: "Test",
      lastName: "Admin",
      fullName: "Test Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testAdminId = admin.id;
  });

  afterEach(async () => {
    // Clean up membership requests after each test
    await db.delete(membershipRequests).where(
      eq(membershipRequests.organizationId, testOrgId)
    );
    // Also clean up user organizations (created when request is approved)
    await db.delete(userOrganizations).where(
      and(
        eq(userOrganizations.userId, testUserId),
        eq(userOrganizations.organizationId, testOrgId)
      )
    );
  });

  afterAll(async () => {
    // Clean up all test data
    await db.delete(membershipRequests).where(
      eq(membershipRequests.organizationId, testOrgId)
    );
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(users).where(eq(users.id, testAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("createMembershipRequest", () => {
    it("should create a pending membership request", async () => {
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      expect(request).toBeDefined();
      expect(request.userId).toBe(testUserId);
      expect(request.organizationId).toBe(testOrgId);
      expect(request.status).toBe("pending");
      expect(request.discoveryMethod).toBe("directory");
      expect(request.requestedRole).toBe("athlete");
    });

    it("should prevent duplicate pending requests", async () => {
      // Create first request
      await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // Try to create duplicate
      await expect(
        storage.createMembershipRequest({
          userId: testUserId,
          organizationId: testOrgId,
          discoveryMethod: "join_code"
        })
      ).rejects.toThrow();
    });
  });

  describe("getMembershipRequest", () => {
    it("should retrieve a membership request by ID", async () => {
      const created = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      const retrieved = await storage.getMembershipRequest(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      // getMembershipRequest returns plain request, not with relations
      expect(retrieved?.organizationId).toBe(testOrgId);
    });

    it("should return undefined for non-existent request", async () => {
      const result = await storage.getMembershipRequest("non-existent-id");
      expect(result).toBeUndefined();
    });
  });

  describe("getMembershipRequestsByUser", () => {
    it("should retrieve all requests for a user", async () => {
      await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      const requests = await storage.getMembershipRequestsByUser(testUserId);

      expect(requests).toHaveLength(1);
      expect(requests[0].userId).toBe(testUserId);
      expect(requests[0].organization).toBeDefined();
    });
  });

  describe("getMembershipRequestsByOrganization", () => {
    it("should retrieve pending requests for an organization", async () => {
      await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      const requests = await storage.getMembershipRequestsByOrganization(testOrgId, { status: "pending" });

      expect(requests).toHaveLength(1);
      expect(requests[0].organizationId).toBe(testOrgId);
      expect(requests[0].status).toBe("pending");
    });

    it("should filter by status", async () => {
      await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      const approvedRequests = await storage.getMembershipRequestsByOrganization(testOrgId, { status: "approved" });

      expect(approvedRequests).toHaveLength(0);
    });
  });

  describe("approveMembershipRequest", () => {
    it("should approve a pending request and create organization membership", async () => {
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      const approved = await storage.approveMembershipRequest(request.id, testAdminId);

      expect(approved.status).toBe("approved");
      expect(approved.processedBy).toBe(testAdminId);
      expect(approved.processedAt).toBeDefined();
    });

    it("should throw error for non-pending request", async () => {
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // Approve it first
      await storage.approveMembershipRequest(request.id, testAdminId);

      // Try to approve again
      await expect(
        storage.approveMembershipRequest(request.id, testAdminId)
      ).rejects.toThrow();
    });
  });

  describe("rejectMembershipRequest", () => {
    it("should reject a pending request with reason", async () => {
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      const rejected = await storage.rejectMembershipRequest(
        request.id,
        testAdminId,
        "Not meeting requirements"
      );

      expect(rejected.status).toBe("rejected");
      expect(rejected.processedBy).toBe(testAdminId);
      expect(rejected.rejectionReason).toBe("Not meeting requirements");
    });
  });

  describe("cancelMembershipRequest", () => {
    it("should allow user to cancel their own pending request", async () => {
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // cancelMembershipRequest returns void, so we verify by fetching again
      await storage.cancelMembershipRequest(request.id);

      const cancelled = await storage.getMembershipRequest(request.id);
      expect(cancelled?.status).toBe("cancelled");
    });
  });

  describe("hasPendingMembershipRequest", () => {
    it("should return true when user has pending request", async () => {
      await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      const hasPending = await storage.hasPendingMembershipRequest(testUserId, testOrgId);

      expect(hasPending).toBe(true);
    });

    it("should return false when no pending request exists", async () => {
      const hasPending = await storage.hasPendingMembershipRequest(testUserId, testOrgId);

      expect(hasPending).toBe(false);
    });
  });

  describe("getPublicOrganizations", () => {
    it("should return organizations with isPublicDirectory=true", async () => {
      const orgs = await storage.getPublicOrganizations();

      expect(Array.isArray(orgs)).toBe(true);
      // Our test org should be in the list
      const testOrg = orgs.find(o => o.id === testOrgId);
      expect(testOrg).toBeDefined();
      expect(testOrg?.name).toBe(TEST_ORG_NAME);
    });

    it("should filter by search query", async () => {
      const orgs = await storage.getPublicOrganizations({ search: "MembershipTest" });

      const testOrg = orgs.find(o => o.id === testOrgId);
      expect(testOrg).toBeDefined();
    });
  });

  describe("getOrganizationByJoinCode", () => {
    it("should return organization when valid join code provided", async () => {
      // First get the org's join code
      const [org] = await db.select().from(organizations).where(eq(organizations.id, testOrgId));

      if (org.joinCode) {
        const result = await storage.getOrganizationByJoinCode(org.joinCode);
        expect(result).toBeDefined();
        expect(result?.id).toBe(testOrgId);
      }
    });

    it("should return undefined for invalid join code", async () => {
      const result = await storage.getOrganizationByJoinCode("INVALID123");
      expect(result).toBeUndefined();
    });
  });

  describe("regenerateJoinCode", () => {
    it("should generate a new join code for organization", async () => {
      // Get current join code
      const [orgBefore] = await db.select().from(organizations).where(eq(organizations.id, testOrgId));
      const oldCode = orgBefore.joinCode;

      // Regenerate
      const newCode = await storage.regenerateJoinCode(testOrgId);

      expect(newCode).toBeDefined();
      expect(newCode).not.toBe(oldCode);
      expect(newCode.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("updateOrganizationMembershipSettings", () => {
    it("should update membership settings", async () => {
      const updated = await storage.updateOrganizationMembershipSettings(testOrgId, {
        allowMembershipRequests: false,
        isPublicDirectory: false,
        autoApproveRequests: true,
      });

      expect(updated.allowMembershipRequests).toBe(false);
      expect(updated.isPublicDirectory).toBe(false);
      expect(updated.autoApproveRequests).toBe(true);

      // Reset for other tests
      await storage.updateOrganizationMembershipSettings(testOrgId, {
        allowMembershipRequests: true,
        isPublicDirectory: true,
        autoApproveRequests: false,
      });
    });
  });

  describe("getUnlinkedAthletes", () => {
    let unlinkedAthleteId: string;
    let linkedAthleteId: string;

    beforeAll(async () => {
      // Create an "unlinked" athlete (no password, no OAuth)
      // Note: omit password/googleId/appleId fields - they default to null
      const [unlinkedAthlete] = await db.insert(users).values({
        username: `unlinked_athlete${testSuffix}`,
        firstName: "Unlinked",
        lastName: "Athlete",
        fullName: "Unlinked Athlete",
        isActive: true,
      }).returning();
      unlinkedAthleteId = unlinkedAthlete.id;

      // Add unlinked athlete to organization
      await db.insert(userOrganizations).values({
        userId: unlinkedAthleteId,
        organizationId: testOrgId,
        role: "athlete",
      });

      // Create a "linked" athlete (has password)
      const [linkedAthlete] = await db.insert(users).values({
        username: `linked_athlete${testSuffix}`,
        firstName: "Linked",
        lastName: "Athlete",
        fullName: "Linked Athlete",
        password: "hashedpassword123",
        isActive: true,
      }).returning();
      linkedAthleteId = linkedAthlete.id;

      // Add linked athlete to organization
      await db.insert(userOrganizations).values({
        userId: linkedAthleteId,
        organizationId: testOrgId,
        role: "athlete",
      });
    });

    afterAll(async () => {
      // Clean up
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, unlinkedAthleteId));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, linkedAthleteId));
      await db.delete(users).where(eq(users.id, unlinkedAthleteId));
      await db.delete(users).where(eq(users.id, linkedAthleteId));
    });

    it("should return athletes without login credentials", async () => {
      const unlinkedAthletes = await storage.getUnlinkedAthletes(testOrgId);

      // Should include the unlinked athlete
      const foundUnlinked = unlinkedAthletes.find(a => a.id === unlinkedAthleteId);
      expect(foundUnlinked).toBeDefined();
      expect(foundUnlinked?.fullName).toBe("Unlinked Athlete");
    });

    it("should NOT return athletes with password", async () => {
      const unlinkedAthletes = await storage.getUnlinkedAthletes(testOrgId);

      // Should NOT include the linked athlete (has password)
      const foundLinked = unlinkedAthletes.find(a => a.id === linkedAthleteId);
      expect(foundLinked).toBeUndefined();
    });

    it("should NOT return coaches or admins", async () => {
      const unlinkedAthletes = await storage.getUnlinkedAthletes(testOrgId);

      // Should NOT include the test admin
      const foundAdmin = unlinkedAthletes.find(a => a.id === testAdminId);
      expect(foundAdmin).toBeUndefined();
    });
  });

  describe("approveMembershipRequest with athlete linking", () => {
    let existingAthleteId: string;
    let testTeamId: string;
    let existingMeasurementId: string;

    beforeAll(async () => {
      // Create an existing athlete (no password - to be linked)
      // Note: omit password field - it defaults to null
      const [existingAthlete] = await db.insert(users).values({
        username: `existing_athlete${testSuffix}`,
        firstName: "Existing",
        lastName: "Athlete",
        fullName: "Existing Athlete",
        birthYear: 2005,
        school: "Test High School",
        isActive: true,
      }).returning();
      existingAthleteId = existingAthlete.id;

      // Add existing athlete to organization
      await db.insert(userOrganizations).values({
        userId: existingAthleteId,
        organizationId: testOrgId,
        role: "athlete",
      });

      // Create a test team
      const [team] = await db.insert(teams).values({
        name: `Test Team${testSuffix}`,
        organizationId: testOrgId,
        isActive: true,
      }).returning();
      testTeamId = team.id;

      // Add existing athlete to team
      await db.insert(userTeams).values({
        userId: existingAthleteId,
        teamId: testTeamId,
        isActive: true,
      });

      // Create a measurement for the existing athlete
      const [measurement] = await db.insert(measurements).values({
        userId: existingAthleteId,
        organizationId: testOrgId,
        metric: "FLY10_TIME",
        value: "1.25",
        date: new Date().toISOString().split('T')[0],
        submittedBy: testAdminId, // Required field - who recorded the measurement
        age: 19, // Required field - athlete's age at time of measurement
        units: "s", // Required field - seconds for FLY10_TIME
      }).returning();
      existingMeasurementId = measurement.id;
    });

    afterEach(async () => {
      // Clean up membership requests
      await db.delete(membershipRequests).where(
        eq(membershipRequests.organizationId, testOrgId)
      );
      // Clean up user organizations for test user
      await db.delete(userOrganizations).where(
        and(
          eq(userOrganizations.userId, testUserId),
          eq(userOrganizations.organizationId, testOrgId)
        )
      );
      // Reset test user's profile data (may have been copied from existing athlete)
      await db.update(users)
        .set({ birthYear: null, school: null })
        .where(eq(users.id, testUserId));
      // Clean up transferred team memberships for test user
      await db.delete(userTeams)
        .where(eq(userTeams.userId, testUserId))
        .catch(() => {});
      // Re-activate existing athlete if it was deactivated
      await db.update(users)
        .set({ isActive: true })
        .where(eq(users.id, existingAthleteId));
      // Re-add existing athlete to org if removed
      const [existingOrgMembership] = await db.select()
        .from(userOrganizations)
        .where(and(
          eq(userOrganizations.userId, existingAthleteId),
          eq(userOrganizations.organizationId, testOrgId)
        ));
      if (!existingOrgMembership) {
        await db.insert(userOrganizations).values({
          userId: existingAthleteId,
          organizationId: testOrgId,
          role: "athlete",
        });
      }
      // Re-add existing athlete team membership if removed
      const [existingTeamMembership] = await db.select()
        .from(userTeams)
        .where(and(
          eq(userTeams.userId, existingAthleteId),
          eq(userTeams.teamId, testTeamId)
        ));
      if (!existingTeamMembership) {
        await db.insert(userTeams).values({
          userId: existingAthleteId,
          teamId: testTeamId,
          isActive: true,
        });
      }
      // Reset measurement to existing athlete if it was transferred
      await db.update(measurements)
        .set({ userId: existingAthleteId })
        .where(eq(measurements.id, existingMeasurementId));
    });

    afterAll(async () => {
      // Clean up in reverse order of dependencies:
      // 1. Measurements (may reference users)
      await db.delete(measurements).where(eq(measurements.id, existingMeasurementId)).catch(() => {});
      // 2. User teams (references users and teams)
      await db.delete(userTeams).where(eq(userTeams.teamId, testTeamId)).catch(() => {});
      // Clean up any transferred team memberships for test user
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId)).catch(() => {});
      // 3. Team (references organization)
      await db.delete(teams).where(eq(teams.id, testTeamId)).catch(() => {});
      // 4. User organizations for existing athlete
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, existingAthleteId)).catch(() => {});
      // 5. Existing athlete user record
      await db.delete(users).where(eq(users.id, existingAthleteId)).catch(() => {});
    });

    it("should transfer measurements from existing athlete to requester when linking", async () => {
      // Create membership request
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // Approve with linking to existing athlete
      await storage.approveMembershipRequest(request.id, testAdminId, existingAthleteId);

      // Verify measurement was transferred to requester
      const [measurement] = await db.select()
        .from(measurements)
        .where(eq(measurements.id, existingMeasurementId));

      expect(measurement.userId).toBe(testUserId);
    });

    it("should transfer team memberships from existing athlete to requester when linking", async () => {
      // Create membership request
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // Approve with linking to existing athlete
      await storage.approveMembershipRequest(request.id, testAdminId, existingAthleteId);

      // Verify team membership was transferred to requester
      const requesterTeams = await db.select()
        .from(userTeams)
        .where(eq(userTeams.userId, testUserId));

      const hasTeam = requesterTeams.some(t => t.teamId === testTeamId);
      expect(hasTeam).toBe(true);
    });

    it("should copy profile data from existing athlete to requester if missing", async () => {
      // Verify requester doesn't have birthYear initially
      const [requesterBefore] = await db.select().from(users).where(eq(users.id, testUserId));
      expect(requesterBefore.birthYear).toBeNull();

      // Create membership request
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // Approve with linking to existing athlete
      await storage.approveMembershipRequest(request.id, testAdminId, existingAthleteId);

      // Verify profile data was copied
      const [requesterAfter] = await db.select().from(users).where(eq(users.id, testUserId));
      expect(requesterAfter.birthYear).toBe(2005);
      expect(requesterAfter.school).toBe("Test High School");
    });

    it("should deactivate the existing athlete after linking", async () => {
      // Create membership request
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // Approve with linking to existing athlete
      await storage.approveMembershipRequest(request.id, testAdminId, existingAthleteId);

      // Verify existing athlete is deactivated
      const [existingAthlete] = await db.select()
        .from(users)
        .where(eq(users.id, existingAthleteId));

      expect(existingAthlete.isActive).toBe(false);
    });

    it("should add requester to organization when linking", async () => {
      // Create membership request
      const request = await storage.createMembershipRequest({
        userId: testUserId,
        organizationId: testOrgId,
        discoveryMethod: "directory"
      });

      // Approve with linking to existing athlete
      await storage.approveMembershipRequest(request.id, testAdminId, existingAthleteId);

      // Verify requester is now in organization
      const [membership] = await db.select()
        .from(userOrganizations)
        .where(and(
          eq(userOrganizations.userId, testUserId),
          eq(userOrganizations.organizationId, testOrgId)
        ));

      expect(membership).toBeDefined();
      expect(membership.role).toBe("athlete");
    });
  });
});
