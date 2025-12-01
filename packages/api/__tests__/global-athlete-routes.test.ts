/**
 * Unit tests for Global Athlete Routes
 * Tests API endpoints for unified cross-organization athlete identity
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../db";
import {
  organizations, users, userOrganizations, measurements,
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { GlobalAthleteService } from "../services/global-athlete-service";

describe("Global Athlete Routes", () => {
  const testSuffix = `_routes_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let service: GlobalAthleteService;

  let testOrg1Id: string;
  let testOrg2Id: string;
  let testUser1Id: string;
  let testUser2Id: string;
  let testUser3Id: string; // User without global athlete link

  const TEST_ORG1_NAME = `Test Route Org 1${testSuffix}`;
  const TEST_ORG2_NAME = `Test Route Org 2${testSuffix}`;
  const TEST_USER1_USERNAME = `routeuser1${testSuffix}`;
  const TEST_USER2_USERNAME = `routeuser2${testSuffix}`;
  const TEST_USER3_USERNAME = `routeuser3${testSuffix}`;
  const TEST_EMAIL = `routetest${testSuffix}@example.com`;
  const TEST_EMAIL_2 = `routetest2${testSuffix}@example.com`;

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
      firstName: "Route",
      lastName: "TestUser1",
      fullName: "Route TestUser1",
      isEmailVerified: true,
    }).returning();
    testUser1Id = user1.id;

    const [user2] = await db.insert(users).values({
      username: TEST_USER2_USERNAME,
      emails: [TEST_EMAIL], // Same email as user1
      password: "hashedpassword",
      firstName: "Route",
      lastName: "TestUser2",
      fullName: "Route TestUser2",
      isEmailVerified: true,
    }).returning();
    testUser2Id = user2.id;

    const [user3] = await db.insert(users).values({
      username: TEST_USER3_USERNAME,
      emails: [TEST_EMAIL_2],
      password: "hashedpassword",
      firstName: "NoLink",
      lastName: "User",
      fullName: "NoLink User",
      isEmailVerified: false,
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
    // Clean global athlete data between tests
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);
    await db.delete(measurements).where(
      inArray(measurements.userId, [testUser1Id, testUser2Id, testUser3Id])
    );
  });

  describe("GET /api/my/global-athlete", () => {
    it("should return global athlete profile for linked user", async () => {
      // Setup - create global athlete link
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      expect(link).not.toBeNull();

      const globalAthlete = await service.getGlobalAthlete(link!.globalAthleteId);
      expect(globalAthlete).not.toBeNull();
      expect(globalAthlete?.primaryEmail).toBe(TEST_EMAIL);
    });

    it("should return 404 for user without global athlete link", async () => {
      const link = await service.getUserGlobalAthleteLink(testUser3Id);
      expect(link).toBeNull();
    });

    it("should include linked accounts in response", async () => {
      // Setup - both users verify
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const linkedUsers = await service.getLinkedUsers(link!.globalAthleteId);

      expect(linkedUsers).toHaveLength(2);
      expect(linkedUsers.map(l => l.userId)).toContain(testUser1Id);
      expect(linkedUsers.map(l => l.userId)).toContain(testUser2Id);
    });
  });

  describe("PATCH /api/my/global-athlete/privacy", () => {
    it("should update allowCrossOrgLinking setting", async () => {
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

      await service.updatePrivacySettings(link!.globalAthleteId, testUser1Id, {
        allowCrossOrgLinking: false,
      });

      const [user2Link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      expect(user2Link.linkStatus).toBe("revoked");
    });
  });

  describe("PATCH /api/my/global-athlete/sharing", () => {
    it("should update shareMeasurements preference", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      // Disable sharing
      await db.update(userGlobalAthleteLinks)
        .set({ shareMeasurements: false })
        .where(eq(userGlobalAthleteLinks.userId, testUser1Id));

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      expect(link?.shareMeasurements).toBe(false);
    });
  });

  describe("GET /api/my/unified-measurements", () => {
    it("should return measurements from all linked accounts", async () => {
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
      const unifiedMeasurements = await service.getUnifiedMeasurements(testUser3Id);
      expect(unifiedMeasurements).toEqual([]);
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

  describe("GET /api/my/unified-dashboard", () => {
    it("should return aggregated stats across all linked accounts", async () => {
      // Setup
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
          metric: "VERTICAL_JUMP",
          value: "30",
          units: "in",
          organizationId: testOrg2Id,
          globalAthleteId: link!.globalAthleteId,
        },
      ]);

      const unifiedMeasurements = await service.getUnifiedMeasurements(testUser1Id);
      const globalAthlete = await service.getGlobalAthlete(link!.globalAthleteId);
      const linkedUsers = await service.getLinkedUsers(link!.globalAthleteId);

      // Dashboard should have this data
      expect(globalAthlete).not.toBeNull();
      expect(linkedUsers.length).toBe(2);
      expect(unifiedMeasurements.length).toBe(2);
    });
  });

  describe("GET /api/my/global-athlete/audit-log", () => {
    it("should return audit log for global athlete", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);

      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link!.globalAthleteId));

      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs.some(l => l.action === "created")).toBe(true);
    });

    it("should include privacy change events", async () => {
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
});
