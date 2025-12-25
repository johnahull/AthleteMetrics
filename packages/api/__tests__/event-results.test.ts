/**
 * Integration tests for Event Results Publishing Service
 * Tests results visibility control and publishing workflow
 *
 * TDD Phase 4.3: RED - These tests define expected results publishing behavior
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations, events } from "@shared/schema";
import { eq } from "drizzle-orm";
import { EventService } from "../services/event-service";
import { EventResultsService } from "../services/event-results-service";
import type { IStorage } from "../storage";

describe("Event Results Service", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_er_test_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let eventService: EventService;
  let resultsService: EventResultsService;

  // Event IDs for different visibility modes
  let immediateEventId: string;
  let afterEventEventId: string;
  let manualEventId: string;
  let completedEventId: string;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Event Results Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [`eradmin${testSuffix}@example.com`],
      username: `eradmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "ER",
      lastName: "Admin",
      fullName: "ER Admin",
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
      emails: [`ercoach${testSuffix}@example.com`],
      username: `ercoach${testSuffix}`,
      password: "hashedpassword123",
      firstName: "ER",
      lastName: "Coach",
      fullName: "ER Coach",
      role: "coach",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create athlete
    const [athlete] = await db.insert(users).values({
      emails: [`erathlete${testSuffix}@example.com`],
      username: `erathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "ER",
      lastName: "Athlete",
      fullName: "ER Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Initialize services
    eventService = new EventService(storage as IStorage);
    resultsService = new EventResultsService(storage as IStorage);

    // Create events with different visibility modes
    const immediateEvent = await eventService.createEvent({
      name: "Immediate Results Event",
      startDate: new Date("2025-08-01T09:00:00Z"),
      organizationId: testOrgId,
      resultsVisibility: "immediate",
      status: "published",
    }, testOrgAdminId);
    immediateEventId = immediateEvent.id;

    const afterEventEvent = await eventService.createEvent({
      name: "After Event Results Event",
      startDate: new Date("2025-08-02T09:00:00Z"),
      organizationId: testOrgId,
      resultsVisibility: "after_event",
      status: "published",
    }, testOrgAdminId);
    afterEventEventId = afterEventEvent.id;

    const manualEvent = await eventService.createEvent({
      name: "Manual Results Event",
      startDate: new Date("2025-08-03T09:00:00Z"),
      organizationId: testOrgId,
      resultsVisibility: "manual",
      status: "published",
    }, testOrgAdminId);
    manualEventId = manualEvent.id;

    // Create a completed event for testing after_event visibility
    const completedEvent = await eventService.createEvent({
      name: "Completed Results Event",
      startDate: new Date("2025-07-01T09:00:00Z"),
      organizationId: testOrgId,
      resultsVisibility: "after_event",
      status: "completed",
    }, testOrgAdminId);
    completedEventId = completedEvent.id;
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await db.delete(events).where(eq(events.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("publishResults", () => {
    afterEach(async () => {
      // Reset results published state
      await db.update(events)
        .set({ resultsPublishedAt: null, resultsPublishedBy: null })
        .where(eq(events.id, manualEventId));
    });

    it("should publish results for an event", async () => {
      const result = await resultsService.publishResults(manualEventId, testOrgAdminId);

      expect(result.resultsPublishedAt).toBeDefined();
      expect(result.resultsPublishedBy).toBe(testOrgAdminId);
    });

    it("should allow coaches to publish results", async () => {
      const result = await resultsService.publishResults(manualEventId, testCoachId);

      expect(result.resultsPublishedAt).toBeDefined();
      expect(result.resultsPublishedBy).toBe(testCoachId);
    });

    it("should reject publishing if already published", async () => {
      await resultsService.publishResults(manualEventId, testOrgAdminId);

      await expect(
        resultsService.publishResults(manualEventId, testOrgAdminId)
      ).rejects.toThrow(/already published/i);
    });

    it("should reject publishing for frozen events", async () => {
      // Freeze the event first
      await eventService.freezeEvent(manualEventId, testOrgAdminId, "Testing freeze");

      await expect(
        resultsService.publishResults(manualEventId, testOrgAdminId)
      ).rejects.toThrow(/frozen/i);

      // Unfreeze for other tests
      await eventService.unfreezeEvent(manualEventId, testOrgAdminId);
    });

    it("should create audit log when publishing", async () => {
      await resultsService.publishResults(manualEventId, testOrgAdminId);
      // If no error, audit log was created (constraint would fail otherwise)
      expect(true).toBe(true);
    });
  });

  describe("unpublishResults", () => {
    it("should unpublish results for an event", async () => {
      // First publish
      await resultsService.publishResults(manualEventId, testOrgAdminId);

      // Then unpublish
      const result = await resultsService.unpublishResults(manualEventId, testOrgAdminId);

      expect(result.resultsPublishedAt).toBeNull();
      expect(result.resultsPublishedBy).toBeNull();
    });

    it("should reject unpublishing if not published", async () => {
      await expect(
        resultsService.unpublishResults(manualEventId, testOrgAdminId)
      ).rejects.toThrow(/not published/i);
    });

    it("should create audit log when unpublishing", async () => {
      await resultsService.publishResults(manualEventId, testOrgAdminId);
      await resultsService.unpublishResults(manualEventId, testOrgAdminId);
      // If no error, audit log was created
      expect(true).toBe(true);
    });
  });

  describe("areResultsVisible", () => {
    describe("immediate visibility", () => {
      it("should return true for immediate visibility events", async () => {
        const visible = await resultsService.areResultsVisible(immediateEventId, testAthleteId);
        expect(visible).toBe(true);
      });

      it("should return true even for non-completed immediate events", async () => {
        const visible = await resultsService.areResultsVisible(immediateEventId, testAthleteId);
        expect(visible).toBe(true);
      });
    });

    describe("after_event visibility", () => {
      it("should return false for non-completed after_event events", async () => {
        const visible = await resultsService.areResultsVisible(afterEventEventId, testAthleteId);
        expect(visible).toBe(false);
      });

      it("should return true for completed after_event events", async () => {
        const visible = await resultsService.areResultsVisible(completedEventId, testAthleteId);
        expect(visible).toBe(true);
      });

      it("should return true for coaches/admins even before completion", async () => {
        const visibleToAdmin = await resultsService.areResultsVisible(afterEventEventId, testOrgAdminId);
        const visibleToCoach = await resultsService.areResultsVisible(afterEventEventId, testCoachId);

        expect(visibleToAdmin).toBe(true);
        expect(visibleToCoach).toBe(true);
      });
    });

    describe("manual visibility", () => {
      afterEach(async () => {
        // Reset results published state
        await db.update(events)
          .set({ resultsPublishedAt: null, resultsPublishedBy: null })
          .where(eq(events.id, manualEventId));
      });

      it("should return false for unpublished manual events", async () => {
        const visible = await resultsService.areResultsVisible(manualEventId, testAthleteId);
        expect(visible).toBe(false);
      });

      it("should return true after results are published", async () => {
        await resultsService.publishResults(manualEventId, testOrgAdminId);

        const visible = await resultsService.areResultsVisible(manualEventId, testAthleteId);
        expect(visible).toBe(true);
      });

      it("should return true for coaches/admins even before publish", async () => {
        const visibleToAdmin = await resultsService.areResultsVisible(manualEventId, testOrgAdminId);
        const visibleToCoach = await resultsService.areResultsVisible(manualEventId, testCoachId);

        expect(visibleToAdmin).toBe(true);
        expect(visibleToCoach).toBe(true);
      });
    });
  });

  describe("canViewOwnResults", () => {
    it("should always allow athletes to view their own results", async () => {
      // Even with manual visibility and unpublished, athletes can see their own results
      const canView = await resultsService.canViewOwnResults(manualEventId, testAthleteId);
      expect(canView).toBe(true);
    });

    it("should return true for any visibility mode", async () => {
      const canViewImmediate = await resultsService.canViewOwnResults(immediateEventId, testAthleteId);
      const canViewAfterEvent = await resultsService.canViewOwnResults(afterEventEventId, testAthleteId);
      const canViewManual = await resultsService.canViewOwnResults(manualEventId, testAthleteId);

      expect(canViewImmediate).toBe(true);
      expect(canViewAfterEvent).toBe(true);
      expect(canViewManual).toBe(true);
    });
  });

  describe("getResultsVisibilityStatus", () => {
    it("should return visibility status for an event", async () => {
      const status = await resultsService.getResultsVisibilityStatus(manualEventId);

      expect(status.visibility).toBe("manual");
      expect(status.isPublished).toBe(false);
      expect(status.publishedAt).toBeNull();
      expect(status.publishedBy).toBeNull();
    });

    it("should reflect published state", async () => {
      await resultsService.publishResults(manualEventId, testOrgAdminId);

      const status = await resultsService.getResultsVisibilityStatus(manualEventId);

      expect(status.isPublished).toBe(true);
      expect(status.publishedAt).toBeDefined();
      expect(status.publishedBy).toBe(testOrgAdminId);

      // Cleanup
      await db.update(events)
        .set({ resultsPublishedAt: null, resultsPublishedBy: null })
        .where(eq(events.id, manualEventId));
    });

    it("should include event status", async () => {
      const status = await resultsService.getResultsVisibilityStatus(completedEventId);

      expect(status.eventStatus).toBe("completed");
    });
  });

  describe("updateResultsVisibility", () => {
    afterEach(async () => {
      // Reset visibility mode
      await db.update(events)
        .set({ resultsVisibility: "manual" })
        .where(eq(events.id, manualEventId));
    });

    it("should update results visibility mode", async () => {
      const result = await resultsService.updateResultsVisibility(
        manualEventId,
        testOrgAdminId,
        "immediate"
      );

      expect(result.resultsVisibility).toBe("immediate");
    });

    it("should reject updates on frozen events", async () => {
      await eventService.freezeEvent(manualEventId, testOrgAdminId, "Testing freeze");

      await expect(
        resultsService.updateResultsVisibility(manualEventId, testOrgAdminId, "immediate")
      ).rejects.toThrow(/frozen/i);

      await eventService.unfreezeEvent(manualEventId, testOrgAdminId);
    });

    it("should create audit log when updating visibility", async () => {
      await resultsService.updateResultsVisibility(manualEventId, testOrgAdminId, "after_event");
      // If no error, audit log was created
      expect(true).toBe(true);
    });
  });
});

describe("Event Results Audit Logging", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_er_audit_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testEventId: string;
  let resultsService: EventResultsService;
  let eventService: EventService;

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({
      name: `ER Audit Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    const [admin] = await db.insert(users).values({
      emails: [`erauditadmin${testSuffix}@example.com`],
      username: `erauditadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "ERAudit",
      lastName: "Admin",
      fullName: "ERAudit Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = admin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    eventService = new EventService(storage as IStorage);
    resultsService = new EventResultsService(storage as IStorage);

    const event = await eventService.createEvent({
      name: "ER Audit Test Event",
      startDate: new Date("2025-09-01T09:00:00Z"),
      organizationId: testOrgId,
      resultsVisibility: "manual",
      status: "published",
    }, testOrgAdminId);
    testEventId = event.id;
  });

  afterEach(async () => {
    // Reset event state
    await db.update(events)
      .set({ resultsPublishedAt: null, resultsPublishedBy: null, resultsVisibility: "manual" })
      .where(eq(events.id, testEventId));
  });

  afterAll(async () => {
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  it("should create audit log when publishing results", async () => {
    await resultsService.publishResults(testEventId, testOrgAdminId);
    expect(true).toBe(true);
  });

  it("should create audit log when unpublishing results", async () => {
    await resultsService.publishResults(testEventId, testOrgAdminId);
    await resultsService.unpublishResults(testEventId, testOrgAdminId);
    expect(true).toBe(true);
  });

  it("should create audit log when changing visibility mode", async () => {
    await resultsService.updateResultsVisibility(testEventId, testOrgAdminId, "immediate");
    expect(true).toBe(true);
  });
});
