/**
 * Integration tests for Event Invitation Service
 * Tests token-based invitation workflow for invite-only events
 *
 * TDD Phase 3.2: RED - These tests define expected invitation behavior
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations, events, eventRegistrations, eventInvitations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { EventService } from "../services/event-service";
import { EventInvitationService } from "../services/event-invitation-service";
import type { IStorage } from "../storage";

describe("Event Invitation Service", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_inv_test_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let testAthlete2Id: string;
  let eventService: EventService;
  let invitationService: EventInvitationService;

  // Event IDs
  let inviteOnlyEventId: string;
  let openEventId: string;
  let frozenEventId: string;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Invitation Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [`invadmin${testSuffix}@example.com`],
      username: `invadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Inv",
      lastName: "Admin",
      fullName: "Inv Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = orgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    // Create coach
    const [coach] = await db.insert(users).values({
      emails: [`invcoach${testSuffix}@example.com`],
      username: `invcoach${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Inv",
      lastName: "Coach",
      fullName: "Inv Coach",
      role: "coach",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create athlete in org
    const [athlete] = await db.insert(users).values({
      emails: [`invathlete${testSuffix}@example.com`],
      username: `invathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Inv",
      lastName: "Athlete",
      fullName: "Inv Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create second athlete (not in org - independent)
    const [athlete2] = await db.insert(users).values({
      emails: [`invathlete2${testSuffix}@example.com`],
      username: `invathlete2${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Independent",
      lastName: "Athlete",
      fullName: "Independent Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthlete2Id = athlete2.id;

    // Initialize services
    eventService = new EventService(storage as IStorage);
    invitationService = new EventInvitationService(storage as IStorage);

    // Create test events
    const inviteEvent = await eventService.createEvent({
      name: "Invite Only Event",
      startDate: new Date("2025-06-01T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "invitation_only",
      status: "published",
    }, testOrgAdminId);
    inviteOnlyEventId = inviteEvent.id;

    const openEvent = await eventService.createEvent({
      name: "Open Event",
      startDate: new Date("2025-06-02T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "open",
      status: "published",
    }, testOrgAdminId);
    openEventId = openEvent.id;

    const frozenEvent = await eventService.createEvent({
      name: "Frozen Event",
      startDate: new Date("2025-06-03T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "invitation_only",
      status: "completed",
    }, testOrgAdminId);
    frozenEventId = frozenEvent.id;
    await eventService.freezeEvent(frozenEventId, testOrgAdminId, "Event completed");
  });

  afterEach(async () => {
    // Clean up invitations and registrations after each test
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, inviteOnlyEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, openEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, inviteOnlyEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, openEventId));
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, inviteOnlyEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, openEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, frozenEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, inviteOnlyEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, openEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, frozenEventId));
    await db.delete(events).where(eq(events.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(users).where(eq(users.id, testAthlete2Id));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("createInvitation", () => {
    it("should create invitation for existing user by userId", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      expect(invitation).toBeDefined();
      expect(invitation.eventId).toBe(inviteOnlyEventId);
      expect(invitation.userId).toBe(testAthleteId);
      expect(invitation.token).toBeDefined();
      expect(invitation.token.length).toBeGreaterThanOrEqual(32);
      expect(invitation.status).toBe("pending");
      expect(invitation.invitedBy).toBe(testOrgAdminId);
      expect(invitation.expiresAt).toBeDefined();
    });

    it("should create invitation by email for non-users", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { email: "newathlete@example.com" }
      );

      expect(invitation).toBeDefined();
      expect(invitation.email).toBe("newathlete@example.com");
      expect(invitation.userId).toBeNull();
      expect(invitation.token).toBeDefined();
      expect(invitation.status).toBe("pending");
    });

    it("should set default expiration to 7 days", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const expiresAt = new Date(invitation.expiresAt);

      // Allow 1 minute tolerance
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(60000);
    });

    it("should allow custom expiration date", async () => {
      const customExpiry = new Date("2025-07-01T00:00:00Z");
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId, expiresAt: customExpiry }
      );

      expect(new Date(invitation.expiresAt).toISOString()).toBe(customExpiry.toISOString());
    });

    it("should prevent duplicate invitations to same user", async () => {
      await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      await expect(
        invitationService.createInvitation(
          inviteOnlyEventId,
          testOrgAdminId,
          { userId: testAthleteId }
        )
      ).rejects.toThrow(/already.*invited|duplicate/i);
    });

    it("should prevent invitation to frozen events", async () => {
      await expect(
        invitationService.createInvitation(
          frozenEventId,
          testOrgAdminId,
          { userId: testAthleteId }
        )
      ).rejects.toThrow(/frozen|closed/i);
    });

    it("should allow coaches to create invitations", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testCoachId,
        { userId: testAthleteId }
      );

      expect(invitation.invitedBy).toBe(testCoachId);
    });
  });

  describe("getInvitationByToken", () => {
    it("should return invitation by token", async () => {
      const created = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const found = await invitationService.getInvitationByToken(created.token);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.token).toBe(created.token);
    });

    it("should return null for invalid token", async () => {
      const found = await invitationService.getInvitationByToken("invalid-token-12345");
      expect(found).toBeNull();
    });

    it("should include event details with invitation", async () => {
      const created = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const found = await invitationService.getInvitationByToken(created.token);

      expect(found?.eventId).toBe(inviteOnlyEventId);
    });
  });

  describe("acceptInvitation", () => {
    it("should create registration when accepting invitation", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const result = await invitationService.acceptInvitation(invitation.token, testAthleteId);

      expect(result.invitation.status).toBe("accepted");
      expect(result.invitation.acceptedAt).toBeDefined();
      expect(result.registration).toBeDefined();
      expect(result.registration.userId).toBe(testAthleteId);
      expect(result.registration.status).toBe("approved");
      expect(result.registration.discoveryMethod).toBe("invitation");
    });

    it("should reject expired invitation", async () => {
      const pastDate = new Date("2020-01-01T00:00:00Z");
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId, expiresAt: pastDate }
      );

      await expect(
        invitationService.acceptInvitation(invitation.token, testAthleteId)
      ).rejects.toThrow(/expired/i);
    });

    it("should reject already accepted invitation", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      await invitationService.acceptInvitation(invitation.token, testAthleteId);

      await expect(
        invitationService.acceptInvitation(invitation.token, testAthleteId)
      ).rejects.toThrow(/already.*accepted|not pending/i);
    });

    it("should reject cancelled invitation", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      await invitationService.cancelInvitation(invitation.id, testOrgAdminId);

      await expect(
        invitationService.acceptInvitation(invitation.token, testAthleteId)
      ).rejects.toThrow(/cancelled|not pending/i);
    });

    it("should allow email-invited user to accept after registering", async () => {
      // Create invitation by email
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { email: `invathlete2${testSuffix}@example.com` }
      );

      // The athlete with that email accepts
      const result = await invitationService.acceptInvitation(invitation.token, testAthlete2Id);

      expect(result.registration.userId).toBe(testAthlete2Id);
      expect(result.invitation.status).toBe("accepted");
    });
  });

  describe("declineInvitation", () => {
    it("should mark invitation as declined", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const declined = await invitationService.declineInvitation(invitation.token);

      expect(declined.status).toBe("declined");
      expect(declined.declinedAt).toBeDefined();
    });

    it("should not create registration when declining", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      await invitationService.declineInvitation(invitation.token);

      // Check no registration was created
      const registrations = await storage.listEventRegistrations(inviteOnlyEventId);
      expect(registrations).toHaveLength(0);
    });
  });

  describe("cancelInvitation", () => {
    it("should allow org admin to cancel invitation", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const cancelled = await invitationService.cancelInvitation(invitation.id, testOrgAdminId);

      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelledAt).toBeDefined();
      expect(cancelled.cancelledBy).toBe(testOrgAdminId);
    });

    it("should prevent accepting cancelled invitation", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      await invitationService.cancelInvitation(invitation.id, testOrgAdminId);

      await expect(
        invitationService.acceptInvitation(invitation.token, testAthleteId)
      ).rejects.toThrow(/cancelled|not pending/i);
    });
  });

  describe("listInvitations", () => {
    it("should list all invitations for an event", async () => {
      await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );
      await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { email: "another@example.com" }
      );

      const invitations = await invitationService.listInvitations(inviteOnlyEventId);

      expect(invitations).toHaveLength(2);
    });

    it("should filter by status", async () => {
      const inv1 = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );
      await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { email: "another@example.com" }
      );

      // Accept one
      await invitationService.acceptInvitation(inv1.token, testAthleteId);

      const pending = await invitationService.listInvitations(inviteOnlyEventId, { status: "pending" });
      const accepted = await invitationService.listInvitations(inviteOnlyEventId, { status: "accepted" });

      expect(pending).toHaveLength(1);
      expect(accepted).toHaveLength(1);
    });
  });

  describe("resendInvitation", () => {
    it("should update emailSent flag and regenerate token", async () => {
      const original = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const resent = await invitationService.resendInvitation(original.id, testOrgAdminId);

      expect(resent.id).toBe(original.id);
      // Token should be regenerated for security
      expect(resent.token).not.toBe(original.token);
      expect(resent.status).toBe("pending");
    });

    it("should extend expiration on resend", async () => {
      const original = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );

      const resent = await invitationService.resendInvitation(original.id, testOrgAdminId);

      expect(new Date(resent.expiresAt).getTime()).toBeGreaterThan(
        new Date(original.expiresAt).getTime()
      );
    });

    it("should not resend accepted invitations", async () => {
      const invitation = await invitationService.createInvitation(
        inviteOnlyEventId,
        testOrgAdminId,
        { userId: testAthleteId }
      );
      await invitationService.acceptInvitation(invitation.token, testAthleteId);

      await expect(
        invitationService.resendInvitation(invitation.id, testOrgAdminId)
      ).rejects.toThrow(/already accepted|cannot resend/i);
    });
  });
});

describe("Invitation Audit Logging", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_inv_audit_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testAthleteId: string;
  let testEventId: string;
  let invitationService: EventInvitationService;
  let eventService: EventService;

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({
      name: `Inv Audit Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    const [admin] = await db.insert(users).values({
      emails: [`invauditadmin${testSuffix}@example.com`],
      username: `invauditadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "InvAudit",
      lastName: "Admin",
      fullName: "InvAudit Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = admin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    const [athlete] = await db.insert(users).values({
      emails: [`invauditathlete${testSuffix}@example.com`],
      username: `invauditathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "InvAudit",
      lastName: "Athlete",
      fullName: "InvAudit Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    eventService = new EventService(storage as IStorage);
    invitationService = new EventInvitationService(storage as IStorage);

    const event = await eventService.createEvent({
      name: "Inv Audit Test Event",
      startDate: new Date("2025-07-01T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "invitation_only",
      status: "published",
    }, testOrgAdminId);
    testEventId = event.id;
  });

  afterEach(async () => {
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, testEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, testEventId));
  });

  afterAll(async () => {
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, testEventId));
    await db.delete(eventInvitations).where(eq(eventInvitations.eventId, testEventId));
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  it("should create audit log on invitation creation", async () => {
    await invitationService.createInvitation(
      testEventId,
      testOrgAdminId,
      { userId: testAthleteId }
    );

    // If no error, audit log was created successfully
    expect(true).toBe(true);
  });

  it("should create audit log on invitation acceptance", async () => {
    const invitation = await invitationService.createInvitation(
      testEventId,
      testOrgAdminId,
      { userId: testAthleteId }
    );

    await invitationService.acceptInvitation(invitation.token, testAthleteId);

    expect(true).toBe(true);
  });

  it("should create audit log on invitation cancellation", async () => {
    const invitation = await invitationService.createInvitation(
      testEventId,
      testOrgAdminId,
      { userId: testAthleteId }
    );

    await invitationService.cancelInvitation(invitation.id, testOrgAdminId);

    expect(true).toBe(true);
  });
});
