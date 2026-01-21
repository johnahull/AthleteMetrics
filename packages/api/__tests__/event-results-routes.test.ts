/**
 * Integration tests for Event Results Routes
 * Tests HTTP endpoints for results visibility and publishing
 *
 * TDD Phase 6.3: RED - Tests define expected results routes behavior
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import {
  organizations,
  users,
  userOrganizations,
  events,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { EventResultsService } from "../services/event-results-service";
import type { IStorage } from "../storage";

describe("Event Results Routes", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_er_routes_test_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let testEventId: string;
  let frozenEventId: string;
  let resultsService: EventResultsService;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Event Results Routes Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [`erradmin${testSuffix}@example.com`],
      username: `erradmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "ERR",
      lastName: "Admin",
      fullName: "ERR Admin",
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
      emails: [`errcoach${testSuffix}@example.com`],
      username: `errcoach${testSuffix}`,
      password: "hashedpassword123",
      firstName: "ERR",
      lastName: "Coach",
      fullName: "ERR Coach",
      role: "coach",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create athlete (not in org - external)
    const [athlete] = await db.insert(users).values({
      emails: [`errathlete${testSuffix}@example.com`],
      username: `errathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "ERR",
      lastName: "Athlete",
      fullName: "ERR Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    // Create test event with manual visibility
    const [event] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Results Test Event ${testSuffix}`,
      eventType: "combine",
      description: "Test event for results routes testing",
      startDate: new Date("2025-08-01"),
      status: "published",
      visibility: "org_private",
      resultsVisibility: "manual",
      isFrozen: false,
      createdBy: testOrgAdminId,
    }).returning();
    testEventId = event.id;

    // Create frozen event
    const [frozenEvent] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Frozen Results Event ${testSuffix}`,
      eventType: "combine",
      description: "Frozen event for results testing",
      startDate: new Date("2025-07-01"),
      status: "completed",
      visibility: "org_private",
      resultsVisibility: "manual",
      isFrozen: true,
      frozenAt: new Date(),
      frozenBy: testOrgAdminId,
      createdBy: testOrgAdminId,
    }).returning();
    frozenEventId = frozenEvent.id;

    // Initialize service
    resultsService = new EventResultsService(storage as IStorage);
  });

  afterAll(async () => {
    // Cleanup in reverse order
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(events).where(eq(events.id, frozenEventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  afterEach(async () => {
    // Reset event state between tests
    await db.update(events)
      .set({
        resultsPublishedAt: null,
        resultsPublishedBy: null,
        resultsVisibility: "manual",
      })
      .where(eq(events.id, testEventId));
  });

  describe("getResultsVisibilityStatus", () => {
    it("should return visibility status for an event", async () => {
      const status = await resultsService.getResultsVisibilityStatus(testEventId);

      expect(status).toBeDefined();
      expect(status.visibility).toBe("manual");
      expect(status.isPublished).toBe(false);
      expect(status.publishedAt).toBeNull();
      expect(status.publishedBy).toBeNull();
      expect(status.eventStatus).toBe("published");
    });

    it("should throw error for non-existent event", async () => {
      await expect(
        resultsService.getResultsVisibilityStatus("non-existent-event-id")
      ).rejects.toThrow("Event not found");
    });
  });

  describe("publishResults", () => {
    it("should publish results for an event", async () => {
      const result = await resultsService.publishResults(testEventId, testOrgAdminId);

      expect(result.resultsPublishedAt).toBeDefined();
      expect(result.resultsPublishedBy).toBe(testOrgAdminId);
    });

    it("should allow coaches to publish results", async () => {
      const result = await resultsService.publishResults(testEventId, testCoachId);

      expect(result.resultsPublishedAt).toBeDefined();
      expect(result.resultsPublishedBy).toBe(testCoachId);
    });

    it("should reject publishing if already published", async () => {
      await resultsService.publishResults(testEventId, testOrgAdminId);

      await expect(
        resultsService.publishResults(testEventId, testOrgAdminId)
      ).rejects.toThrow(/already published/i);
    });

    it("should reject publishing for frozen events", async () => {
      await expect(
        resultsService.publishResults(frozenEventId, testOrgAdminId)
      ).rejects.toThrow(/frozen/i);
    });

    it("should reject publishing for non-existent event", async () => {
      await expect(
        resultsService.publishResults("non-existent-event-id", testOrgAdminId)
      ).rejects.toThrow("Event not found");
    });
  });

  describe("unpublishResults", () => {
    it("should unpublish results for an event", async () => {
      // First publish
      await resultsService.publishResults(testEventId, testOrgAdminId);

      // Then unpublish
      const result = await resultsService.unpublishResults(testEventId, testOrgAdminId);

      expect(result.resultsPublishedAt).toBeNull();
      expect(result.resultsPublishedBy).toBeNull();
    });

    it("should reject unpublishing if not published", async () => {
      await expect(
        resultsService.unpublishResults(testEventId, testOrgAdminId)
      ).rejects.toThrow(/not published/i);
    });

    it("should reject unpublishing for frozen events", async () => {
      // Manually set published for frozen event (bypassing service)
      await db.update(events)
        .set({
          resultsPublishedAt: new Date(),
          resultsPublishedBy: testOrgAdminId
        })
        .where(eq(events.id, frozenEventId));

      await expect(
        resultsService.unpublishResults(frozenEventId, testOrgAdminId)
      ).rejects.toThrow(/frozen/i);

      // Reset frozen event
      await db.update(events)
        .set({
          resultsPublishedAt: null,
          resultsPublishedBy: null
        })
        .where(eq(events.id, frozenEventId));
    });
  });

  describe("areResultsVisible", () => {
    it("should return false for unpublished manual event to athlete", async () => {
      const visible = await resultsService.areResultsVisible(testEventId, testAthleteId);
      expect(visible).toBe(false);
    });

    it("should return true for unpublished manual event to org admin", async () => {
      const visible = await resultsService.areResultsVisible(testEventId, testOrgAdminId);
      expect(visible).toBe(true);
    });

    it("should return true for unpublished manual event to coach", async () => {
      const visible = await resultsService.areResultsVisible(testEventId, testCoachId);
      expect(visible).toBe(true);
    });

    it("should return true for published manual event to athlete", async () => {
      await resultsService.publishResults(testEventId, testOrgAdminId);

      const visible = await resultsService.areResultsVisible(testEventId, testAthleteId);
      expect(visible).toBe(true);
    });
  });

  describe("canViewOwnResults", () => {
    it("should always allow viewing own results", async () => {
      const canView = await resultsService.canViewOwnResults(testEventId, testAthleteId);
      expect(canView).toBe(true);
    });
  });

  describe("updateResultsVisibility", () => {
    it("should update results visibility mode", async () => {
      const result = await resultsService.updateResultsVisibility(
        testEventId,
        testOrgAdminId,
        "immediate"
      );

      expect(result.resultsVisibility).toBe("immediate");
    });

    it("should reject updates on frozen events", async () => {
      await expect(
        resultsService.updateResultsVisibility(frozenEventId, testOrgAdminId, "immediate")
      ).rejects.toThrow(/frozen/i);
    });

    it("should reject updates for non-existent event", async () => {
      await expect(
        resultsService.updateResultsVisibility("non-existent-event-id", testOrgAdminId, "immediate")
      ).rejects.toThrow("Event not found");
    });
  });
});
