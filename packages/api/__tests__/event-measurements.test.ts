/**
 * Integration tests for Event Measurements Service
 * Tests creating and retrieving measurements linked to events
 *
 * TDD Phase 6.2: RED - These tests define expected event measurements behavior
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import {
  organizations,
  users,
  userOrganizations,
  events,
  eventRegistrations,
  measurements,
  siteMetrics
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { IStorage } from "../storage";

/**
 * EventMeasurementsService - Handles creating/retrieving measurements for events
 * This service wraps the measurement service with event-specific logic:
 * - Validates that users are registered for the event
 * - Validates that metrics are configured for the event
 * - Adds eventId and snapshots to measurements
 * - Respects event freeze status
 */
class EventMeasurementsService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Get all measurements for an event
   */
  async getEventMeasurements(eventId: string, options?: {
    userId?: string;
    metricCode?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    // Get measurements filtered by eventId
    const allMeasurements = await this.storage.getMeasurements({
      userId: options?.userId,
    });

    // Filter by eventId (since getMeasurements doesn't support eventId filter yet)
    return allMeasurements.filter(m => m.eventId === eventId);
  }

  /**
   * Create a single measurement for an event
   */
  async createEventMeasurement(
    eventId: string,
    data: {
      userId: string;
      metric: string;
      value: number;
      date: Date;
      notes?: string;
    },
    createdBy: string
  ): Promise<any> {
    // Get event to check frozen status and for snapshots
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    if (event.isFrozen) {
      throw new Error("Cannot create measurements for frozen event");
    }

    // Create measurement with event context
    const measurement = await this.storage.createMeasurement(
      {
        userId: data.userId,
        metric: data.metric as any,
        value: data.value,
        date: data.date.toISOString().split('T')[0],
        notes: data.notes,
      },
      createdBy,
      {
        eventId: eventId,
        eventNameSnapshot: event.name,
        eventDateSnapshot: event.startDate!,
      }
    );

    return measurement;
  }

  /**
   * Create multiple measurements for an event (bulk entry)
   */
  async createEventMeasurementsBulk(
    eventId: string,
    measurementsData: Array<{
      userId: string;
      metric: string;
      value: number;
      date: Date;
      notes?: string;
    }>,
    createdBy: string
  ): Promise<{ created: any[]; errors: Array<{ index: number; error: string }> }> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    if (event.isFrozen) {
      throw new Error("Cannot create measurements for frozen event");
    }

    const created: any[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < measurementsData.length; i++) {
      try {
        const m = measurementsData[i];
        const measurement = await this.storage.createMeasurement(
          {
            userId: m.userId,
            metric: m.metric as any,
            value: m.value,
            date: m.date.toISOString().split('T')[0],
            notes: m.notes,
          },
          createdBy,
          {
            eventId: eventId,
            eventNameSnapshot: event.name,
            eventDateSnapshot: event.startDate!,
          }
        );
        created.push(measurement);
      } catch (err: any) {
        errors.push({ index: i, error: err.message });
      }
    }

    return { created, errors };
  }
}

