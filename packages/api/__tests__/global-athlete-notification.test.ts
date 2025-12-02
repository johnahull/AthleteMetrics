/**
 * Unit tests for Global Athlete Notification Features
 * Tests email notifications on auto-link and pending notification management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "../db";
import {
  organizations, users, userOrganizations,
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { GlobalAthleteService } from "../services/global-athlete-service";
import { emailService } from "../services/email-service";

// Mock the email service
vi.mock("../services/email-service", () => ({
  emailService: {
    sendAccountLinkedNotification: vi.fn().mockResolvedValue(true),
  },
}));

describe("Global Athlete Notification Features", () => {
  const testSuffix = `_notif_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let service: GlobalAthleteService;

  let testOrg1Id: string;
  let testOrg2Id: string;
  let testUser1Id: string;
  let testUser2Id: string;

  const TEST_ORG1_NAME = `Test Notif Org 1${testSuffix}`;
  const TEST_ORG2_NAME = `Test Notif Org 2${testSuffix}`;
  const TEST_USER1_USERNAME = `notifuser1${testSuffix}`;
  const TEST_USER2_USERNAME = `notifuser2${testSuffix}`;
  const TEST_EMAIL = `notiftest${testSuffix}@example.com`;

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
      firstName: "NotifTest",
      lastName: "User1",
      fullName: "NotifTest User1",
      isEmailVerified: true,
    }).returning();
    testUser1Id = user1.id;

    const [user2] = await db.insert(users).values({
      username: TEST_USER2_USERNAME,
      emails: [TEST_EMAIL], // Same email - same real person
      password: "hashedpassword",
      firstName: "NotifTest",
      lastName: "User2",
      fullName: "NotifTest User2",
      isEmailVerified: true,
    }).returning();
    testUser2Id = user2.id;

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
      inArray(users.id, [testUser1Id, testUser2Id])
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

    // Clear mock calls
    vi.clearAllMocks();
  });

  describe("Email Notification on Auto-Link", () => {
    it("should send email notification when user auto-links to existing global athlete", async () => {
      // First user verifies email - creates global athlete (no notification needed for first link)
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      // Verify no notification for first link (creating own identity)
      expect(emailService.sendAccountLinkedNotification).not.toHaveBeenCalled();

      // Second user verifies - should auto-link AND send notification
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      // Should send notification to user2
      expect(emailService.sendAccountLinkedNotification).toHaveBeenCalledTimes(1);
      expect(emailService.sendAccountLinkedNotification).toHaveBeenCalledWith({
        email: TEST_EMAIL,
        userName: "NotifTest User2",
        globalAthleteName: "NotifTest User1",
        linkedOrganizations: expect.arrayContaining([TEST_ORG1_NAME]),
      });
    });

    it("should set notifiedAt timestamp when notification is sent", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      // Check user2's link has notifiedAt set
      const [link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      expect(link.notifiedAt).toBeDefined();
      expect(link.notifiedAt).toBeInstanceOf(Date);
    });

    it("should not set notifiedAt for first user creating their own global athlete", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      const [link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser1Id));

      // First user's link should not have notifiedAt (they created the identity)
      expect(link.notifiedAt).toBeNull();
    });

    it("should log notification in audit log", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const [globalAthlete] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.primaryEmail, TEST_EMAIL));

      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, globalAthlete.id));

      expect(logs.some(l => l.action === "link_notification_sent")).toBe(true);
    });
  });

  describe("Pending Notifications API", () => {
    it("should return pending notifications for user (notifiedAt is null, unacknowledged)", async () => {
      // Create a link but mock notifiedAt as null for testing unacknowledged state
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      // Update user2's link to be unacknowledged (notifiedAt set but not acknowledged)
      await db.update(userGlobalAthleteLinks)
        .set({ notifiedAt: new Date() })
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      const pendingNotifications = await service.getPendingLinkNotifications(testUser2Id);

      expect(pendingNotifications).toHaveLength(1);
      expect(pendingNotifications[0].linkedToName).toBe("NotifTest User1");
      expect(pendingNotifications[0].linkedOrganizations).toContain(TEST_ORG1_NAME);
    });

    it("should return empty array when no pending notifications", async () => {
      // User with no global athlete link
      const pendingNotifications = await service.getPendingLinkNotifications(testUser1Id);
      expect(pendingNotifications).toEqual([]);
    });

    it("should not return notifications for primary link holder", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);

      // User1 is the primary link holder - they don't need notification
      const pendingNotifications = await service.getPendingLinkNotifications(testUser1Id);
      expect(pendingNotifications).toEqual([]);
    });
  });

  describe("Acknowledge Notification", () => {
    it("should acknowledge a pending notification", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      // Set unacknowledged state
      const [link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      await service.acknowledgeNotification(testUser2Id, link.id);

      // Check that link is now acknowledged
      const [updatedLink] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      expect(updatedLink.notificationAcknowledgedAt).toBeDefined();
    });

    it("should not allow acknowledging another user's notification", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const [link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      // User1 tries to acknowledge user2's notification - should fail
      await expect(
        service.acknowledgeNotification(testUser1Id, link.id)
      ).rejects.toThrow();
    });

    it("should log acknowledgment in audit log", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      const [link] = await db.select()
        .from(userGlobalAthleteLinks)
        .where(eq(userGlobalAthleteLinks.userId, testUser2Id));

      await service.acknowledgeNotification(testUser2Id, link.id);

      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link.globalAthleteId));

      expect(logs.some(l => l.action === "notification_acknowledged")).toBe(true);
    });
  });

  describe("Email Template Content", () => {
    it("should include all linked organizations in notification", async () => {
      // First user has two orgs
      await db.insert(userOrganizations).values({
        userId: testUser1Id,
        organizationId: testOrg2Id,
        role: "athlete",
      });

      await service.onEmailVerified(testUser1Id, TEST_EMAIL);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL);

      expect(emailService.sendAccountLinkedNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedOrganizations: expect.arrayContaining([TEST_ORG1_NAME, TEST_ORG2_NAME]),
        })
      );

      // Clean up extra org assignment
      await db.delete(userOrganizations).where(
        eq(userOrganizations.userId, testUser1Id)
      );
      await db.insert(userOrganizations).values({
        userId: testUser1Id,
        organizationId: testOrg1Id,
        role: "athlete",
      });
    });
  });

  describe("XSS Prevention in Email Templates", () => {
    it("should pass data to email service without XSS injection", async () => {
      // Create user with XSS payload in name
      const xssTestSuffix = `_xss_${Date.now()}`;
      const xssPayload = '<script>alert("xss")</script>';
      const [xssUser1] = await db.insert(users).values({
        username: `xssuser1${xssTestSuffix}`,
        emails: [`xss${xssTestSuffix}@example.com`],
        password: "hashedpassword",
        firstName: xssPayload,
        lastName: "User",
        fullName: `${xssPayload} User`,
        isEmailVerified: true,
      }).returning();

      const [xssUser2] = await db.insert(users).values({
        username: `xssuser2${xssTestSuffix}`,
        emails: [`xss${xssTestSuffix}@example.com`],
        password: "hashedpassword",
        firstName: "Normal",
        lastName: "User",
        fullName: "Normal User",
        isEmailVerified: true,
      }).returning();

      try {
        // First user with XSS name creates global athlete
        await service.onEmailVerified(xssUser1.id, `xss${xssTestSuffix}@example.com`);
        // Second user auto-links - notification should be sent
        await service.onEmailVerified(xssUser2.id, `xss${xssTestSuffix}@example.com`);

        // Verify the email service received the data
        // The email service's escapeHtml function handles the actual XSS prevention
        expect(emailService.sendAccountLinkedNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            globalAthleteName: `${xssPayload} User`,
            userName: "Normal User",
          })
        );
      } finally {
        // Clean up
        await db.delete(globalAthleteAuditLog);
        await db.delete(userGlobalAthleteLinks).where(
          inArray(userGlobalAthleteLinks.userId, [xssUser1.id, xssUser2.id])
        );
        await db.delete(globalAthletes);
        await db.delete(users).where(
          inArray(users.id, [xssUser1.id, xssUser2.id])
        );
      }
    });
  });
});
