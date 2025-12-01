/**
 * Unit tests for Global Athlete storage methods
 * Tests the core business logic for cross-organization athlete linking
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { db } from "../db";
import {
  organizations, users, userOrganizations, measurements,
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

describe("Global Athlete Storage", () => {
  // Test data identifiers
  const testSuffix = `_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  let testOrg1Id: string;
  let testOrg2Id: string;
  let testUser1Id: string;
  let testUser2Id: string;
  let testGlobalAthleteId: string;

  const TEST_ORG1_NAME = `Test Org 1${testSuffix}`;
  const TEST_ORG2_NAME = `Test Org 2${testSuffix}`;
  const TEST_USER1_USERNAME = `testuser1${testSuffix}`;
  const TEST_USER2_USERNAME = `testuser2${testSuffix}`;
  const TEST_EMAIL = `test${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create two test organizations
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

    // Create two test users (representing same athlete in different orgs)
    const [user1] = await db.insert(users).values({
      username: TEST_USER1_USERNAME,
      emails: [TEST_EMAIL],
      password: "hashedpassword",
      firstName: "Test",
      lastName: "Athlete",
      fullName: "Test Athlete",
      isEmailVerified: true,
    }).returning();
    testUser1Id = user1.id;

    const [user2] = await db.insert(users).values({
      username: TEST_USER2_USERNAME,
      emails: [TEST_EMAIL], // Same email - same real person
      password: "hashedpassword",
      firstName: "Test",
      lastName: "Athlete",
      fullName: "Test Athlete",
      isEmailVerified: true,
    }).returning();
    testUser2Id = user2.id;

    // Add users to their respective organizations
    await db.insert(userOrganizations).values({
      userId: testUser1Id,
      organizationId: testOrg1Id,
      role: "athlete",
    });

    await db.insert(userOrganizations).values({
      userId: testUser2Id,
      organizationId: testOrg2Id,
      role: "athlete",
    });
  });

  afterAll(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);
    await db.delete(measurements).where(
      inArray(measurements.userId, [testUser1Id, testUser2Id])
    );
    await db.delete(userOrganizations).where(
      inArray(userOrganizations.userId, [testUser1Id, testUser2Id])
    );
    await db.delete(users).where(
      inArray(users.id, [testUser1Id, testUser2Id])
    );
    await db.delete(organizations).where(
      inArray(organizations.id, [testOrg1Id, testOrg2Id])
    );
  });

  beforeEach(async () => {
    // Clean global athlete data before each test
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);
    // Clean measurements created by test users
    await db.delete(measurements).where(
      inArray(measurements.userId, [testUser1Id, testUser2Id])
    );
  });

  describe("Global Athletes Table", () => {
    it("should create a global athlete record", async () => {
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
        createdBy: testUser1Id,
      }).returning();

      expect(globalAthlete).toBeDefined();
      expect(globalAthlete.id).toBeDefined();
      expect(globalAthlete.verifiedEmails).toContain(TEST_EMAIL);
      expect(globalAthlete.primaryEmail).toBe(TEST_EMAIL);
      expect(globalAthlete.canonicalFirstName).toBe("Test");
      expect(globalAthlete.canonicalLastName).toBe("Athlete");
      expect(globalAthlete.allowCrossOrgLinking).toBe(true);

      testGlobalAthleteId = globalAthlete.id;
    });

    it("should find global athlete by verified email", async () => {
      // Create a global athlete first
      await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      });

      // Query using array contains
      const [found] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.primaryEmail, TEST_EMAIL));

      expect(found).toBeDefined();
      expect(found.canonicalFirstName).toBe("Test");
    });

    it("should update allowCrossOrgLinking preference", async () => {
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Disable cross-org linking
      const [updated] = await db.update(globalAthletes)
        .set({ allowCrossOrgLinking: false, updatedAt: new Date() })
        .where(eq(globalAthletes.id, globalAthlete.id))
        .returning();

      expect(updated.allowCrossOrgLinking).toBe(false);
      expect(updated.updatedAt).toBeDefined();
    });
  });

  describe("User Global Athlete Links Table", () => {
    it("should create a link between user and global athlete", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Create link
      const [link] = await db.insert(userGlobalAthleteLinks).values({
        userId: testUser1Id,
        globalAthleteId: globalAthlete.id,
        linkStatus: "confirmed",
        linkType: "auto_email",
        proposedBy: testUser1Id,
        confirmedBy: testUser1Id,
        confirmedAt: new Date(),
        shareMeasurements: true,
      }).returning();

      expect(link).toBeDefined();
      expect(link.userId).toBe(testUser1Id);
      expect(link.globalAthleteId).toBe(globalAthlete.id);
      expect(link.linkStatus).toBe("confirmed");
      expect(link.linkType).toBe("auto_email");
    });

    it("should enforce unique user constraint (one user = one global athlete)", async () => {
      // Create two global athletes
      const [ga1] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      const [ga2] = await db.insert(globalAthletes).values({
        verifiedEmails: ["other@example.com"],
        primaryEmail: "other@example.com",
        canonicalFirstName: "Other",
        canonicalLastName: "Athlete",
        canonicalFullName: "Other Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Create first link
      await db.insert(userGlobalAthleteLinks).values({
        userId: testUser1Id,
        globalAthleteId: ga1.id,
        linkStatus: "confirmed",
        linkType: "auto_email",
        proposedBy: testUser1Id,
        shareMeasurements: true,
      });

      // Try to create second link for same user - should fail
      await expect(
        db.insert(userGlobalAthleteLinks).values({
          userId: testUser1Id,
          globalAthleteId: ga2.id,
          linkStatus: "pending",
          linkType: "athlete_claimed",
          proposedBy: testUser1Id,
          shareMeasurements: true,
        })
      ).rejects.toThrow();
    });

    it("should allow multiple users to link to same global athlete", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Link first user
      await db.insert(userGlobalAthleteLinks).values({
        userId: testUser1Id,
        globalAthleteId: globalAthlete.id,
        linkStatus: "confirmed",
        linkType: "auto_email",
        proposedBy: testUser1Id,
        shareMeasurements: true,
      });

      // Link second user (same real person, different account)
      const [link2] = await db.insert(userGlobalAthleteLinks).values({
        userId: testUser2Id,
        globalAthleteId: globalAthlete.id,
        linkStatus: "confirmed",
        linkType: "auto_email",
        proposedBy: testUser2Id,
        shareMeasurements: true,
      }).returning();

      expect(link2).toBeDefined();
      expect(link2.globalAthleteId).toBe(globalAthlete.id);
    });

    it("should get all linked users for a global athlete", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Link both users
      await db.insert(userGlobalAthleteLinks).values([
        {
          userId: testUser1Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: true,
        },
        {
          userId: testUser2Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: true,
        },
      ]);

      // Query all links for this global athlete
      const links = await db.select()
        .from(userGlobalAthleteLinks)
        .where(and(
          eq(userGlobalAthleteLinks.globalAthleteId, globalAthlete.id),
          eq(userGlobalAthleteLinks.linkStatus, "confirmed")
        ));

      expect(links).toHaveLength(2);
      expect(links.map(l => l.userId)).toContain(testUser1Id);
      expect(links.map(l => l.userId)).toContain(testUser2Id);
    });

    it("should update link status from pending to confirmed", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Create pending link
      const [link] = await db.insert(userGlobalAthleteLinks).values({
        userId: testUser1Id,
        globalAthleteId: globalAthlete.id,
        linkStatus: "pending",
        linkType: "org_proposed",
        proposedBy: testUser2Id, // Proposed by someone else
        shareMeasurements: true,
      }).returning();

      expect(link.linkStatus).toBe("pending");

      // Confirm the link
      const [confirmed] = await db.update(userGlobalAthleteLinks)
        .set({
          linkStatus: "confirmed",
          confirmedBy: testUser1Id,
          confirmedAt: new Date(),
        })
        .where(eq(userGlobalAthleteLinks.id, link.id))
        .returning();

      expect(confirmed.linkStatus).toBe("confirmed");
      expect(confirmed.confirmedBy).toBe(testUser1Id);
      expect(confirmed.confirmedAt).toBeDefined();
    });

    it("should revoke a link", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Create confirmed link
      const [link] = await db.insert(userGlobalAthleteLinks).values({
        userId: testUser1Id,
        globalAthleteId: globalAthlete.id,
        linkStatus: "confirmed",
        linkType: "auto_email",
        shareMeasurements: true,
      }).returning();

      // Revoke the link
      const [revoked] = await db.update(userGlobalAthleteLinks)
        .set({ linkStatus: "revoked" })
        .where(eq(userGlobalAthleteLinks.id, link.id))
        .returning();

      expect(revoked.linkStatus).toBe("revoked");
    });
  });

  describe("Global Athlete Audit Log Table", () => {
    it("should create audit log entry", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Create audit log
      const [log] = await db.insert(globalAthleteAuditLog).values({
        globalAthleteId: globalAthlete.id,
        action: "created",
        actorId: testUser1Id,
        actorType: "system",
        details: { email: TEST_EMAIL },
      }).returning();

      expect(log).toBeDefined();
      expect(log.action).toBe("created");
      expect(log.actorType).toBe("system");
      expect(log.details).toHaveProperty("email");
    });

    it("should track link confirmation", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Create audit log for link confirmation
      const [log] = await db.insert(globalAthleteAuditLog).values({
        globalAthleteId: globalAthlete.id,
        action: "link_confirmed",
        actorId: testUser1Id,
        actorType: "athlete",
        details: { linkType: "auto_email", userId: testUser1Id },
      }).returning();

      expect(log.action).toBe("link_confirmed");
      expect(log.actorType).toBe("athlete");
    });

    it("should query audit logs by global athlete", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Create multiple audit logs
      await db.insert(globalAthleteAuditLog).values([
        {
          globalAthleteId: globalAthlete.id,
          action: "created",
          actorId: testUser1Id,
          actorType: "system",
          details: {},
        },
        {
          globalAthleteId: globalAthlete.id,
          action: "link_confirmed",
          actorId: testUser1Id,
          actorType: "athlete",
          details: {},
        },
        {
          globalAthleteId: globalAthlete.id,
          action: "privacy_changed",
          actorId: testUser1Id,
          actorType: "athlete",
          details: { allowCrossOrgLinking: false },
        },
      ]);

      // Query logs
      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, globalAthlete.id))
        .orderBy(globalAthleteAuditLog.createdAt);

      expect(logs).toHaveLength(3);
      expect(logs.map(l => l.action)).toEqual(["created", "link_confirmed", "privacy_changed"]);
    });
  });

  describe("Cross-Organization Measurement Aggregation", () => {
    it("should create measurements for linked users", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Link both users
      await db.insert(userGlobalAthleteLinks).values([
        {
          userId: testUser1Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: true,
        },
        {
          userId: testUser2Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: true,
        },
      ]);

      // Create measurements for each user in their respective orgs
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
          globalAthleteId: globalAthlete.id,
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
          globalAthleteId: globalAthlete.id,
        },
      ]);

      // Query measurements by global athlete ID
      const allMeasurements = await db.select()
        .from(measurements)
        .where(eq(measurements.globalAthleteId, globalAthlete.id));

      expect(allMeasurements).toHaveLength(2);
      expect(allMeasurements.map(m => m.organizationId)).toContain(testOrg1Id);
      expect(allMeasurements.map(m => m.organizationId)).toContain(testOrg2Id);
    });

    it("should aggregate measurements across linked users", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Link both users
      await db.insert(userGlobalAthleteLinks).values([
        {
          userId: testUser1Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: true,
        },
        {
          userId: testUser2Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: true,
        },
      ]);

      // Get all linked user IDs
      const links = await db.select()
        .from(userGlobalAthleteLinks)
        .where(and(
          eq(userGlobalAthleteLinks.globalAthleteId, globalAthlete.id),
          eq(userGlobalAthleteLinks.linkStatus, "confirmed"),
          eq(userGlobalAthleteLinks.shareMeasurements, true)
        ));

      const linkedUserIds = links.map(l => l.userId);
      expect(linkedUserIds).toHaveLength(2);
      expect(linkedUserIds).toContain(testUser1Id);
      expect(linkedUserIds).toContain(testUser2Id);

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
          globalAthleteId: globalAthlete.id,
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
          globalAthleteId: globalAthlete.id,
        },
      ]);

      // Query measurements across all linked users
      const unifiedMeasurements = await db.select()
        .from(measurements)
        .where(inArray(measurements.userId, linkedUserIds));

      expect(unifiedMeasurements).toHaveLength(2);
      // Best vertical jump should be 30
      const best = Math.max(...unifiedMeasurements.map(m => Number(m.value)));
      expect(best).toBe(30);
    });

    it("should respect shareMeasurements=false preference", async () => {
      // Create global athlete
      const [globalAthlete] = await db.insert(globalAthletes).values({
        verifiedEmails: [TEST_EMAIL],
        primaryEmail: TEST_EMAIL,
        canonicalFirstName: "Test",
        canonicalLastName: "Athlete",
        canonicalFullName: "Test Athlete",
        allowCrossOrgLinking: true,
      }).returning();

      // Link both users, but user2 doesn't share measurements
      await db.insert(userGlobalAthleteLinks).values([
        {
          userId: testUser1Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: true,
        },
        {
          userId: testUser2Id,
          globalAthleteId: globalAthlete.id,
          linkStatus: "confirmed",
          linkType: "auto_email",
          shareMeasurements: false, // Not sharing
        },
      ]);

      // Get only users who share measurements
      const sharingLinks = await db.select()
        .from(userGlobalAthleteLinks)
        .where(and(
          eq(userGlobalAthleteLinks.globalAthleteId, globalAthlete.id),
          eq(userGlobalAthleteLinks.linkStatus, "confirmed"),
          eq(userGlobalAthleteLinks.shareMeasurements, true)
        ));

      expect(sharingLinks).toHaveLength(1);
      expect(sharingLinks[0].userId).toBe(testUser1Id);
    });
  });
});
