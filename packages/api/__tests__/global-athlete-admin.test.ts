/**
 * Unit tests for Global Athlete Admin Features
 * Tests site admin ability to view and manage global athlete links
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "../db";
import {
  organizations, users, userOrganizations,
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog
} from "@shared/schema";
import { eq, inArray, desc, count } from "drizzle-orm";
import { GlobalAthleteService } from "../services/global-athlete-service";

describe("Global Athlete Admin Features", () => {
  const testSuffix = `_admin_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let service: GlobalAthleteService;

  let testOrg1Id: string;
  let testOrg2Id: string;
  let testUser1Id: string;
  let testUser2Id: string;
  let testSiteAdminId: string;
  let globalAthleteId: string;

  const TEST_ORG1_NAME = `Test Admin Org 1${testSuffix}`;
  const TEST_ORG2_NAME = `Test Admin Org 2${testSuffix}`;
  const TEST_USER1_USERNAME = `adminuser1${testSuffix}`;
  const TEST_USER2_USERNAME = `adminuser2${testSuffix}`;
  const TEST_SITE_ADMIN_USERNAME = `siteadmin${testSuffix}`;
  const TEST_EMAIL_1 = `admintest1${testSuffix}@example.com`;
  const TEST_EMAIL_2 = `admintest2${testSuffix}@example.com`;

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
      emails: [TEST_EMAIL_1],
      password: "hashedpassword",
      firstName: "AdminTest",
      lastName: "User1",
      fullName: "AdminTest User1",
      isEmailVerified: true,
    }).returning();
    testUser1Id = user1.id;

    const [user2] = await db.insert(users).values({
      username: TEST_USER2_USERNAME,
      emails: [TEST_EMAIL_2],
      password: "hashedpassword",
      firstName: "AdminTest",
      lastName: "User2",
      fullName: "AdminTest User2",
      isEmailVerified: true,
    }).returning();
    testUser2Id = user2.id;

    // Create site admin user
    const [siteAdmin] = await db.insert(users).values({
      username: TEST_SITE_ADMIN_USERNAME,
      emails: [`siteadmin${testSuffix}@example.com`],
      password: "hashedpassword",
      firstName: "Site",
      lastName: "Admin",
      fullName: "Site Admin",
      isSiteAdmin: true,
    }).returning();
    testSiteAdminId = siteAdmin.id;

    // Add users to organizations
    await db.insert(userOrganizations).values([
      { userId: testUser1Id, organizationId: testOrg1Id, role: "athlete" },
      { userId: testUser2Id, organizationId: testOrg2Id, role: "athlete" },
    ]);
  });

  afterAll(async () => {
    // Clean up in reverse order
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);
    await db.delete(userOrganizations).where(
      inArray(userOrganizations.userId, [testUser1Id, testUser2Id])
    );
    await db.delete(users).where(
      inArray(users.id, [testUser1Id, testUser2Id, testSiteAdminId])
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
  });

  describe("List All Global Athletes (Admin)", () => {
    it("should return all global athletes with linked user counts", async () => {
      // Create global athletes for both users
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL_2);

      // Get all global athletes (admin service method)
      const result = await service.getAllGlobalAthletes();

      expect(result).toBeDefined();
      expect(result.athletes).toBeDefined();
      expect(Array.isArray(result.athletes)).toBe(true);
      expect(result.athletes.length).toBeGreaterThanOrEqual(2);
      expect(result.totalCount).toBeGreaterThanOrEqual(2);

      // Find our test athletes
      const athlete1 = result.athletes.find(a => a.primaryEmail === TEST_EMAIL_1);
      const athlete2 = result.athletes.find(a => a.primaryEmail === TEST_EMAIL_2);

      expect(athlete1).toBeDefined();
      expect(athlete2).toBeDefined();
      expect(athlete1!.linkedUserCount).toBe(1);
      expect(athlete2!.linkedUserCount).toBe(1);
    });

    it("should support pagination", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL_2);

      const page1 = await service.getAllGlobalAthletes({ limit: 1, offset: 0 });
      const page2 = await service.getAllGlobalAthletes({ limit: 1, offset: 1 });

      expect(page1.athletes.length).toBe(1);
      expect(page2.athletes.length).toBe(1);
      // totalCount should reflect all athletes, not just the page
      expect(page1.totalCount).toBeGreaterThanOrEqual(2);
      expect(page2.totalCount).toBeGreaterThanOrEqual(2);
      // IDs should be different
      expect(page1.athletes[0].id).not.toBe(page2.athletes[0].id);
    });

    it("should support search by name or email", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL_2);

      // Search by email
      const searchByEmail = await service.getAllGlobalAthletes({ search: TEST_EMAIL_1 });
      expect(searchByEmail.athletes.length).toBeGreaterThanOrEqual(1);
      expect(searchByEmail.athletes.some(a => a.primaryEmail === TEST_EMAIL_1)).toBe(true);

      // Search by name
      const searchByName = await service.getAllGlobalAthletes({ search: "AdminTest User1" });
      expect(searchByName.athletes.length).toBeGreaterThanOrEqual(1);
    });

    it("should escape SQL LIKE wildcards in search to prevent injection", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL_2);

      // Search with SQL LIKE wildcards - should NOT match everything
      // If wildcards weren't escaped, "%%" would match all records
      // Note: Search requires min 2 characters, so we use "%%" instead of "%"
      const searchWithPercent = await service.getAllGlobalAthletes({ search: "%%" });
      // Should return 0 results since no email/name literally contains "%%"
      // or at most match records that happen to contain "%%" in their name/email
      expect(searchWithPercent.athletes.every(a =>
        a.primaryEmail?.includes("%%") || a.canonicalFullName?.includes("%%")
      )).toBe(true);

      // Search with underscore wildcard (min 2 chars)
      const searchWithUnderscore = await service.getAllGlobalAthletes({ search: "__" });
      expect(searchWithUnderscore.athletes.every(a =>
        a.primaryEmail?.includes("__") || a.canonicalFullName?.includes("__")
      )).toBe(true);

      // Search with backslash (min 2 chars)
      const searchWithBackslash = await service.getAllGlobalAthletes({ search: "\\\\" });
      expect(searchWithBackslash.athletes.every(a =>
        a.primaryEmail?.includes("\\\\") || a.canonicalFullName?.includes("\\\\")
      )).toBe(true);
    });
  });

  describe("Get Global Athlete Details (Admin)", () => {
    it("should return full global athlete details including linked users", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      expect(link).toBeDefined();

      const details = await service.getGlobalAthleteDetails(link!.globalAthleteId);

      expect(details).toBeDefined();
      expect(details!.globalAthlete.primaryEmail).toBe(TEST_EMAIL_1);
      expect(details!.linkedUsers).toHaveLength(1);
      expect(details!.linkedUsers[0].userId).toBe(testUser1Id);
    });

    it("should include organization information for linked users", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const details = await service.getGlobalAthleteDetails(link!.globalAthleteId);

      expect(details!.linkedUsers[0].organizations).toBeDefined();
      expect(details!.linkedUsers[0].organizations.length).toBeGreaterThanOrEqual(1);
      expect(details!.linkedUsers[0].organizations[0].name).toBe(TEST_ORG1_NAME);
    });

    it("should include audit log in details", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const details = await service.getGlobalAthleteDetails(link!.globalAthleteId);

      expect(details!.auditLog).toBeDefined();
      expect(details!.auditLog.length).toBeGreaterThan(0);
      expect(details!.auditLog.some(log => log.action === "created")).toBe(true);
    });
  });

  describe("Admin Force Unlink", () => {
    it("should allow admin to force unlink a user from global athlete", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      expect(link).toBeDefined();

      // Admin force unlink
      await service.adminForceUnlink(link!.globalAthleteId, testUser1Id, testSiteAdminId);

      // Verify unlinked
      const linkAfter = await service.getUserGlobalAthleteLink(testUser1Id);
      expect(linkAfter).toBeNull();
    });

    it("should create audit log entry for admin force unlink", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      await service.adminForceUnlink(link!.globalAthleteId, testUser1Id, testSiteAdminId);

      // Check audit log
      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link!.globalAthleteId))
        .orderBy(desc(globalAthleteAuditLog.createdAt));

      expect(logs.some(l => l.action === "admin_force_unlink")).toBe(true);
      const unlinkLog = logs.find(l => l.action === "admin_force_unlink");
      expect(unlinkLog!.actorType).toBe("site_admin");
      expect(unlinkLog!.actorId).toBe(testSiteAdminId);
    });
  });

  describe("Admin Toggle Cross-Org Linking", () => {
    it("should allow admin to toggle cross-org linking for a global athlete", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      let globalAthlete = await service.getGlobalAthlete(link!.globalAthleteId);
      expect(globalAthlete!.allowCrossOrgLinking).toBe(true);

      // Admin disable cross-org linking
      await service.adminUpdatePrivacySettings(link!.globalAthleteId, testSiteAdminId, {
        allowCrossOrgLinking: false,
      });

      globalAthlete = await service.getGlobalAthlete(link!.globalAthleteId);
      expect(globalAthlete!.allowCrossOrgLinking).toBe(false);
    });

    it("should create audit log entry for admin privacy change", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      await service.adminUpdatePrivacySettings(link!.globalAthleteId, testSiteAdminId, {
        allowCrossOrgLinking: false,
      });

      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link!.globalAthleteId))
        .orderBy(desc(globalAthleteAuditLog.createdAt));

      expect(logs.some(l => l.action === "admin_privacy_changed")).toBe(true);
      const privacyLog = logs.find(l => l.action === "admin_privacy_changed");
      expect(privacyLog!.actorType).toBe("site_admin");
    });
  });

  describe("Get Global Athlete Stats (Admin Dashboard)", () => {
    it("should return aggregate statistics for admin dashboard", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL_2);

      const stats = await service.getGlobalAthleteStats();

      expect(stats).toBeDefined();
      expect(stats.totalGlobalAthletes).toBeGreaterThanOrEqual(2);
      expect(stats.totalLinkedUsers).toBeGreaterThanOrEqual(2);
      expect(stats.athletesWithMultipleLinks).toBeGreaterThanOrEqual(0);
      expect(stats.recentLinkCount).toBeGreaterThanOrEqual(0);
    });
  });
});