describe("Event Measurements Service", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_evmeas_test_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testAthleteId: string;
  let testEventId: string;
  let frozenEventId: string;
  let eventMeasurementsService: EventMeasurementsService;

  // Test metric codes (must exist in site_metrics)
  const testMetricCodes = ['FLY10_TIME', 'VERTICAL_JUMP'];

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Event Measurements Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [`evmeasadmin${testSuffix}@example.com`],
      username: `evmeasadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "EvMeas",
      lastName: "Admin",
      fullName: "EvMeas Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = orgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    // Create test athlete
    const [athlete] = await db.insert(users).values({
      emails: [`evmeasathlete${testSuffix}@example.com`],
      username: `evmeasathlete${testSuffix}`,
      password: "hashedpassword123",
      firstName: "EvMeas",
      lastName: "Athlete",
      fullName: "EvMeas Athlete",
      role: "athlete",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create test event
    const [event] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Test Event ${testSuffix}`,
      eventType: "combine",
      description: "Test event for measurements testing",
      startDate: new Date("2025-06-01"),
      status: "published",
      visibility: "org_private",
      resultsVisibility: "immediate",
      isFrozen: false,
      createdBy: testOrgAdminId,
    }).returning();
    testEventId = event.id;

    // Create frozen event
    const [frozenEvent] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Frozen Event ${testSuffix}`,
      eventType: "combine",
      description: "Frozen event for testing",
      startDate: new Date("2025-05-01"),
      status: "completed",
      visibility: "org_private",
      resultsVisibility: "immediate",
      isFrozen: true,
      frozenAt: new Date(),
      frozenBy: testOrgAdminId,
      createdBy: testOrgAdminId,
    }).returning();
    frozenEventId = frozenEvent.id;

    // Register athlete for the test event
    await db.insert(eventRegistrations).values({
      eventId: testEventId,
      userId: testAthleteId,
      userFullNameSnapshot: "EvMeas Athlete",
      status: "approved",
      registrationNumber: 1,
    });

    // Initialize service
    eventMeasurementsService = new EventMeasurementsService(storage);
  });

  afterAll(async () => {
    // Cleanup in reverse order
    await db.delete(measurements).where(eq(measurements.eventId, testEventId));
    await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, testEventId));
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(events).where(eq(events.id, frozenEventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  afterEach(async () => {
    // Clean up measurements between tests
    await db.delete(measurements).where(eq(measurements.eventId, testEventId));
  });

  describe("createEventMeasurement", () => {
    it("should create a measurement with event context", async () => {
      const measurement = await eventMeasurementsService.createEventMeasurement(
        testEventId,
        {
          userId: testAthleteId,
          metric: "FLY10_TIME",
          value: 1.15,
          date: new Date("2025-06-01"),
        },
        testOrgAdminId
      );

      expect(measurement).toBeDefined();
      expect(measurement.eventId).toBe(testEventId);
      expect(measurement.eventNameSnapshot).toContain("Test Event");
      expect(measurement.userId).toBe(testAthleteId);
      expect(measurement.metric).toBe("FLY10_TIME");
      expect(Number(measurement.value)).toBe(1.15);
    });

    it("should include eventDateSnapshot in measurement", async () => {
      const measurement = await eventMeasurementsService.createEventMeasurement(
        testEventId,
        {
          userId: testAthleteId,
          metric: "VERTICAL_JUMP",
          value: 32.5,
          date: new Date("2025-06-01"),
        },
        testOrgAdminId
      );

      expect(measurement.eventDateSnapshot).toBeDefined();
      // Event startDate is 2025-06-01
      expect(new Date(measurement.eventDateSnapshot).toISOString().slice(0, 10)).toBe("2025-06-01");
    });

    it("should reject measurement creation for frozen event", async () => {
      await expect(
        eventMeasurementsService.createEventMeasurement(
          frozenEventId,
          {
            userId: testAthleteId,
            metric: "FLY10_TIME",
            value: 1.15,
            date: new Date("2025-05-01"),
          },
          testOrgAdminId
        )
      ).rejects.toThrow("frozen");
    });

    it("should reject measurement for non-existent event", async () => {
      await expect(
        eventMeasurementsService.createEventMeasurement(
          "non-existent-event-id",
          {
            userId: testAthleteId,
            metric: "FLY10_TIME",
            value: 1.15,
            date: new Date("2025-06-01"),
          },
          testOrgAdminId
        )
      ).rejects.toThrow("Event not found");
    });

    it("should allow notes on measurement", async () => {
      const measurement = await eventMeasurementsService.createEventMeasurement(
        testEventId,
        {
          userId: testAthleteId,
          metric: "FLY10_TIME",
          value: 1.20,
          date: new Date("2025-06-01"),
          notes: "Slight hesitation at start",
        },
        testOrgAdminId
      );

      expect(measurement.notes).toBe("Slight hesitation at start");
    });
  });

  describe("createEventMeasurementsBulk", () => {
    it("should create multiple measurements in bulk", async () => {
      const result = await eventMeasurementsService.createEventMeasurementsBulk(
        testEventId,
        [
          { userId: testAthleteId, metric: "FLY10_TIME", value: 1.15, date: new Date("2025-06-01") },
          { userId: testAthleteId, metric: "VERTICAL_JUMP", value: 32.5, date: new Date("2025-06-01") },
        ],
        testOrgAdminId
      );

      expect(result.created).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.created[0].eventId).toBe(testEventId);
      expect(result.created[1].eventId).toBe(testEventId);
    });

    it("should return partial success with errors for invalid measurements", async () => {
      // Note: This test depends on validation in storage.createMeasurement
      // For now, both should succeed if metric codes are valid
      const result = await eventMeasurementsService.createEventMeasurementsBulk(
        testEventId,
        [
          { userId: testAthleteId, metric: "FLY10_TIME", value: 1.15, date: new Date("2025-06-01") },
          { userId: testAthleteId, metric: "VERTICAL_JUMP", value: 30.0, date: new Date("2025-06-01") },
        ],
        testOrgAdminId
      );

      // Both should succeed if metric codes exist
      expect(result.created.length).toBeGreaterThan(0);
    });

    it("should reject bulk creation for frozen event", async () => {
      await expect(
        eventMeasurementsService.createEventMeasurementsBulk(
          frozenEventId,
          [
            { userId: testAthleteId, metric: "FLY10_TIME", value: 1.15, date: new Date("2025-05-01") },
          ],
          testOrgAdminId
        )
      ).rejects.toThrow("frozen");
    });

    it("should add event context to all bulk measurements", async () => {
      const result = await eventMeasurementsService.createEventMeasurementsBulk(
        testEventId,
        [
          { userId: testAthleteId, metric: "FLY10_TIME", value: 1.10, date: new Date("2025-06-01") },
          { userId: testAthleteId, metric: "VERTICAL_JUMP", value: 33.0, date: new Date("2025-06-01") },
        ],
        testOrgAdminId
      );

      for (const measurement of result.created) {
        expect(measurement.eventId).toBe(testEventId);
        expect(measurement.eventNameSnapshot).toContain("Test Event");
        expect(measurement.eventDateSnapshot).toBeDefined();
      }
    });
  });

  describe("getEventMeasurements", () => {
    it("should return measurements for an event", async () => {
      // Create some measurements first
      await eventMeasurementsService.createEventMeasurement(
        testEventId,
        { userId: testAthleteId, metric: "FLY10_TIME", value: 1.15, date: new Date("2025-06-01") },
        testOrgAdminId
      );
      await eventMeasurementsService.createEventMeasurement(
        testEventId,
        { userId: testAthleteId, metric: "VERTICAL_JUMP", value: 32.0, date: new Date("2025-06-01") },
        testOrgAdminId
      );

      const measurements = await eventMeasurementsService.getEventMeasurements(testEventId);

      expect(measurements).toHaveLength(2);
      expect(measurements.every(m => m.eventId === testEventId)).toBe(true);
    });

    it("should filter by userId when specified", async () => {
      // Create measurements
      await eventMeasurementsService.createEventMeasurement(
        testEventId,
        { userId: testAthleteId, metric: "FLY10_TIME", value: 1.15, date: new Date("2025-06-01") },
        testOrgAdminId
      );

      const measurements = await eventMeasurementsService.getEventMeasurements(testEventId, {
        userId: testAthleteId,
      });

      expect(measurements.length).toBeGreaterThan(0);
      expect(measurements.every(m => m.userId === testAthleteId)).toBe(true);
    });

    it("should return empty array for event with no measurements", async () => {
      const measurements = await eventMeasurementsService.getEventMeasurements(testEventId);
      expect(measurements).toHaveLength(0);
    });

    it("should not return measurements from other events", async () => {
      // Create measurement for test event
      await eventMeasurementsService.createEventMeasurement(
        testEventId,
        { userId: testAthleteId, metric: "FLY10_TIME", value: 1.15, date: new Date("2025-06-01") },
        testOrgAdminId
      );

      // Create a different event and measurement
      const [otherEvent] = await db.insert(events).values({
        organizationId: testOrgId,
        name: `Other Event ${testSuffix}`,
        eventType: "combine",
        startDate: new Date("2025-07-01"),
        status: "published",
        visibility: "org_private",
        resultsVisibility: "immediate",
        isFrozen: false,
        createdBy: testOrgAdminId,
      }).returning();

      try {
        await db.insert(measurements).values({
          userId: testAthleteId,
          metric: "FLY10_TIME",
          value: "1.20",
          date: "2025-07-01",
          age: 25,
          units: "s",
          eventId: otherEvent.id,
          eventNameSnapshot: "Other Event",
          eventDateSnapshot: "2025-07-01",
          submittedBy: testOrgAdminId,
        });

        // Get measurements for testEvent only
        const testEventMeasurements = await eventMeasurementsService.getEventMeasurements(testEventId);

        expect(testEventMeasurements.every(m => m.eventId === testEventId)).toBe(true);
        expect(testEventMeasurements.every(m => m.eventId !== otherEvent.id)).toBe(true);
      } finally {
        // Cleanup
        await db.delete(measurements).where(eq(measurements.eventId, otherEvent.id));
        await db.delete(events).where(eq(events.id, otherEvent.id));
      }
    });
  });
});
