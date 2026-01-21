/**
 * Event Invitation - My Invitations API Tests
 * TDD Phase 2: Tests for GET /api/my/event-invitations endpoint
 *
 * Tests:
 * - Returns pending invitations for authenticated user
 * - Only returns invitations with status 'pending'
 * - Only returns non-expired invitations
 * - Includes event details (name, startDate, location)
 * - Returns empty array when no invitations
 * - Requires authentication (401 if not logged in)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, events, eventInvitations } from "@shared/schema";
import { EventInvitationService } from "../services/event-invitation-service";
import { eq } from "drizzle-orm";

// Mock the email service
vi.mock("../services/email-service", () => ({
  emailService: {
    sendEventInvitation: vi.fn().mockResolvedValue(true),
  }
}));

describe("GET /api/my/event-invitations", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_my_inv_${timestamp}`;

  let testOrgId: string;
  let testEventId: string;
  let testEvent2Id: string;
  let testCoachId: string;
  let testAthleteId: string;
  let invitationService: EventInvitationService;

  const TEST_ORG_NAME = `MyInvOrg${testSuffix}`;
  const TEST_COACH_EMAIL = `myinvcoach${testSuffix}@example.com`;
  const TEST_ATHLETE_EMAIL = `myinvathlete${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for my invitations",
      isActive: true,
      eventsEnabled: true,
    }).returning();
    testOrgId = org.id;

    // Create test coach
    const [coach] = await db.insert(users).values({
      emails: [TEST_COACH_EMAIL],
      username: `myinvcoach${testSuffix}`,
      firstName: "My",
      lastName: "Coach",
      fullName: "My Coach",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    // Create test athlete
    const [athlete] = await db.insert(users).values({
      emails: [TEST_ATHLETE_EMAIL],
      username: `myinvathlete${testSuffix}`,
      firstName: "My",
      lastName: "Athlete",
      fullName: "My Athlete",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    // Create test event 1
    const [event] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Test Event 1 ${testSuffix}`,
      description: "First test event",
      location: "Stadium A",
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

    // Create test event 2
    const [event2] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Test Event 2 ${testSuffix}`,
      description: "Second test event",
      location: "Stadium B",
      eventType: "combine",
      visibility: "invite_only",
      registrationType: "invite_only",
      startDate: new Date("2025-07-01T10:00:00Z"),
      endDate: new Date("2025-07-01T16:00:00Z"),
      status: "published",
      isFrozen: false,
      createdBy: testCoachId,
    }).returning();
    testEvent2Id = event2.id;

    invitationService = new EventInvitationService(storage);
  });

  afterAll(async () => {
    // Cleanup in reverse dependency order
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, testEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, testEvent2Id));
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(events).where(eq(events.id, testEvent2Id));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("Service Method: getUserPendingInvitations", () => {
    it("should return pending invitations for user", async () => {
      // Create invitations for the athlete
      await invitationService.createInvitation(testEventId, testCoachId, { userId: testAthleteId });
      await invitationService.createInvitation(testEvent2Id, testCoachId, { userId: testAthleteId });

      const invitations = await storage.getUserPendingInvitations(testAthleteId);

      expect(invitations).toBeDefined();
      expect(invitations.length).toBeGreaterThanOrEqual(2);

      // Verify invitation structure
      const invitation = invitations[0];
      expect(invitation).toHaveProperty('id');
      expect(invitation).toHaveProperty('status', 'pending');
      expect(invitation).toHaveProperty('event');
      expect(invitation.event).toHaveProperty('name');
      expect(invitation.event).toHaveProperty('startDate');
      expect(invitation.event).toHaveProperty('location');
    });

    it("should only return pending invitations", async () => {
      const invitations = await storage.getUserPendingInvitations(testAthleteId);

      // All invitations should have status 'pending'
      invitations.forEach(inv => {
        expect(inv.status).toBe('pending');
      });
    });

    it("should only return non-expired invitations", async () => {
      const invitations = await storage.getUserPendingInvitations(testAthleteId);

      // All invitations should have expiresAt in the future
      const now = new Date();
      invitations.forEach(inv => {
        expect(new Date(inv.expiresAt).getTime()).toBeGreaterThan(now.getTime());
      });
    });

    it("should include event details", async () => {
      const invitations = await storage.getUserPendingInvitations(testAthleteId);

      expect(invitations.length).toBeGreaterThan(0);

      const invitation = invitations.find(inv => inv.event.name.includes("Test Event 1"));
      expect(invitation).toBeDefined();
      expect(invitation!.event.name).toContain("Test Event 1");
      expect(invitation!.event.location).toBe("Stadium A");
      expect(invitation!.event.startDate).toBeDefined();
    });

    it("should return empty array when no pending invitations exist", async () => {
      // Create a new user with no invitations
      const [newUser] = await db.insert(users).values({
        emails: [`noinv${testSuffix}@example.com`],
        username: `noinv${testSuffix}`,
        firstName: "No",
        lastName: "Invitations",
        fullName: "No Invitations",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      const invitations = await storage.getUserPendingInvitations(newUser.id);

      expect(invitations).toBeDefined();
      expect(invitations).toEqual([]);

      // Cleanup
      await db.delete(users).where(eq(users.id, newUser.id));
    });

    it("should not include accepted invitations", async () => {
      // Get a pending invitation and accept it
      const allInvitations = await storage.getUserPendingInvitations(testAthleteId);
      expect(allInvitations.length).toBeGreaterThan(0);

      const invitationToAccept = allInvitations[0];

      // Accept the invitation
      await storage.updateEventInvitation(invitationToAccept.id, {
        status: 'accepted',
        acceptedAt: new Date(),
      });

      // Get pending invitations again
      const pendingInvitations = await storage.getUserPendingInvitations(testAthleteId);

      // The accepted invitation should not be in the list
      const accepted = pendingInvitations.find(inv => inv.id === invitationToAccept.id);
      expect(accepted).toBeUndefined();
    });

    it("should not include declined invitations", async () => {
      // Create a new invitation
      const newInvitation = await invitationService.createInvitation(
        testEventId,
        testCoachId,
        { email: `declined${testSuffix}@example.com` }
      );

      // Decline it
      await storage.updateEventInvitation(newInvitation.id, {
        status: 'declined',
        declinedAt: new Date(),
      });

      // Create a user with that email
      const [user] = await db.insert(users).values({
        emails: [`declined${testSuffix}@example.com`],
        username: `declined${testSuffix}`,
        firstName: "Declined",
        lastName: "User",
        fullName: "Declined User",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      // Get pending invitations - should be empty
      const invitations = await storage.getUserPendingInvitations(user.id);

      const declined = invitations.find(inv => inv.id === newInvitation.id);
      expect(declined).toBeUndefined();

      // Cleanup
      await db.delete(users).where(eq(users.id, user.id));
    });

    it("should not include expired invitations", async () => {
      // Create an invitation with past expiry
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const expiredInvitation = await db.insert(eventInvitations).values({
        eventId: testEventId,
        userId: testAthleteId,
        token: `expired_token_${timestamp}`,
        status: 'pending',
        invitedBy: testCoachId,
        expiresAt: pastDate,
        emailSent: false,
      }).returning();

      // Get pending invitations
      const invitations = await storage.getUserPendingInvitations(testAthleteId);

      // The expired invitation should not be in the list
      const expired = invitations.find(inv => inv.id === expiredInvitation[0].id);
      expect(expired).toBeUndefined();
    });
  });
});
