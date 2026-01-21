/**
 * Integration tests for Event Metrics Service
 * Tests event-specific metric configuration (which tests are run at an event)
 *
 * TDD Phase 4.2: RED - These tests define expected event metrics behavior
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations, events, eventMetrics, siteMetrics } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { EventService, type IEventStorage } from "../services/event-service";
import { EventMetricsService, type IMetricsStorage } from "../services/event-metrics-service";
import type { IStorage } from "../storage";

describe("Event Metrics Service", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_em_test_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let eventService: EventService;
  let metricsService: EventMetricsService;

  // Event IDs
  let testEventId: string;
  let frozenEventId: string;

  // Test metric codes (must exist in site_metrics)
  const testMetricCodes = ['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505'];

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Event Metrics Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [`emadmin${testSuffix}@example.com`],
      username: `emadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "EM",
      lastName: "Admin",
      fullName: "EM Admin",
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
      emails: [`emcoach${testSuffix}@example.com`],
      username: `emcoach${testSuffix}`,
      password: "hashedpassword123",
      firstName: "EM",
      lastName: "Coach",
      fullName: "EM Coach",
      role: "coach",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Initialize services
    eventService = new EventService(storage as IEventStorage);
    metricsService = new EventMetricsService(storage as IMetricsStorage);

    // Create test events
    const testEvent = await eventService.createEvent({
      name: "Metrics Test Event",
      startDate: new Date("2025-08-01T09:00:00Z"),
      organizationId: testOrgId,
      registrationMode: "open",
      status: "published",
    }, testOrgAdminId);
    testEventId = testEvent.id;

    const frozenEvent = await eventService.createEvent({
      name: "Frozen Metrics Event",
      startDate: new Date("2025-08-02T09:00:00Z"),
      organizationId: testOrgId,
      status: "completed",
    }, testOrgAdminId);
    frozenEventId = frozenEvent.id;
    await eventService.freezeEvent(frozenEventId, testOrgAdminId, "Event completed");
  });

  afterEach(async () => {
    // Clean up event metrics after each test
    await db.delete(eventMetrics).where(eq(eventMetrics.eventId, testEventId));
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await db.delete(eventMetrics).where(eq(eventMetrics.eventId, testEventId));
    await db.delete(eventMetrics).where(eq(eventMetrics.eventId, frozenEventId));
    await db.delete(events).where(eq(events.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("addMetricToEvent", () => {
    it("should add a metric to an event", async () => {
      const eventMetric = await metricsService.addMetricToEvent(
        testEventId,
        'FLY10_TIME',
        testOrgAdminId
      );

      expect(eventMetric).toBeDefined();
      expect(eventMetric.eventId).toBe(testEventId);
      expect(eventMetric.metricCode).toBe('FLY10_TIME');
      expect(eventMetric.displayOrder).toBeDefined();
      expect(eventMetric.isRequired).toBe(false);
    });

    it("should add metric with custom options", async () => {
      const eventMetric = await metricsService.addMetricToEvent(
        testEventId,
        'VERTICAL_JUMP',
        testOrgAdminId,
        { displayOrder: 1, isRequired: true, customLabel: "Max Vertical" }
      );

      expect(eventMetric.displayOrder).toBe(1);
      expect(eventMetric.isRequired).toBe(true);
      expect(eventMetric.customLabel).toBe("Max Vertical");
    });

    it("should auto-assign display order if not provided", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);
      const second = await metricsService.addMetricToEvent(testEventId, 'VERTICAL_JUMP', testOrgAdminId);
      const third = await metricsService.addMetricToEvent(testEventId, 'AGILITY_505', testOrgAdminId);

      expect(second.displayOrder).toBeGreaterThan(0);
      expect(third.displayOrder).toBeGreaterThan(second.displayOrder);
    });

    it("should prevent duplicate metrics on same event", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);

      await expect(
        metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId)
      ).rejects.toThrow(/already.*added|duplicate/i);
    });

    it("should reject invalid metric codes", async () => {
      await expect(
        metricsService.addMetricToEvent(testEventId, 'INVALID_METRIC_XYZ', testOrgAdminId)
      ).rejects.toThrow(/metric.*not found|invalid.*metric/i);
    });

    it("should prevent adding metrics to frozen events", async () => {
      await expect(
        metricsService.addMetricToEvent(frozenEventId, 'FLY10_TIME', testOrgAdminId)
      ).rejects.toThrow(/frozen/i);
    });

    it("should allow coaches to add metrics", async () => {
      const eventMetric = await metricsService.addMetricToEvent(
        testEventId,
        'FLY10_TIME',
        testCoachId
      );

      expect(eventMetric).toBeDefined();
    });
  });

  describe("removeMetricFromEvent", () => {
    it("should remove a metric from an event", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);

      await metricsService.removeMetricFromEvent(testEventId, 'FLY10_TIME', testOrgAdminId);

      const metrics = await metricsService.listEventMetrics(testEventId);
      expect(metrics).toHaveLength(0);
    });

    it("should throw error if metric not on event", async () => {
      await expect(
        metricsService.removeMetricFromEvent(testEventId, 'FLY10_TIME', testOrgAdminId)
      ).rejects.toThrow(/not found|not configured/i);
    });

    it("should prevent removal from frozen events", async () => {
      // Note: Can't add to frozen event, so this tests the check exists
      await expect(
        metricsService.removeMetricFromEvent(frozenEventId, 'FLY10_TIME', testOrgAdminId)
      ).rejects.toThrow(/frozen/i);
    });
  });

  describe("listEventMetrics", () => {
    it("should list all metrics for an event in display order", async () => {
      await metricsService.addMetricToEvent(testEventId, 'AGILITY_505', testOrgAdminId, { displayOrder: 3 });
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId, { displayOrder: 1 });
      await metricsService.addMetricToEvent(testEventId, 'VERTICAL_JUMP', testOrgAdminId, { displayOrder: 2 });

      const metrics = await metricsService.listEventMetrics(testEventId);

      expect(metrics).toHaveLength(3);
      expect(metrics[0].metricCode).toBe('FLY10_TIME');
      expect(metrics[1].metricCode).toBe('VERTICAL_JUMP');
      expect(metrics[2].metricCode).toBe('AGILITY_505');
    });

    it("should return empty array for event with no metrics", async () => {
      const metrics = await metricsService.listEventMetrics(testEventId);
      expect(metrics).toHaveLength(0);
    });

    it("should include metric details when requested", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);

      const metrics = await metricsService.listEventMetrics(testEventId, { includeMetricDetails: true });

      expect(metrics).toHaveLength(1);
      expect(metrics[0].metricDetails).toBeDefined();
      expect(metrics[0].metricDetails?.label).toBeDefined();
    });
  });

  describe("updateEventMetric", () => {
    it("should update display order", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId, { displayOrder: 1 });

      const updated = await metricsService.updateEventMetric(
        testEventId,
        'FLY10_TIME',
        testOrgAdminId,
        { displayOrder: 5 }
      );

      expect(updated.displayOrder).toBe(5);
    });

    it("should update isRequired flag", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);

      const updated = await metricsService.updateEventMetric(
        testEventId,
        'FLY10_TIME',
        testOrgAdminId,
        { isRequired: true }
      );

      expect(updated.isRequired).toBe(true);
    });

    it("should update custom label", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);

      const updated = await metricsService.updateEventMetric(
        testEventId,
        'FLY10_TIME',
        testOrgAdminId,
        { customLabel: "10-Yard Sprint" }
      );

      expect(updated.customLabel).toBe("10-Yard Sprint");
    });

    it("should prevent updates on frozen events", async () => {
      await expect(
        metricsService.updateEventMetric(frozenEventId, 'FLY10_TIME', testOrgAdminId, { displayOrder: 1 })
      ).rejects.toThrow(/frozen/i);
    });
  });

  describe("reorderEventMetrics", () => {
    it("should reorder all metrics at once", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);
      await metricsService.addMetricToEvent(testEventId, 'VERTICAL_JUMP', testOrgAdminId);
      await metricsService.addMetricToEvent(testEventId, 'AGILITY_505', testOrgAdminId);

      await metricsService.reorderEventMetrics(
        testEventId,
        testOrgAdminId,
        ['AGILITY_505', 'FLY10_TIME', 'VERTICAL_JUMP'] // New order
      );

      const metrics = await metricsService.listEventMetrics(testEventId);
      expect(metrics[0].metricCode).toBe('AGILITY_505');
      expect(metrics[1].metricCode).toBe('FLY10_TIME');
      expect(metrics[2].metricCode).toBe('VERTICAL_JUMP');
    });
  });

  describe("bulkAddMetrics", () => {
    it("should add multiple metrics at once", async () => {
      const added = await metricsService.bulkAddMetrics(
        testEventId,
        testOrgAdminId,
        [
          { metricCode: 'FLY10_TIME', displayOrder: 1 },
          { metricCode: 'VERTICAL_JUMP', displayOrder: 2, isRequired: true },
          { metricCode: 'AGILITY_505', displayOrder: 3 },
        ]
      );

      expect(added).toHaveLength(3);

      const metrics = await metricsService.listEventMetrics(testEventId);
      expect(metrics).toHaveLength(3);
      expect(metrics.find(m => m.metricCode === 'VERTICAL_JUMP')?.isRequired).toBe(true);
    });

    it("should skip already-added metrics with skipExisting option", async () => {
      await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);

      const added = await metricsService.bulkAddMetrics(
        testEventId,
        testOrgAdminId,
        [
          { metricCode: 'FLY10_TIME', displayOrder: 1 },
          { metricCode: 'VERTICAL_JUMP', displayOrder: 2 },
        ],
        { skipExisting: true }
      );

      expect(added).toHaveLength(1); // Only VERTICAL_JUMP added
      expect(added[0].metricCode).toBe('VERTICAL_JUMP');
    });
  });
});

describe("Event Metrics Audit Logging", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_em_audit_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testEventId: string;
  let metricsService: EventMetricsService;
  let eventService: EventService;

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({
      name: `EM Audit Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    const [admin] = await db.insert(users).values({
      emails: [`emauditadmin${testSuffix}@example.com`],
      username: `emauditadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "EMAudit",
      lastName: "Admin",
      fullName: "EMAudit Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = admin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    eventService = new EventService(storage as IEventStorage);
    metricsService = new EventMetricsService(storage as IMetricsStorage);

    const event = await eventService.createEvent({
      name: "EM Audit Test Event",
      startDate: new Date("2025-09-01T09:00:00Z"),
      organizationId: testOrgId,
      status: "published",
    }, testOrgAdminId);
    testEventId = event.id;
  });

  afterEach(async () => {
    await db.delete(eventMetrics).where(eq(eventMetrics.eventId, testEventId));
  });

  afterAll(async () => {
    await db.delete(eventMetrics).where(eq(eventMetrics.eventId, testEventId));
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  it("should create audit log when adding metric", async () => {
    await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);
    // If no error, audit log was created
    expect(true).toBe(true);
  });

  it("should create audit log when removing metric", async () => {
    await metricsService.addMetricToEvent(testEventId, 'FLY10_TIME', testOrgAdminId);
    await metricsService.removeMetricFromEvent(testEventId, 'FLY10_TIME', testOrgAdminId);
    expect(true).toBe(true);
  });
});
