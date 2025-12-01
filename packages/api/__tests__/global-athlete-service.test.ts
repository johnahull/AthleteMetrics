/**
 * Unit tests for GlobalAthleteService
 * Tests auto-linking, link management, and unified measurement queries
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../db";
import {
  organizations, users, userOrganizations, measurements,
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { GlobalAthleteService } from "../services/global-athlete-service";

describe("GlobalAthleteService", () => {
  const testSuffix = `_svc_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let service: GlobalAthleteService;

  let testOrg1Id: string;
  let testOrg2Id: string;
  let testUser1Id: string;
  let testUser2Id: string;
  let testUser3Id: string; // User without email verification

  const TEST_ORG1_NAME = `Test Svc Org 1${testSuffix}`;
  const TEST_ORG2_NAME = `Test Svc Org 2${testSuffix}`;
  const TEST_USER1_USERNAME = `svcuser1${testSuffix}`;
  const TEST_USER2_USERNAME = `svcuser2${testSuffix}`;
  const TEST_USER3_USERNAME = `svcuser3${testSuffix}`;
  const TEST_EMAIL = `svctest${testSuffix}@example.com`;
  const TEST_EMAIL_2 = `svctest2${testSuffix}@example.com`;

  beforeAll(async () => {
    service = new GlobalAthleteService();

    // Create test organizations
    const [org1] = await db.insert(organizations).values({
      name: TEST_ORG1_NAME,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrg1Id = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: TEST_ORG2_NAME,
      orgType: "college",
      isActive: true,
    }).returning();
    testOrg2Id = org2.id;

    // Create test users
    const [user1] = await db.insert(users).values({
      username: TEST_USER1_USERNAME,
      emails: [TEST_EMAIL],
      password: "hashedpassword",
      firstName: "Service",
      lastName: "TestUser1",
      fullName: "Service TestUser1",
      isEmailVerified: true,
    }).returning();
    testUser1Id = user1.id;

    const [user2] = await db.insert(users).values({
      username: TEST_USER2_USERNAME,
      emails: [TEST_EMAIL], // Same email as user1 - same real person
      password: "hashedpassword",
      firstName: "Service",
      lastName: "TestUser2",
      fullName: "Service TestUser2",
      isEmailVerified: true,
    }).returning();
    testUser2Id = user2.id;

    const [user3] = await db.insert(users).values({
      username: TEST_USER3_USERNAME,
      emails: [TEST_EMAIL_2],
      password: "hashedpassword",
      firstName: "Unverified",
      lastName: "User",
      fullName: "Unverified User",
      isEmailVerified: false, // Not verified
    }).returning();
    testUser3Id = user3.id;

    // Add users to organizations
    await db.insert(userOrganizations).values([
      { userId: testUser1Id, organizationId: testOrg1Id, role: "athlete" },
      { userId: testUser2Id, organizationId: testOrg2Id, role: "athlete" },
      { userId: testUser3Id, organizationId: testOrg1Id, role: "athlete" },
    ]);
  });

  afterAll(async () => {
    // Clean up in reverse order
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);
    await db.delete(measurements).where(
      inArray(measurements.userId, [testUser1Id, testUser2Id, testUser3Id])
    );
    await db.delete(userOrganizations).where(
      inArray(userOrganizations.userId, [testUser1Id, testUser2Id, testUser3Id])
    );
    await db.delete(users).where(
      inArray(users.id, [testUser1Id, testUser2Id, testUser3Id])
    );
    await db.delete(organizations).where(
      inArray(organizations.id, [testOrg1Id, testOrg2Id])
    );
  });

  beforeEach(async () => {
    // Clean global athlete data
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);
    await db.delete(measurements).where(
      inArray(measurements.userId, [testUser1Id, testUser2Id, testUser3Id])
    );
  });

  describe("onEmailVerified - Auto-Linking Flow", () => {
    it("should create global athlete when no existing match found", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      // Should have created a global athlete
      const [globalAthlete] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.primaryEmail, TEST_EMAIL));

      expect(globalAthlete).toBeDefined();
      expect(globalAthlete.canonicalFirstName).toBe("Service");
      expect(globalAthlete.canonicalLastName).toBe("TestUser1");
      expect(globalAthlete.verifiedEmails).toContain(TEST_EMAIL);

      // Should have created a confirmed link
      const [link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser1Id));

      expect(link).toBeDefined();
      expect(link.linkStatus).toBe("confirmed");
      expect(link.linkType).toBe("auto_email");
      expect(link.globalAthleteId).toBe(globalAthlete.id);
    });

    it("should auto-link to existing global athlete when email matches", async () => {
      // First user verifies email - creates global athlete
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const [globalAthlete] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.primaryEmail, TEST_EMAIL));

      // Second user (same email) verifies - should auto-link
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      // Should NOT create a new global athlete
      const allGlobalAthletes = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.primaryEmail, TEST_EMAIL));
      expect(allGlobalAthletes).toHaveLength(1);

      // Should have created a link for user2
      const [link2] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      expect(link2).toBeDefined();
      expect(link2.globalAthleteId).toBe(globalAthlete.id);
      expect(link2.linkStatus).toBe("confirmed");
      expect(link2.linkType).toBe("auto_email");
    });

    it("should not auto-link when global athlete has disabled cross-org linking", async () => {
      // First user verifies email
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      // Disable cross-org linking
      await db.update(globalAthletes)
        .set({ allowCrossOrgLinking: false })
        .where(eq(globalAthletes.primaryEmail, TEST_EMAIL));

      // Second user verifies - should create separate global athlete
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      // Should have two global athletes now
      const allGlobalAthletes = await db.select().from(globalAthletes);
      expect(allGlobalAthletes).toHaveLength(2);
    });

    it("should not create duplicate links for same user", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser1Id, TEST_EMAIL); // Call again

      const links = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser1Id));

      expect(links).toHaveLength(1);
    });

    it("should create audit log entries", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const [globalAthlete] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.primaryEmail, TEST_EMAIL));

      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, globalAthlete.id));

      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.some(l => l.action === "created")).toBe(true);
    });
  });

  describe("getUserGlobalAthleteLink", () => {
    it("should return link for user with global athlete", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);

      expect(link).toBeDefined();
      expect(link?.userId).toBe(testUser1Id);
      expect(link?.linkStatus).toBe("confirmed");
    });

    it("should return null for user without global athlete", async () => {
      const link = await service.getUserGlobalAthleteLink(testUser3Id);

      expect(link).toBeNull();
    });
  });

  describe("getGlobalAthlete", () => {
    it("should return global athlete by ID", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const globalAthlete = await service.getGlobalAthlete(link!.globalAthleteId);

      expect(globalAthlete).toBeDefined();
      expect(globalAthlete?.primaryEmail).toBe(TEST_EMAIL);
    });
  });

  describe("getLinkedUsers", () => {
    it("should return all confirmed linked users for global athlete", async () => {
      // Both users verify
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const linkedUsers = await service.getLinkedUsers(link!.globalAthleteId);

      expect(linkedUsers).toHaveLength(2);
      expect(linkedUsers.map(l => l.userId)).toContain(testUser1Id);
      expect(linkedUsers.map(l => l.userId)).toContain(testUser2Id);
    });

    it("should filter by shareMeasurements when requested", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      // Disable sharing for user2
      await db.update(userGlobalAthleteLinks)
        .set({ shareMeasurements: false })
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const sharingUsers = await service.getLinkedUsers(link!.globalAthleteId, { shareMeasurementsOnly: true });

      expect(sharingUsers).toHaveLength(1);
      expect(sharingUsers[0].userId).toBe(testUser1Id);
    });
  });

  describe("getUnifiedMeasurements", () => {
    it("should return measurements from all linked users", async () => {
      // Setup global athlete links
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);

      // Create measurements for both users
      await db.insert(measurements).values([
        {
          userId: testUser1Id,
          submittedBy: testUser1Id,
          date: "2024-01-15",
          age: 18,
          metric: "FLY10_TIME",
          value: "1.45",
          units: "s",
          organizationId: testOrg1Id,
          globalAthleteId: link!.globalAthleteId,
        },
        {
          userId: testUser2Id,
          submittedBy: testUser2Id,
          date: "2024-02-20",
          age: 18,
          metric: "FLY10_TIME",
          value: "1.42",
          units: "s",
          organizationId: testOrg2Id,
          globalAthleteId: link!.globalAthleteId,
        },
      ]);

      const unifiedMeasurements = await service.getUnifiedMeasurements(testUser1Id);

      expect(unifiedMeasurements).toHaveLength(2);
      expect(unifiedMeasurements.map(m => m.organizationId)).toContain(testOrg1Id);
      expect(unifiedMeasurements.map(m => m.organizationId)).toContain(testOrg2Id);
    });

    it("should return empty array for user without global athlete", async () => {
      const measurements = await service.getUnifiedMeasurements(testUser3Id);

      expect(measurements).toEqual([]);
    });

    it("should respect shareMeasurements preference", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);

      // Create measurements
      await db.insert(measurements).values([
        {
          userId: testUser1Id,
          submittedBy: testUser1Id,
          date: "2024-01-15",
          age: 18,
          metric: "VERTICAL_JUMP",
          value: "28",
          units: "in",
          organizationId: testOrg1Id,
          globalAthleteId: link!.globalAthleteId,
        },
        {
          userId: testUser2Id,
          submittedBy: testUser2Id,
          date: "2024-02-20",
          age: 18,
          metric: "VERTICAL_JUMP",
          value: "30",
          units: "in",
          organizationId: testOrg2Id,
          globalAthleteId: link!.globalAthleteId,
        },
      ]);

      // Disable sharing for user2
      await db.update(userGlobalAthleteLinks)
        .set({ shareMeasurements: false })
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      const unifiedMeasurements = await service.getUnifiedMeasurements(testUser1Id);

      // Should only see user1's measurement
      expect(unifiedMeasurements).toHaveLength(1);
      expect(unifiedMeasurements[0].userId).toBe(testUser1Id);
    });
  });

  describe("updatePrivacySettings", () => {
    it("should update allowCrossOrgLinking preference", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      await service.updatePrivacySettings(link!.globalAthleteId, testUser1Id, {
        allowCrossOrgLinking: false,
      });

      const [updated] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.id, link!.globalAthleteId));

      expect(updated.allowCrossOrgLinking).toBe(false);
    });

    it("should revoke other links when disabling cross-org linking", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);

      // User1 disables cross-org linking
      await service.updatePrivacySettings(link!.globalAthleteId, testUser1Id, {
        allowCrossOrgLinking: false,
      });

      // User2's link should be revoked
      const [user2Link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      expect(user2Link.linkStatus).toBe("revoked");
    });

    it("should create audit log for privacy change", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      await service.updatePrivacySettings(link!.globalAthleteId, testUser1Id, {
        allowCrossOrgLinking: false,
      });

      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link!.globalAthleteId));

      expect(logs.some(l => l.action === "privacy_changed")).toBe(true);
    });
  });

  describe("backfillMeasurements", () => {
    it("should update measurements with globalAthleteId", async () => {
      // Create measurement before global athlete link exists
      await db.insert(measurements).values({
        userId: testUser1Id,
        submittedBy: testUser1Id,
        date: "2024-01-10",
        age: 18,
        metric: "DASH_40YD",
        value: "4.8",
        units: "s",
        organizationId: testOrg1Id,
      });

      // Verify email - should trigger backfill
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const [measurement] = await db.select()
        .from(measurements)
        .where(eq(measurements.userId, testUser1Id));

      expect(measurement.globalAthleteId).toBe(link!.globalAthleteId);
    });
  });
});
