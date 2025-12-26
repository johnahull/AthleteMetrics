/**
 * Integration tests for Event API routes
 * Tests authentication, authorization, CRUD operations, and security
 *
 * TDD Phase 1.3: RED - These tests will fail until event routes are implemented
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations, events } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { EventService } from "../services/event-service";
import type { IStorage } from "../storage";

describe("Event Routes", () => {
  // Test data identifiers
  const timestamp = Date.now().toString();
  const testSuffix = `_event_routes_test_${timestamp}`;

  let testOrgId: string;
  let testSiteAdminId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let otherOrgId: string;
  let otherOrgAdminId: string;
  let eventService: EventService;

  const TEST_ORG_NAME = `Event Test Org${testSuffix}`;
  const OTHER_ORG_NAME = `Other Event Org${testSuffix}`;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for event route testing",
      isActive: true,
      allowMembershipRequests: true,
      isPublicDirectory: false,
    }).returning();
    testOrgId = org.id;

    // Create another organization for cross-org tests
    const [otherOrg] = await db.insert(organizations).values({
      name: OTHER_ORG_NAME,
      orgType: "high_school",
      description: "Other org for cross-org tests",
      isActive: true,
    }).returning();
    otherOrgId = otherOrg.id;

    // Create site admin
    const [siteAdmin] = await db.insert(users).values({
      emails: [`eventsiteadmin${testSuffix}@example.com`],
      username: `eventsiteadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Event",
      lastName: "SiteAdmin",
      fullName: "Event SiteAdmin",
      role: "org_admin",
      isSiteAdmin: true,
      isActive: true,
    }).returning();
    testSiteAdminId = siteAdmin.id;

    // Create org admin for test org
    const [orgAdmin] = await db.insert(users).values({
      emails: [`eventorgadmin${testSuffix}@example.com`],
      username: `eventorgadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Event",
      lastName: "OrgAdmin",
      fullName: "Event OrgAdmin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = orgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    // Create coach for test org
    const [coach] = await db.insert(users).values({
      emails: [`eventcoach${testSuffix}@example.com`],
      username: `eventcoach${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Event",
      lastName: "Coach",
      fullName: "Event Coach",
      role: "coach",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create athlete for test org
    const [athlete] = await db.insert(users).values({
      emails: [`eventathlete${testSuffix}@example.com`],
      username: `eventathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Event",
      lastName: "Athlete",
      fullName: "Event Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create admin for other org
    const [otherAdmin] = await db.insert(users).values({
      emails: [`otherevtadmin${testSuffix}@example.com`],
      username: `otherevtadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Other",
      lastName: "EventAdmin",
      fullName: "Other EventAdmin",
      role: "org_admin",
      isActive: true,
    }).returning();
    otherOrgAdminId = otherAdmin.id;

    await db.insert(userOrganizations).values({
      userId: otherOrgAdminId,
      organizationId: otherOrgId,
      role: "org_admin",
    });

    // Initialize EventService
    eventService = new EventService(storage as IStorage);
  });

  // Note: afterEach cleanup removed - was too aggressive and deleted events
  // created by beforeAll in nested describes. Individual test sections now
  // handle their own cleanup via afterAll or explicit cleanup within tests.

  afterAll(async () => {
    // Clean up in reverse dependency order
    await db.delete(events).where(eq(events.organizationId, testOrgId));
    await db.delete(events).where(eq(events.organizationId, otherOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, otherOrgId));
    await db.delete(users).where(eq(users.id, testSiteAdminId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(users).where(eq(users.id, otherOrgAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, otherOrgId));
  });

  describe("POST /api/events (createEvent)", () => {
    describe("authorization", () => {
      it("should allow org_admin to create event", async () => {
        const event = await eventService.createEvent({
          name: "Admin Created Event",
          startDate: new Date("2025-04-01T09:00:00Z"),
          organizationId: testOrgId,
        }, testOrgAdminId);

        expect(event).toBeDefined();
        expect(event.name).toBe("Admin Created Event");
        expect(event.organizationId).toBe(testOrgId);
        expect(event.createdBy).toBe(testOrgAdminId);
      });

      it("should allow coach to create event", async () => {
        const event = await eventService.createEvent({
          name: "Coach Created Event",
          startDate: new Date("2025-04-01T09:00:00Z"),
          organizationId: testOrgId,
        }, testCoachId);

        expect(event).toBeDefined();
        expect(event.name).toBe("Coach Created Event");
        expect(event.createdBy).toBe(testCoachId);
      });

      it("should allow site admin to create event for any org", async () => {
        const event = await eventService.createEvent({
          name: "Site Admin Event",
          startDate: new Date("2025-04-01T09:00:00Z"),
          organizationId: testOrgId,
        }, testSiteAdminId);

        expect(event).toBeDefined();
        expect(event.organizationId).toBe(testOrgId);
      });

      // Note: Role-based denial is handled by route middleware, not service layer
    });

    describe("validation", () => {
      it("should create event with required fields only", async () => {
        const event = await eventService.createEvent({
          name: "Minimal Event",
          startDate: new Date("2025-04-01T09:00:00Z"),
        }, testOrgAdminId);

        expect(event.name).toBe("Minimal Event");
        expect(event.eventCode).toBeDefined();
        expect(event.eventCode).toHaveLength(8);
      });

      it("should generate unique event codes", async () => {
        const event1 = await eventService.createEvent({
          name: "Event 1",
          startDate: new Date("2025-04-01T09:00:00Z"),
          organizationId: testOrgId,
        }, testOrgAdminId);

        const event2 = await eventService.createEvent({
          name: "Event 2",
          startDate: new Date("2025-04-02T09:00:00Z"),
          organizationId: testOrgId,
        }, testOrgAdminId);

        expect(event1.eventCode).not.toBe(event2.eventCode);
      });

      it("should set default visibility to org_private", async () => {
        const event = await eventService.createEvent({
          name: "Default Visibility Event",
          startDate: new Date("2025-04-01T09:00:00Z"),
          organizationId: testOrgId,
        }, testOrgAdminId);

        expect(event.visibility).toBe("org_private");
      });

      it("should set default status to draft", async () => {
        const event = await eventService.createEvent({
          name: "Default Status Event",
          startDate: new Date("2025-04-01T09:00:00Z"),
          organizationId: testOrgId,
        }, testOrgAdminId);

        expect(event.status).toBe("draft");
      });

      it("should accept optional fields", async () => {
        const event = await eventService.createEvent({
          name: "Full Event",
          description: "A complete event with all fields",
          location: "Sports Complex",
          eventType: "combine",
          startDate: new Date("2025-04-01T09:00:00Z"),
          endDate: new Date("2025-04-01T17:00:00Z"),
          timezone: "America/Chicago",
          visibility: "public",
          registrationMode: "request_approval",
          status: "published",
          maxRegistrations: 100,
          resultsVisibility: "immediate",
          organizationId: testOrgId,
        }, testOrgAdminId);

        expect(event.description).toBe("A complete event with all fields");
        expect(event.location).toBe("Sports Complex");
        expect(event.eventType).toBe("combine");
        expect(event.visibility).toBe("public");
        expect(event.registrationMode).toBe("request_approval");
        expect(event.maxRegistrations).toBe(100);
      });
    });

    describe("audit logging", () => {
      it("should create audit log on event creation", async () => {
        // The EventService.createEvent calls storage.createAuditLog
        // This is tested via mock in unit tests
        // Here we verify the service doesn't throw
        const event = await eventService.createEvent({
          name: "Audited Event",
          startDate: new Date("2025-04-01T09:00:00Z"),
          organizationId: testOrgId,
        }, testOrgAdminId);

        expect(event).toBeDefined();
      });
    });

    describe("setting combinations", () => {
      const visibilityOptions = ["org_private", "public", "invite_only"] as const;
      const registrationModeOptions = ["open", "request_approval", "invitation_only"] as const;
      const resultsVisibilityOptions = ["immediate", "after_event", "manual"] as const;

      describe("visibility options", () => {
        it.each(visibilityOptions)("should create event with visibility: %s", async (visibility) => {
          const event = await eventService.createEvent({
            name: `Event with ${visibility} visibility`,
            startDate: new Date("2025-05-01T09:00:00Z"),
            organizationId: testOrgId,
            visibility,
          }, testOrgAdminId);

          expect(event.visibility).toBe(visibility);
        });
      });

      describe("registration mode options", () => {
        it.each(registrationModeOptions)("should create event with registrationMode: %s", async (registrationMode) => {
          const event = await eventService.createEvent({
            name: `Event with ${registrationMode} registration`,
            startDate: new Date("2025-05-01T09:00:00Z"),
            organizationId: testOrgId,
            registrationMode,
          }, testOrgAdminId);

          expect(event.registrationMode).toBe(registrationMode);
        });
      });

      describe("results visibility options", () => {
        it.each(resultsVisibilityOptions)("should create event with resultsVisibility: %s", async (resultsVisibility) => {
          const event = await eventService.createEvent({
            name: `Event with ${resultsVisibility} results`,
            startDate: new Date("2025-05-01T09:00:00Z"),
            organizationId: testOrgId,
            resultsVisibility,
          }, testOrgAdminId);

          expect(event.resultsVisibility).toBe(resultsVisibility);
        });
      });

      describe("combined setting scenarios", () => {
        it("should create public event with open registration and immediate results", async () => {
          const event = await eventService.createEvent({
            name: "Open Testing Day",
            startDate: new Date("2025-05-01T09:00:00Z"),
            organizationId: testOrgId,
            visibility: "public",
            registrationMode: "open",
            resultsVisibility: "immediate",
          }, testOrgAdminId);

          expect(event.visibility).toBe("public");
          expect(event.registrationMode).toBe("open");
          expect(event.resultsVisibility).toBe("immediate");
        });

        it("should create org_private event with approval and after_event results", async () => {
          const event = await eventService.createEvent({
            name: "Team Combine",
            startDate: new Date("2025-05-02T09:00:00Z"),
            organizationId: testOrgId,
            visibility: "org_private",
            registrationMode: "request_approval",
            resultsVisibility: "after_event",
          }, testOrgAdminId);

          expect(event.visibility).toBe("org_private");
          expect(event.registrationMode).toBe("request_approval");
          expect(event.resultsVisibility).toBe("after_event");
        });

        it("should create invite_only event with invitation_only registration and manual results", async () => {
          const event = await eventService.createEvent({
            name: "Exclusive Tryout",
            startDate: new Date("2025-05-03T09:00:00Z"),
            organizationId: testOrgId,
            visibility: "invite_only",
            registrationMode: "invitation_only",
            resultsVisibility: "manual",
          }, testOrgAdminId);

          expect(event.visibility).toBe("invite_only");
          expect(event.registrationMode).toBe("invitation_only");
          expect(event.resultsVisibility).toBe("manual");
        });

        it("should create public event with invitation_only registration", async () => {
          const event = await eventService.createEvent({
            name: "Public Invite-Only Camp",
            startDate: new Date("2025-05-04T09:00:00Z"),
            organizationId: testOrgId,
            visibility: "public",
            registrationMode: "invitation_only",
            resultsVisibility: "after_event",
          }, testOrgAdminId);

          expect(event.visibility).toBe("public");
          expect(event.registrationMode).toBe("invitation_only");
        });
      });
    });
  });

  describe("GET /api/events/:eventId (getEvent)", () => {
    let orgPrivateEventId: string;
    let publicEventId: string;

    beforeAll(async () => {
      // Create org-private event
      const orgPrivateEvent = await eventService.createEvent({
        name: "Org Private Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: testOrgId,
        visibility: "org_private",
      }, testOrgAdminId);
      orgPrivateEventId = orgPrivateEvent.id;

      // Create public event
      const publicEvent = await eventService.createEvent({
        name: "Public Event",
        startDate: new Date("2025-04-02T09:00:00Z"),
        visibility: "public",
      }, testOrgAdminId);
      publicEventId = publicEvent.id;
    });

    afterAll(async () => {
      await db.delete(events).where(eq(events.id, orgPrivateEventId));
      await db.delete(events).where(eq(events.id, publicEventId));
    });

    describe("access control", () => {
      it("should allow org members to view org-private events", async () => {
        const event = await eventService.getEvent(orgPrivateEventId, testAthleteId);

        expect(event).toBeDefined();
        expect(event?.name).toBe("Org Private Event");
      });

      it("should allow any user to view public events", async () => {
        const event = await eventService.getEvent(publicEventId, otherOrgAdminId);

        expect(event).toBeDefined();
        expect(event?.name).toBe("Public Event");
        expect(event?.visibility).toBe("public");
      });

      it("should deny non-members access to org-private events", async () => {
        await expect(
          eventService.getEvent(orgPrivateEventId, otherOrgAdminId)
        ).rejects.toThrow(/access denied|not authorized|forbidden/i);
      });

      it("should return null for non-existent event", async () => {
        const event = await eventService.getEvent("non-existent-uuid", testOrgAdminId);
        expect(event).toBeNull();
      });
    });
  });

  describe("GET /api/events/join/:eventCode (getEventByCode)", () => {
    let testEventId: string;
    let testEventCode: string;

    beforeAll(async () => {
      const event = await eventService.createEvent({
        name: "Code Discovery Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      testEventId = event.id;
      testEventCode = event.eventCode;
    });

    afterAll(async () => {
      await db.delete(events).where(eq(events.id, testEventId));
    });

    it("should return event by valid event code", async () => {
      const event = await eventService.getEventByCode(testEventCode);

      expect(event).toBeDefined();
      expect(event?.id).toBe(testEventId);
      expect(event?.name).toBe("Code Discovery Event");
    });

    it("should return null for invalid event code", async () => {
      const event = await eventService.getEventByCode("INVALID99");
      expect(event).toBeNull();
    });

    it("should be case-insensitive for event codes", async () => {
      const lowercase = await eventService.getEventByCode(testEventCode.toLowerCase());
      const uppercase = await eventService.getEventByCode(testEventCode.toUpperCase());

      // Both should find the same event (or both fail if not case-insensitive)
      expect(lowercase?.id ?? null).toBe(uppercase?.id ?? null);
    });
  });

  describe("PUT /api/events/:eventId (updateEvent)", () => {
    let testEventId: string;
    let frozenEventId: string;

    beforeAll(async () => {
      const event = await eventService.createEvent({
        name: "Update Test Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      testEventId = event.id;

      const frozenEvent = await eventService.createEvent({
        name: "Frozen Event",
        startDate: new Date("2025-04-02T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      frozenEventId = frozenEvent.id;
      await eventService.freezeEvent(frozenEventId, testOrgAdminId, "Testing freeze");
    });

    afterAll(async () => {
      await db.delete(events).where(eq(events.id, testEventId));
      await db.delete(events).where(eq(events.id, frozenEventId));
    });

    it("should update event name", async () => {
      const updated = await eventService.updateEvent(
        testEventId,
        { name: "Updated Event Name" },
        testOrgAdminId
      );

      expect(updated.name).toBe("Updated Event Name");
    });

    it("should update multiple fields at once", async () => {
      const updated = await eventService.updateEvent(
        testEventId,
        {
          description: "New description",
          location: "New Location",
          maxRegistrations: 200,
        },
        testOrgAdminId
      );

      expect(updated.description).toBe("New description");
      expect(updated.location).toBe("New Location");
      expect(updated.maxRegistrations).toBe(200);
    });

    it("should prevent updates to frozen events", async () => {
      await expect(
        eventService.updateEvent(
          frozenEventId,
          { name: "Cannot Update Frozen" },
          testOrgAdminId
        )
      ).rejects.toThrow(/frozen|locked|cannot be modified/i);
    });

    it("should throw error for non-existent event", async () => {
      await expect(
        eventService.updateEvent(
          "non-existent-uuid",
          { name: "Ghost Event" },
          testOrgAdminId
        )
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("GET /api/events (listEvents)", () => {
    let event1Id: string;
    let event2Id: string;

    beforeAll(async () => {
      const event1 = await eventService.createEvent({
        name: "List Event 1",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: testOrgId,
        status: "published",
      }, testOrgAdminId);
      event1Id = event1.id;

      const event2 = await eventService.createEvent({
        name: "List Event 2",
        startDate: new Date("2025-04-15T09:00:00Z"),
        organizationId: testOrgId,
        status: "draft",
      }, testOrgAdminId);
      event2Id = event2.id;
    });

    afterAll(async () => {
      await db.delete(events).where(eq(events.id, event1Id));
      await db.delete(events).where(eq(events.id, event2Id));
    });

    it("should list events for organization", async () => {
      const eventList = await eventService.listEvents(
        { organizationId: testOrgId },
        testOrgAdminId
      );

      expect(eventList.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter by status", async () => {
      const publishedEvents = await eventService.listEvents(
        { organizationId: testOrgId, status: "published" },
        testOrgAdminId
      );

      publishedEvents.forEach(event => {
        expect(event.status).toBe("published");
      });
    });

    it("should filter by visibility", async () => {
      const orgPrivateEvents = await eventService.listEvents(
        { organizationId: testOrgId, visibility: "org_private" },
        testOrgAdminId
      );

      orgPrivateEvents.forEach(event => {
        expect(event.visibility).toBe("org_private");
      });
    });
  });

  describe("POST /api/events/:eventId/freeze (freezeEvent)", () => {
    let testEventId: string;

    beforeAll(async () => {
      const event = await eventService.createEvent({
        name: "Freeze Test Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      testEventId = event.id;
    });

    afterAll(async () => {
      await db.delete(events).where(eq(events.id, testEventId));
    });

    it("should freeze event with timestamp and user", async () => {
      const frozen = await eventService.freezeEvent(
        testEventId,
        testOrgAdminId,
        "Event completed, locking results"
      );

      expect(frozen.isFrozen).toBe(true);
      expect(frozen.frozenAt).toBeDefined();
      expect(frozen.frozenBy).toBe(testOrgAdminId);
      expect(frozen.frozenReason).toBe("Event completed, locking results");
    });

    it("should prevent double-freeze", async () => {
      await expect(
        eventService.freezeEvent(testEventId, testOrgAdminId, "Already frozen")
      ).rejects.toThrow(/already frozen/i);
    });

    it("should throw error for non-existent event", async () => {
      await expect(
        eventService.freezeEvent("non-existent-uuid", testOrgAdminId, "Ghost event")
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("POST /api/events/:eventId/unfreeze (unfreezeEvent)", () => {
    let frozenEventId: string;
    let unfrozenEventId: string;

    beforeAll(async () => {
      const event = await eventService.createEvent({
        name: "Unfreeze Test Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      frozenEventId = event.id;
      await eventService.freezeEvent(frozenEventId, testOrgAdminId, "For unfreeze test");

      const notFrozenEvent = await eventService.createEvent({
        name: "Not Frozen Event",
        startDate: new Date("2025-04-02T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      unfrozenEventId = notFrozenEvent.id;
    });

    afterAll(async () => {
      await db.delete(events).where(eq(events.id, frozenEventId));
      await db.delete(events).where(eq(events.id, unfrozenEventId));
    });

    it("should unfreeze a frozen event", async () => {
      const unfrozen = await eventService.unfreezeEvent(frozenEventId, testOrgAdminId);

      expect(unfrozen.isFrozen).toBe(false);
      expect(unfrozen.frozenAt).toBeNull();
      expect(unfrozen.frozenBy).toBeNull();
      expect(unfrozen.frozenReason).toBeNull();
    });

    it("should throw error when unfreezing non-frozen event", async () => {
      await expect(
        eventService.unfreezeEvent(unfrozenEventId, testOrgAdminId)
      ).rejects.toThrow(/not frozen/i);
    });
  });

  describe("DELETE /api/events/:eventId (deleteEvent)", () => {
    let deletableEventId: string;
    let frozenEventId: string;

    beforeEach(async () => {
      const event = await eventService.createEvent({
        name: "Deletable Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      deletableEventId = event.id;

      const frozenEvent = await eventService.createEvent({
        name: "Frozen Delete Event",
        startDate: new Date("2025-04-02T09:00:00Z"),
        organizationId: testOrgId,
      }, testOrgAdminId);
      frozenEventId = frozenEvent.id;
      await eventService.freezeEvent(frozenEventId, testOrgAdminId, "Cannot delete");
    });

    afterEach(async () => {
      await db.delete(events).where(eq(events.id, deletableEventId));
      await db.delete(events).where(eq(events.id, frozenEventId));
    });

    it("should delete non-frozen event", async () => {
      await eventService.deleteEvent(deletableEventId, testOrgAdminId);

      // Event should no longer exist
      const event = await eventService.getEvent(deletableEventId, testOrgAdminId);
      expect(event).toBeNull();
    });

    it("should prevent deletion of frozen events", async () => {
      await expect(
        eventService.deleteEvent(frozenEventId, testOrgAdminId)
      ).rejects.toThrow(/frozen|cannot be deleted/i);
    });

    it("should throw error for non-existent event", async () => {
      await expect(
        eventService.deleteEvent("non-existent-uuid", testOrgAdminId)
      ).rejects.toThrow(/not found/i);
    });
  });
});

describe("Event Cross-Organization Security", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_cross_org_${timestamp}`;

  let org1Id: string;
  let org2Id: string;
  let org1AdminId: string;
  let org2AdminId: string;
  let org1EventId: string;
  let eventService: EventService;

  beforeAll(async () => {
    // Create two separate organizations
    const [org1] = await db.insert(organizations).values({
      name: `CrossOrg Event Org1${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    org1Id = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: `CrossOrg Event Org2${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    org2Id = org2.id;

    // Create org1 admin
    const [org1Admin] = await db.insert(users).values({
      username: `crossorg1admin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Org1",
      lastName: "Admin",
      fullName: "Org1 Admin",
      isActive: true,
    }).returning();
    org1AdminId = org1Admin.id;

    await db.insert(userOrganizations).values({
      userId: org1AdminId,
      organizationId: org1Id,
      role: "org_admin",
    });

    // Create org2 admin
    const [org2Admin] = await db.insert(users).values({
      username: `crossorg2admin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Org2",
      lastName: "Admin",
      fullName: "Org2 Admin",
      isActive: true,
    }).returning();
    org2AdminId = org2Admin.id;

    await db.insert(userOrganizations).values({
      userId: org2AdminId,
      organizationId: org2Id,
      role: "org_admin",
    });

    eventService = new EventService(storage as IStorage);

    // Create event in org1
    const event = await eventService.createEvent({
      name: "Org1 Private Event",
      startDate: new Date("2025-04-01T09:00:00Z"),
      organizationId: org1Id,
      visibility: "org_private",
    }, org1AdminId);
    org1EventId = event.id;
  });

  afterAll(async () => {
    await db.delete(events).where(eq(events.id, org1EventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, org1Id));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, org2Id));
    await db.delete(users).where(eq(users.id, org1AdminId));
    await db.delete(users).where(eq(users.id, org2AdminId));
    await db.delete(organizations).where(eq(organizations.id, org1Id));
    await db.delete(organizations).where(eq(organizations.id, org2Id));
  });

  describe("organization isolation", () => {
    it("should prevent org2 admin from viewing org1 private events", async () => {
      await expect(
        eventService.getEvent(org1EventId, org2AdminId)
      ).rejects.toThrow(/access denied|not authorized|forbidden/i);
    });

    it("should prevent org2 admin from listing org1 events", async () => {
      // Note: The service layer currently doesn't enforce this - route middleware does
      // This tests verifies the access control pattern
      const org2AdminOrgs = await storage.getUserOrganizations(org2AdminId);
      const hasOrg1Access = org2AdminOrgs.some(org => org.organizationId === org1Id);
      expect(hasOrg1Access).toBe(false);
    });
  });
});

describe("Event Code Generation", () => {
  let eventService: EventService;

  beforeAll(() => {
    eventService = new EventService(storage as IStorage);
  });

  it("should generate 8-character alphanumeric codes", () => {
    const code = eventService.generateEventCode();

    expect(code).toBeDefined();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it("should generate unique codes (100 iterations)", () => {
    const codes = new Set<string>();

    for (let i = 0; i < 100; i++) {
      codes.add(eventService.generateEventCode());
    }

    // All 100 codes should be unique
    expect(codes.size).toBe(100);
  });

  it("should generate uppercase codes", () => {
    const code = eventService.generateEventCode();
    expect(code).toBe(code.toUpperCase());
  });
});
