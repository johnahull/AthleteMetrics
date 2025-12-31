/**
 * Event Invitation Email Integration Tests
 * TDD Phase 1: Write failing tests for email notification functionality
 *
 * Tests email sending when invitations are created:
 * - External users (invitation.email exists)
 * - Org members (invitation.userId exists)
 * - Email contains correct event details
 * - emailSent flag updated after sending
 * - emailSentAt timestamp set
 * - Graceful handling of email service failures
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, events, eventInvitations } from "@shared/schema";
import { EventInvitationService } from "../services/event-invitation-service";
import { emailService } from "../services/email-service";
import { eq } from "drizzle-orm";

// Mock the email service
vi.mock("../services/email-service", () => ({
  emailService: {
    sendEventInvitation: vi.fn().mockResolvedValue(true),
  }
}));

describe("Event Invitation Email Integration", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_evt_inv_email_${timestamp}`;

  let testOrgId: string;
  let testEventId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let invitationService: EventInvitationService;

  const TEST_ORG_NAME = `EventInvEmailOrg${testSuffix}`;
  const TEST_COACH_EMAIL = `coach${testSuffix}@example.com`;
  const TEST_ATHLETE_EMAIL = `athlete${testSuffix}@example.com`;
  const EXTERNAL_EMAIL = `external${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create test organization with events enabled
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for event invitation emails",
      isActive: true,
      eventsEnabled: true,
    }).returning();
    testOrgId = org.id;

    // Create test coach
    const [coach] = await db.insert(users).values({
      emails: [TEST_COACH_EMAIL],
      username: `coach${testSuffix}`,
      firstName: "Test",
      lastName: "Coach",
      fullName: "Test Coach",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    // Create test athlete (org member)
    const [athlete] = await db.insert(users).values({
      emails: [TEST_ATHLETE_EMAIL],
      username: `athlete${testSuffix}`,
      firstName: "Test",
      lastName: "Athlete",
      fullName: "Test Athlete",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    // Create test event
    const [event] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Test Event ${testSuffix}`,
      description: "Test event for invitation emails",
      location: "Test Stadium",
      eventType: "combine",
      visibility: "invite_only",
      registrationType: "invite_only",
      startDate: new Date("2025-06-01T10:00:00Z"),
      endDate: new Date("2025-06-01T16:00:00Z"),
      status: "published",
      isFrozen: false,
      createdBy: testCoachId,
    }).returning();
    testEventId = event.id;

    invitationService = new EventInvitationService(storage);
  });

  afterAll(async () => {
    // Cleanup in reverse dependency order
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, testEventId));
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  beforeEach(() => {
    // Reset mock before each test
    vi.clearAllMocks();
  });

  describe("Email Sending for External Users", () => {
    it("should send email when external user is invited via email", async () => {
      const invitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: EXTERNAL_EMAIL }
      );

      // Verify email was sent
      expect(emailService.sendEventInvitation).toHaveBeenCalledTimes(1);
      expect(emailService.sendEventInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: EXTERNAL_EMAIL,
          eventName: expect.stringContaining("Test Event"),
          inviterName: "Test Coach",
          acceptUrl: expect.stringContaining(invitation.token),
        })
      );
    });

    it("should update emailSent flag to true after sending", async () => {
      const invitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `another${testSuffix}@example.com` }
      );

      expect(invitation.emailSent).toBe(true);
    });

    it("should set emailSentAt timestamp after sending", async () => {
      const beforeTime = new Date();

      const invitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `timestamp${testSuffix}@example.com` }
      );

      const afterTime = new Date();

      expect(invitation.emailSentAt).toBeDefined();
      expect(invitation.emailSentAt).toBeInstanceOf(Date);
      expect(invitation.emailSentAt!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(invitation.emailSentAt!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe("Email Sending for Org Members", () => {
    let athleteInvitationId: string;

    it("should send email when org member is invited via userId", async () => {
      const invitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { userId: testAthleteId }
      );

      athleteInvitationId = invitation.id;

      // Verify email was sent to the user's email
      expect(emailService.sendEventInvitation).toHaveBeenCalledTimes(1);
      expect(emailService.sendEventInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: TEST_ATHLETE_EMAIL,
          recipientName: "Test Athlete",
          eventName: expect.stringContaining("Test Event"),
          inviterName: "Test Coach",
        })
      );
    });

    it("should update emailSent and emailSentAt for org member invitations", async () => {
      // Get the invitation created in the previous test
      const invitation = await db.query.eventInvitations.findFirst({
        where: (invitations, { eq }) => eq(invitations.id, athleteInvitationId)
      });

      expect(invitation).toBeDefined();
      expect(invitation!.emailSent).toBe(true);
      expect(invitation!.emailSentAt).toBeDefined();
      expect(invitation!.emailSentAt).toBeInstanceOf(Date);
    });
  });

  describe("Email Content Validation", () => {
    it("should include event details in email", async () => {
      await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `details${testSuffix}@example.com` }
      );

      expect(emailService.sendEventInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: expect.stringContaining("Test Event"),
          eventDate: expect.any(Date),
          eventLocation: "Test Stadium",
        })
      );
    });

    it("should include accept URL with token in email", async () => {
      const invitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `url${testSuffix}@example.com` }
      );

      expect(emailService.sendEventInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          acceptUrl: expect.stringContaining(invitation.token),
        })
      );
    });

    it("should include inviter name in email", async () => {
      await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `inviter${testSuffix}@example.com` }
      );

      expect(emailService.sendEventInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          inviterName: "Test Coach",
        })
      );
    });

    it("should include expiration date in email", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `expiry${testSuffix}@example.com`, expiresAt }
      );

      expect(emailService.sendEventInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Date),
        })
      );
    });
  });

  describe("Email Service Failure Handling", () => {
    it("should handle email service failures gracefully", async () => {
      // Mock email service to fail
      vi.mocked(emailService.sendEventInvitation).mockRejectedValueOnce(
        new Error("SMTP connection failed")
      );

      // Should still create invitation even if email fails
      const invitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `failure${testSuffix}@example.com` }
      );

      expect(invitation).toBeDefined();
      expect(invitation.id).toBeDefined();
      expect(invitation.emailSent).toBe(false);
      expect(invitation.emailSentAt).toBeNull();
    });

    it("should not throw error when email fails (graceful degradation)", async () => {
      vi.mocked(emailService.sendEventInvitation).mockRejectedValueOnce(
        new Error("Email service down")
      );

      // Should not throw - invitation creation should succeed even if email fails
      await expect(
        invitationService.createInvitation(
          testEventId,
          testCoachId,
          { email: `log${testSuffix}@example.com` }
        )
      ).resolves.toBeDefined();
    });

    it("should return false from sendEmail when email service returns false", async () => {
      vi.mocked(emailService.sendEventInvitation).mockResolvedValueOnce(false);

      const invitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `false${testSuffix}@example.com` }
      );

      expect(invitation.emailSent).toBe(false);
      expect(invitation.emailSentAt).toBeNull();
    });
  });

  describe("Organization Name in Email", () => {
    it("should include organization name when event has organizationId", async () => {
      await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `org${testSuffix}@example.com` }
      );

      expect(emailService.sendEventInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationName: TEST_ORG_NAME,
        })
      );
    });
  });
});
