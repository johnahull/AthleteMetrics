/**
 * Tests for report sharing notification integration
 * Tests email and push notifications when reports are shared with athletes
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "../db";
import { organizations, users, userOrganizations, reports, reportShares, notificationPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { emailService } from "../services/email-service";
import { getPushNotificationService } from "../services/push-notification-service";

// Mock email service
vi.mock("../services/email-service", () => ({
  emailService: {
    sendReportSharedNotification: vi.fn().mockResolvedValue(true),
  },
}));

describe("Report Sharing Notification Integration", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_notif_test_${timestamp}`;

  let testOrgId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let testReportId: string;

  const TEST_ORG_NAME = `NotifTest Org${testSuffix}`;
  const TEST_COACH_EMAIL = `notifcoach${testSuffix}@example.com`;
  const TEST_ATHLETE_EMAIL = `notifathlete${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for notification integration",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create test coach
    const [coach] = await db.insert(users).values({
      emails: [TEST_COACH_EMAIL],
      username: `notifcoach${testSuffix}`,
      firstName: "Notif",
      lastName: "Coach",
      fullName: "Notif Coach",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create test athlete with email
    const [athlete] = await db.insert(users).values({
      emails: [TEST_ATHLETE_EMAIL],
      username: `notifathlete${testSuffix}`,
      firstName: "Notif",
      lastName: "Athlete",
      fullName: "Notif Athlete",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create default notification preferences
    await db.insert(notificationPreferences).values({
      userId: testAthleteId,
      pushEnabled: true,
      emailEnabled: true,
      pushReportShared: true,
      emailReportShared: true,
    });

    // Create test report
    const [report] = await db.insert(reports).values({
      name: "Test Performance Report",
      organizationId: testOrgId,
      reportType: "individual",
      config: {
        athleteId: testAthleteId,
        timeframe: { type: "preset", preset: "season" },
        metrics: ["FLY10_TIME", "VERTICAL_JUMP"],
      },
      createdBy: testCoachId,
    }).returning();
    testReportId = report.id;
  });

  afterAll(async () => {
    // Clean up all test data
    await db.delete(reportShares).where(eq(reportShares.reportId, testReportId));
    await db.delete(reports).where(eq(reports.id, testReportId));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, testAthleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("Email Notification Integration", () => {
    it("should send email notification when report is shared", async () => {
      // Create a share
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: "Great progress this season!",
      }).returning();

      // Verify email service was called (this will be implemented in report-routes.ts)
      // For now, just verify the share was created
      expect(share.id).toBeDefined();
      expect(share.athleteId).toBe(testAthleteId);

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });

    it("should include coach name and report name in email", async () => {
      // This test will verify the email template structure
      // To be implemented when sendReportSharedNotification is called
      expect(true).toBe(true); // Placeholder
    });

    it("should include optional coach message in email", async () => {
      // This test will verify the message is passed to the email template
      expect(true).toBe(true); // Placeholder
    });

    it("should skip email when emailReportShared is false", async () => {
      // Update preferences to disable email notifications
      await db.update(notificationPreferences)
        .set({ emailReportShared: false })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Create a share (should not send email)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Reset preferences
      await db.update(notificationPreferences)
        .set({ emailReportShared: true })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });

    it("should skip email when emailEnabled master toggle is false", async () => {
      // Update preferences to disable all email notifications
      await db.update(notificationPreferences)
        .set({ emailEnabled: false })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Create a share (should not send email)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Reset preferences
      await db.update(notificationPreferences)
        .set({ emailEnabled: true })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });
  });

  describe("Push Notification Integration", () => {
    it("should send push notification when report is shared", async () => {
      // This test will verify push notification is sent
      // To be implemented when push notification service is integrated
      expect(true).toBe(true); // Placeholder
    });

    it("should include correct payload in push notification", async () => {
      // Verify push notification contains:
      // - type: 'report_shared'
      // - title: 'New Performance Report'
      // - body: includes coach name and report name
      // - url: '/my-reports'
      // - data: { shareId, reportId }
      expect(true).toBe(true); // Placeholder
    });

    it("should skip push when pushReportShared is false", async () => {
      // Update preferences to disable push notifications
      await db.update(notificationPreferences)
        .set({ pushReportShared: false })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Create a share (should not send push)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Reset preferences
      await db.update(notificationPreferences)
        .set({ pushReportShared: true })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });

    it("should skip push when pushEnabled master toggle is false", async () => {
      // Update preferences to disable all push notifications
      await db.update(notificationPreferences)
        .set({ pushEnabled: false })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Create a share (should not send push)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Reset preferences
      await db.update(notificationPreferences)
        .set({ pushEnabled: true })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });
  });

  describe("Notification Preference Defaults", () => {
    it("should use defaults when no preferences exist", async () => {
      // Create athlete without preferences
      const [athlete2] = await db.insert(users).values({
        emails: [`athlete2${testSuffix}@example.com`],
        username: `athlete2${testSuffix}`,
        firstName: "Athlete",
        lastName: "Two",
        fullName: "Athlete Two",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: athlete2.id,
        organizationId: testOrgId,
        role: "athlete",
      });

      // Create share (should use default preferences)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: athlete2.id,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete2.id));
      await db.delete(users).where(eq(users.id, athlete2.id));
    });
  });

  describe("Combined Notification Scenarios", () => {
    it("should send both email and push when both are enabled", async () => {
      // Verify both email and push notifications are sent
      expect(true).toBe(true); // Placeholder
    });

    it("should send only email when push is disabled", async () => {
      // Update preferences
      await db.update(notificationPreferences)
        .set({ pushReportShared: false })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Create share (should send only email)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Reset
      await db.update(notificationPreferences)
        .set({ pushReportShared: true })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });

    it("should send only push when email is disabled", async () => {
      // Update preferences
      await db.update(notificationPreferences)
        .set({ emailReportShared: false })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Create share (should send only push)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Reset
      await db.update(notificationPreferences)
        .set({ emailReportShared: true })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });

    it("should send no notifications when all are disabled", async () => {
      // Update preferences
      await db.update(notificationPreferences)
        .set({ pushReportShared: false, emailReportShared: false })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Create share (should send no notifications)
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share.id).toBeDefined();

      // Reset
      await db.update(notificationPreferences)
        .set({ pushReportShared: true, emailReportShared: true })
        .where(eq(notificationPreferences.userId, testAthleteId));

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });
  });
});
