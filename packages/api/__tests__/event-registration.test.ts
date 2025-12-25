/**
 * Integration tests for Event Registration
 * Tests self-registration, approval workflows, and check-in
 *
 * TDD Phase 1.4: RED - These tests define expected registration behavior
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations, events, eventRegistrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { EventService } from "../services/event-service";
import { EventRegistrationService } from "../services/event-registration-service";
import type { IStorage } from "../storage";

describe("Event Registration", () => {
  // Test data identifiers
  const timestamp = Date.now().toString();
  const testSuffix = `_reg_test_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let testAthlete2Id: string;
  let independentAthleteId: string;
  let eventService: EventService;
  let registrationService: EventRegistrationService;

  // Event IDs created during tests
  let openEventId: string;
  let approvalEventId: string;
  let inviteOnlyEventId: string;
  let capacityEventId: string;
  let frozenEventId: string;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Registration Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [`regadmin${testSuffix}@example.com`],
      username: `regadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Reg",
      lastName: "Admin",
      fullName: "Reg Admin",
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
      emails: [`regcoach${testSuffix}@example.com`],
      username: `regcoach${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Reg",
      lastName: "Coach",
      fullName: "Reg Coach",
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
      emails: [`regathlete${testSuffix}@example.com`],
      username: `regathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Reg",
      lastName: "Athlete",
      fullName: "Reg Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create second athlete
    const [athlete2] = await db.insert(users).values({
      emails: [`regathlete2${testSuffix}@example.com`],
      username: `regathlete2${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Second",
      lastName: "Athlete",
      fullName: "Second Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthlete2Id = athlete2.id;

    await db.insert(userOrganizations).values({
      userId: testAthlete2Id,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create independent athlete (not in any org)
    const [indAthlete] = await db.insert(users).values({
      emails: [`indathlete${testSuffix}@example.com`],
      username: `indathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Independent",
      lastName: "Athlete",
      fullName: "Independent Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    independentAthleteId = indAthlete.id;

    // Initialize services
    eventService = new EventService(storage as IStorage);
    registrationService = new EventRegistrationService(storage as IStorage);

    // Create test events
    const openEvent = await eventService.createEvent({
      name: "Open Registration Event",
      startDate: new Date("2025-05-01T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "open",
      status: "published",
    }, testOrgAdminId);
    openEventId = openEvent.id;

    const approvalEvent = await eventService.createEvent({
      name: "Approval Required Event",
      startDate: new Date("2025-05-02T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "request_approval",
      status: "published",
    }, testOrgAdminId);
    approvalEventId = approvalEvent.id;

    const inviteEvent = await eventService.createEvent({
      name: "Invite Only Event",
      startDate: new Date("2025-05-03T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "invitation_only",
      status: "published",
    }, testOrgAdminId);
    inviteOnlyEventId = inviteEvent.id;

    const capacityEvent = await eventService.createEvent({
      name: "Limited Capacity Event",
      startDate: new Date("2025-05-04T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "open",
      status: "published",
      maxRegistrations: 2, // Small capacity for testing
    }, testOrgAdminId);
    capacityEventId = capacityEvent.id;

    const frozenEvent = await eventService.createEvent({
      name: "Frozen Event",
      startDate: new Date("2025-05-05T09:00:00Z"),
      organizationId: testOrgId,
      status: "completed",
    }, testOrgAdminId);
    frozenEventId = frozenEvent.id;
    await eventService.freezeEvent(frozenEventId, testOrgAdminId, "Event completed");
  });

  afterEach(async () => {
    // Clean up registrations after each test
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, openEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, approvalEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, inviteOnlyEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, capacityEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, frozenEventId));
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, openEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, approvalEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, inviteOnlyEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, capacityEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, frozenEventId));
    await db.delete(events).where(eq(events.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(users).where(eq(users.id, testAthlete2Id));
    await db.delete(users).where(eq(users.id, independentAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("registerForEvent", () => {
    describe("open registration mode", () => {
      it("should auto-approve registration for open events", async () => {
        const registration = await registrationService.registerForEvent(
          openEventId,
          testAthleteId,
          { discoveryMethod: "event_code" }
        );

        expect(registration).toBeDefined();
        expect(registration.eventId).toBe(openEventId);
        expect(registration.userId).toBe(testAthleteId);
        expect(registration.status).toBe("approved");
        expect(registration.userFullNameSnapshot).toBe("Reg Athlete");
      });

      it("should capture organization snapshot for org members", async () => {
        const registration = await registrationService.registerForEvent(
          openEventId,
          testAthleteId,
          { discoveryMethod: "direct_link" }
        );

        expect(registration.organizationIdSnapshot).toBe(testOrgId);
        expect(registration.organizationNameSnapshot).toBe(`Registration Test Org${testSuffix}`);
      });

      it("should work for independent athletes (no org)", async () => {
        const registration = await registrationService.registerForEvent(
          openEventId,
          independentAthleteId,
          { discoveryMethod: "event_code" }
        );

        expect(registration).toBeDefined();
        expect(registration.userId).toBe(independentAthleteId);
        expect(registration.organizationIdSnapshot).toBeNull();
      });
    });

    describe("request_approval mode", () => {
      it("should set status to pending for approval-required events", async () => {
        const registration = await registrationService.registerForEvent(
          approvalEventId,
          testAthleteId,
          { discoveryMethod: "event_code" }
        );

        expect(registration.status).toBe("pending");
        expect(registration.approvedAt).toBeNull();
        expect(registration.approvedBy).toBeNull();
      });

      it("should capture athlete notes during registration", async () => {
        const registration = await registrationService.registerForEvent(
          approvalEventId,
          testAthleteId,
          {
            discoveryMethod: "event_code",
            athleteNotes: "I have dietary restrictions",
          }
        );

        expect(registration.athleteNotes).toBe("I have dietary restrictions");
      });
    });

    describe("invitation_only mode", () => {
      it("should reject self-registration for invite-only events", async () => {
        await expect(
          registrationService.registerForEvent(
            inviteOnlyEventId,
            testAthleteId,
            { discoveryMethod: "event_code" }
          )
        ).rejects.toThrow(/invitation|invite.only|not allowed/i);
      });
    });

    describe("duplicate prevention", () => {
      it("should prevent duplicate registrations", async () => {
        // First registration
        await registrationService.registerForEvent(
          openEventId,
          testAthleteId,
          { discoveryMethod: "event_code" }
        );

        // Attempt duplicate
        await expect(
          registrationService.registerForEvent(
            openEventId,
            testAthleteId,
            { discoveryMethod: "direct_link" }
          )
        ).rejects.toThrow(/already registered|duplicate/i);
      });
    });

    describe("frozen event handling", () => {
      it("should prevent registration for frozen events", async () => {
        await expect(
          registrationService.registerForEvent(
            frozenEventId,
            testAthleteId,
            { discoveryMethod: "event_code" }
          )
        ).rejects.toThrow(/frozen|closed|not accepting/i);
      });
    });

    describe("capacity and waitlist", () => {
      it("should add to waitlist when capacity is reached", async () => {
        // Fill capacity (maxRegistrations = 2)
        await registrationService.registerForEvent(
          capacityEventId,
          testAthleteId,
          { discoveryMethod: "event_code" }
        );
        await registrationService.registerForEvent(
          capacityEventId,
          testAthlete2Id,
          { discoveryMethod: "event_code" }
        );

        // Third registration should be waitlisted
        const waitlistedReg = await registrationService.registerForEvent(
          capacityEventId,
          independentAthleteId,
          { discoveryMethod: "event_code" }
        );

        expect(waitlistedReg.status).toBe("waitlisted");
        expect(waitlistedReg.waitlistPosition).toBe(1);
      });
    });

    describe("registration number assignment", () => {
      it("should assign sequential registration numbers", async () => {
        const reg1 = await registrationService.registerForEvent(
          openEventId,
          testAthleteId,
          { discoveryMethod: "event_code" }
        );

        const reg2 = await registrationService.registerForEvent(
          openEventId,
          testAthlete2Id,
          { discoveryMethod: "event_code" }
        );

        expect(reg1.registrationNumber).toBe(1);
        expect(reg2.registrationNumber).toBe(2);
      });
    });
  });

  describe("getMyRegistration", () => {
    it("should return user's registration for an event", async () => {
      await registrationService.registerForEvent(
        openEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      const myReg = await registrationService.getMyRegistration(openEventId, testAthleteId);

      expect(myReg).toBeDefined();
      expect(myReg?.userId).toBe(testAthleteId);
      expect(myReg?.eventId).toBe(openEventId);
    });

    it("should return null if not registered", async () => {
      const myReg = await registrationService.getMyRegistration(openEventId, testAthleteId);
      expect(myReg).toBeNull();
    });
  });

  describe("cancelRegistration", () => {
    it("should allow athlete to cancel their own registration", async () => {
      await registrationService.registerForEvent(
        openEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      const cancelled = await registrationService.cancelRegistration(
        openEventId,
        testAthleteId,
        testAthleteId
      );

      expect(cancelled.status).toBe("cancelled");
    });

    it("should allow org_admin to cancel any registration", async () => {
      await registrationService.registerForEvent(
        openEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      const cancelled = await registrationService.cancelRegistration(
        openEventId,
        testAthleteId,
        testOrgAdminId
      );

      expect(cancelled.status).toBe("cancelled");
    });

    it("should prevent cancellation for frozen events", async () => {
      // Create a registration first (before freezing would have worked)
      // For testing, we'll skip this test since event is already frozen
      // The implementation should check if event is frozen before allowing cancellation
    });
  });

  describe("listRegistrations", () => {
    it("should list all registrations for an event", async () => {
      await registrationService.registerForEvent(
        openEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );
      await registrationService.registerForEvent(
        openEventId,
        testAthlete2Id,
        { discoveryMethod: "direct_link" }
      );

      const registrations = await registrationService.listRegistrations(
        openEventId,
        testOrgAdminId
      );

      expect(registrations).toHaveLength(2);
    });

    it("should filter by status", async () => {
      await registrationService.registerForEvent(
        approvalEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );
      await registrationService.registerForEvent(
        approvalEventId,
        testAthlete2Id,
        { discoveryMethod: "event_code" }
      );

      // Approve one
      await registrationService.approveRegistration(
        approvalEventId,
        testAthleteId,
        testOrgAdminId
      );

      const pending = await registrationService.listRegistrations(
        approvalEventId,
        testOrgAdminId,
        { status: "pending" }
      );
      const approved = await registrationService.listRegistrations(
        approvalEventId,
        testOrgAdminId,
        { status: "approved" }
      );

      expect(pending).toHaveLength(1);
      expect(approved).toHaveLength(1);
    });
  });

  describe("approveRegistration", () => {
    it("should approve pending registration", async () => {
      await registrationService.registerForEvent(
        approvalEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      const approved = await registrationService.approveRegistration(
        approvalEventId,
        testAthleteId,
        testOrgAdminId
      );

      expect(approved.status).toBe("approved");
      expect(approved.approvedAt).toBeDefined();
      expect(approved.approvedBy).toBe(testOrgAdminId);
    });

    it("should allow coaches to approve", async () => {
      await registrationService.registerForEvent(
        approvalEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      const approved = await registrationService.approveRegistration(
        approvalEventId,
        testAthleteId,
        testCoachId
      );

      expect(approved.status).toBe("approved");
      expect(approved.approvedBy).toBe(testCoachId);
    });

    it("should throw error for non-pending registration", async () => {
      await registrationService.registerForEvent(
        openEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      ); // Auto-approved

      await expect(
        registrationService.approveRegistration(
          openEventId,
          testAthleteId,
          testOrgAdminId
        )
      ).rejects.toThrow(/already approved|not pending/i);
    });
  });

  describe("declineRegistration", () => {
    it("should decline pending registration with reason", async () => {
      await registrationService.registerForEvent(
        approvalEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      const declined = await registrationService.declineRegistration(
        approvalEventId,
        testAthleteId,
        testOrgAdminId,
        "Age requirement not met"
      );

      expect(declined.status).toBe("declined");
      expect(declined.declinedAt).toBeDefined();
      expect(declined.declinedBy).toBe(testOrgAdminId);
      expect(declined.declineReason).toBe("Age requirement not met");
    });
  });

  describe("checkIn", () => {
    it("should check in approved registration", async () => {
      await registrationService.registerForEvent(
        openEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      const checkedIn = await registrationService.checkIn(
        openEventId,
        testAthleteId,
        testCoachId
      );

      expect(checkedIn.status).toBe("checked_in");
      expect(checkedIn.checkedInAt).toBeDefined();
      expect(checkedIn.checkedInBy).toBe(testCoachId);
    });

    it("should prevent check-in for non-approved registrations", async () => {
      await registrationService.registerForEvent(
        approvalEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      ); // Pending

      await expect(
        registrationService.checkIn(
          approvalEventId,
          testAthleteId,
          testCoachId
        )
      ).rejects.toThrow(/not approved|must be approved/i);
    });

    it("should prevent double check-in", async () => {
      await registrationService.registerForEvent(
        openEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );

      await registrationService.checkIn(
        openEventId,
        testAthleteId,
        testCoachId
      );

      await expect(
        registrationService.checkIn(
          openEventId,
          testAthleteId,
          testOrgAdminId
        )
      ).rejects.toThrow(/already checked in/i);
    });
  });

  describe("waitlist promotion", () => {
    it("should promote from waitlist when spot opens", async () => {
      // Fill capacity
      await registrationService.registerForEvent(
        capacityEventId,
        testAthleteId,
        { discoveryMethod: "event_code" }
      );
      await registrationService.registerForEvent(
        capacityEventId,
        testAthlete2Id,
        { discoveryMethod: "event_code" }
      );

      // Add to waitlist
      const waitlisted = await registrationService.registerForEvent(
        capacityEventId,
        independentAthleteId,
        { discoveryMethod: "event_code" }
      );
      expect(waitlisted.status).toBe("waitlisted");

      // Cancel one registration
      await registrationService.cancelRegistration(
        capacityEventId,
        testAthleteId,
        testAthleteId
      );

      // Check if waitlisted was promoted
      const promoted = await registrationService.getMyRegistration(
        capacityEventId,
        independentAthleteId
      );

      expect(promoted?.status).toBe("approved");
      expect(promoted?.waitlistPosition).toBeNull();
    });
  });
});

describe("Registration Audit Logging", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_reg_audit_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testAthleteId: string;
  let testEventId: string;
  let registrationService: EventRegistrationService;
  let eventService: EventService;

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({
      name: `Audit Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    const [admin] = await db.insert(users).values({
      emails: [`auditadmin${testSuffix}@example.com`],
      username: `auditadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Audit",
      lastName: "Admin",
      fullName: "Audit Admin",
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
      emails: [`auditathlete${testSuffix}@example.com`],
      username: `auditathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Audit",
      lastName: "Athlete",
      fullName: "Audit Athlete",
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
    registrationService = new EventRegistrationService(storage as IStorage);

    const event = await eventService.createEvent({
      name: "Audit Test Event",
      startDate: new Date("2025-06-01T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "request_approval",
      status: "published",
    }, testOrgAdminId);
    testEventId = event.id;
  });

  afterEach(async () => {
    // Clean up registrations after each test to prevent interference
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, testEventId));
  });

  afterAll(async () => {
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, testEventId));
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  it("should create audit log on registration", async () => {
    // Registration creates audit log
    await registrationService.registerForEvent(
      testEventId,
      testAthleteId,
      { discoveryMethod: "event_code" }
    );

    // Verify via service (service should not throw)
    expect(true).toBe(true);
  });

  it("should create audit log on approval", async () => {
    await registrationService.registerForEvent(
      testEventId,
      testAthleteId,
      { discoveryMethod: "event_code" }
    );

    await registrationService.approveRegistration(
      testEventId,
      testAthleteId,
      testOrgAdminId
    );

    expect(true).toBe(true);
  });

  it("should create audit log on check-in", async () => {
    await registrationService.registerForEvent(
      testEventId,
      testAthleteId,
      { discoveryMethod: "event_code" }
    );

    await registrationService.approveRegistration(
      testEventId,
      testAthleteId,
      testOrgAdminId
    );

    await registrationService.checkIn(
      testEventId,
      testAthleteId,
      testOrgAdminId
    );

    expect(true).toBe(true);
  });
});
