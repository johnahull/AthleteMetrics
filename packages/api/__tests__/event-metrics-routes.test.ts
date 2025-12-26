/**
 * Integration tests for Event Metrics API routes
 * Tests CRUD operations for event metric configuration
 *
 * TDD Phase 2: RED - These tests will fail until routes are implemented
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations, events, eventMetrics, siteMetrics } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// NOTE: These tests use raw fetch() calls to localhost:5000 which requires a running server.
// The service-level functionality is already tested in event-metrics.test.ts (22 tests).
// TODO: Convert these tests to use supertest with Express app instance for proper HTTP testing.
describe.skip("Event Metrics Routes", () => {
  // Test data identifiers
  const timestamp = Date.now().toString();
  const testSuffix = `_event_metrics_routes_test_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testEventId: string;
  let testMetricCode1: string;
  let testMetricCode2: string;

  const TEST_ORG_NAME = `Event Metrics Test Org${testSuffix}`;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for event metrics testing",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [`eventmetricsadmin${testSuffix}@example.com`],
      username: `eventmetricsadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Event",
      lastName: "Admin",
      fullName: "Event Admin",
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
      emails: [`eventmetricscoach${testSuffix}@example.com`],
      username: `eventmetricscoach${testSuffix}`,
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

    // Create test event
    const [event] = await db.insert(events).values({
      organizationId: testOrgId,
      name: `Test Event ${testSuffix}`,
      eventType: "combine",
      description: "Test event for metrics testing",
      startDate: new Date("2025-06-01"),
      status: "published",
      visibility: "org_private",
      resultsVisibility: "immediate",
      isFrozen: false,
    }).returning();
    testEventId = event.id;

    // Create test site metrics
    const [metric1] = await db.insert(siteMetrics).values({
      code: `TEST_METRIC_1_${timestamp}`,
      label: "Test Metric 1",
      category: "speed",
      unit: "seconds",
      description: "Test metric 1",
      isActive: true,
      displayOrder: 1,
    }).returning();
    testMetricCode1 = metric1.code;

    const [metric2] = await db.insert(siteMetrics).values({
      code: `TEST_METRIC_2_${timestamp}`,
      label: "Test Metric 2",
      category: "strength",
      unit: "inches",
      description: "Test metric 2",
      isActive: true,
      displayOrder: 2,
    }).returning();
    testMetricCode2 = metric2.code;
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    await db.delete(eventMetrics).where(eq(eventMetrics.eventId, testEventId));
    await db.delete(siteMetrics).where(eq(siteMetrics.code, testMetricCode1));
    await db.delete(siteMetrics).where(eq(siteMetrics.code, testMetricCode2));
    await db.delete(events).where(eq(events.id, testEventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  afterEach(async () => {
    // Clean up event metrics between tests
    await db.delete(eventMetrics).where(eq(eventMetrics.eventId, testEventId));
  });

  describe("POST /api/events/:eventId/metrics", () => {
    it("should add a metric to an event", async () => {
      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Mock auth - in real implementation this would be session-based
        },
        body: JSON.stringify({
          metricCode: testMetricCode1,
          isRequired: false,
        }),
        credentials: "include",
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.eventId).toBe(testEventId);
      expect(data.metricCode).toBe(testMetricCode1);
      expect(data.displayOrder).toBeGreaterThan(0);
      expect(data.isRequired).toBe(false);
    });

    it("should add a metric with custom label and display order", async () => {
      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metricCode: testMetricCode1,
          customLabel: "Custom Metric Label",
          displayOrder: 5,
          isRequired: true,
        }),
        credentials: "include",
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.customLabel).toBe("Custom Metric Label");
      expect(data.displayOrder).toBe(5);
      expect(data.isRequired).toBe(true);
    });

    it("should reject duplicate metric", async () => {
      // Add metric first time
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      // Try to add again
      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("already added");
    });

    it("should reject adding metric to frozen event", async () => {
      // Freeze the event
      await db.update(events)
        .set({ isFrozen: true })
        .where(eq(events.id, testEventId));

      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("frozen");

      // Unfreeze for other tests
      await db.update(events)
        .set({ isFrozen: false })
        .where(eq(events.id, testEventId));
    });

    it("should reject invalid metric code", async () => {
      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: "INVALID_METRIC_CODE" }),
        credentials: "include",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("not found");
    });
  });

  describe("GET /api/events/:eventId/metrics", () => {
    it("should list all metrics for an event", async () => {
      // Add two metrics
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1, displayOrder: 1 }),
        credentials: "include",
      });
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode2, displayOrder: 2 }),
        credentials: "include",
      });

      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        credentials: "include",
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data[0].metricCode).toBe(testMetricCode1);
      expect(data[1].metricCode).toBe(testMetricCode2);
    });

    it("should list metrics with details when includeDetails=true", async () => {
      // Add metric
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      const response = await fetch(
        `http://localhost:5000/api/events/${testEventId}/metrics?includeDetails=true`,
        { credentials: "include" }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].metricDetails).toBeDefined();
      expect(data[0].metricDetails.label).toBe("Test Metric 1");
    });

    it("should return empty array for event with no metrics", async () => {
      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        credentials: "include",
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });
  });

  describe("DELETE /api/events/:eventId/metrics/:code", () => {
    it("should remove a metric from an event", async () => {
      // Add metric
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      // Remove metric
      const response = await fetch(
        `http://localhost:5000/api/events/${testEventId}/metrics/${testMetricCode1}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      expect(response.ok).toBe(true);

      // Verify it's gone
      const listResponse = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        credentials: "include",
      });
      const data = await listResponse.json();
      expect(data.length).toBe(0);
    });

    it("should reject removing metric from frozen event", async () => {
      // Add metric
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      // Freeze event
      await db.update(events)
        .set({ isFrozen: true })
        .where(eq(events.id, testEventId));

      // Try to remove
      const response = await fetch(
        `http://localhost:5000/api/events/${testEventId}/metrics/${testMetricCode1}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      // Unfreeze
      await db.update(events)
        .set({ isFrozen: false })
        .where(eq(events.id, testEventId));
    });

    it("should handle removing non-existent metric gracefully", async () => {
      const response = await fetch(
        `http://localhost:5000/api/events/${testEventId}/metrics/NONEXISTENT`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe("PUT /api/events/:eventId/metrics/reorder", () => {
    it("should reorder event metrics", async () => {
      // Add three metrics
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1, displayOrder: 1 }),
        credentials: "include",
      });
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode2, displayOrder: 2 }),
        credentials: "include",
      });

      // Reorder: swap them
      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedMetricCodes: [testMetricCode2, testMetricCode1],
        }),
        credentials: "include",
      });

      expect(response.ok).toBe(true);

      // Verify new order
      const listResponse = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        credentials: "include",
      });
      const data = await listResponse.json();
      expect(data[0].metricCode).toBe(testMetricCode2);
      expect(data[0].displayOrder).toBe(1);
      expect(data[1].metricCode).toBe(testMetricCode1);
      expect(data[1].displayOrder).toBe(2);
    });

    it("should reject reordering frozen event metrics", async () => {
      // Add metric
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      // Freeze event
      await db.update(events)
        .set({ isFrozen: true })
        .where(eq(events.id, testEventId));

      // Try to reorder
      const response = await fetch(`http://localhost:5000/api/events/${testEventId}/metrics/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedMetricCodes: [testMetricCode1] }),
        credentials: "include",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      // Unfreeze
      await db.update(events)
        .set({ isFrozen: false })
        .where(eq(events.id, testEventId));
    });
  });

  describe("PUT /api/events/:eventId/metrics/:code", () => {
    it("should update event metric configuration", async () => {
      // Add metric
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1, isRequired: false }),
        credentials: "include",
      });

      // Update configuration
      const response = await fetch(
        `http://localhost:5000/api/events/${testEventId}/metrics/${testMetricCode1}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isRequired: true,
            customLabel: "Updated Label",
          }),
          credentials: "include",
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.isRequired).toBe(true);
      expect(data.customLabel).toBe("Updated Label");
    });

    it("should reject updating frozen event metric", async () => {
      // Add metric
      await fetch(`http://localhost:5000/api/events/${testEventId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricCode: testMetricCode1 }),
        credentials: "include",
      });

      // Freeze event
      await db.update(events)
        .set({ isFrozen: true })
        .where(eq(events.id, testEventId));

      // Try to update
      const response = await fetch(
        `http://localhost:5000/api/events/${testEventId}/metrics/${testMetricCode1}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRequired: true }),
          credentials: "include",
        }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      // Unfreeze
      await db.update(events)
        .set({ isFrozen: false })
        .where(eq(events.id, testEventId));
    });
  });
});
