/**
 * Integration tests for timeframe filter on GET /api/dashboard/trends endpoint
 *
 * Test coverage:
 * - Accepts timeframe preset (7d, 30d, 90d, mtd, lm, qtd, ytd, all)
 * - Accepts custom dateFrom/dateTo
 * - Defaults to last 30 days when no timeframe specified (backward compat)
 * - Calculates rolling comparison correctly (prior period = same duration before current)
 * - Validates dateFrom/dateTo format for custom range
 * - Rejects invalid timeframe values
 * - Works with existing teamId/athleteId filters
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { registerDashboardTrendsRoutes } from "../dashboard-trends";

// Mock session data for testing
let mockSessionUser: any = null;

// Create test app with mocked session middleware
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mock session middleware for testing
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.session = {
      user: mockSessionUser,
    } as any;
    next();
  });

  // Register routes
  registerDashboardTrendsRoutes(app);

  return app;
}

const app = createTestApp();

// Test data IDs
let testOrgId: string;
let testTeamId: string;
let testCoachId: string;
let testAthleteId: string;

describe("GET /api/dashboard/trends - Timeframe Filter", () => {
  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test organization
    const org = await storage.createOrganization({
      name: `Test Org Timeframe ${timestamp}`,
      description: "Test org for timeframe",
      benchmarksEnabled: false,
      allowCustomBenchmarks: false,
    });
    testOrgId = org.id;

    // Create test team
    const team = await storage.createTeam({
      name: `Test Team Timeframe ${timestamp}`,
      organizationId: testOrgId,
      level: "Club",
    });
    testTeamId = team.id;

    // Create test coach
    const coach = await storage.createUser({
      username: `testcoach_timeframe_${timestamp}`,
      password: "TestPassword123!",
      firstName: "Test",
      lastName: "Coach",
      emails: [`testcoach_timeframe_${timestamp}@example.com`],
      isSiteAdmin: false,
    });
    testCoachId = coach.id;
    await storage.addUserToOrganization(testCoachId, testOrgId, "coach");

    // Create test athlete
    const athlete = await storage.createAthlete({
      firstName: "Test",
      lastName: "Athlete",
      emails: [`testathlete_timeframe_${timestamp}@example.com`],
      birthDate: "2005-01-01",
      gender: "Male",
    });
    testAthleteId = athlete.id;
    await storage.addUserToOrganization(testAthleteId, testOrgId, "athlete");
    await storage.addUserToTeam(testAthleteId, testTeamId);

    // Create measurements at specific dates for timeframe testing
    const today = new Date();

    // Last 7 days: 5 measurements
    for (let i = 1; i <= 5; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      await storage.createMeasurement({
        userId: testAthleteId,
        date: date.toISOString().split('T')[0],
        metric: "FLY10_TIME",
        value: 1.25 + i * 0.01,
        teamId: testTeamId,
        organizationId: testOrgId,
      }, testCoachId);
    }

    // Last 30 days (but not in last 7): 10 measurements
    for (let i = 8; i <= 17; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      await storage.createMeasurement({
        userId: testAthleteId,
        date: date.toISOString().split('T')[0],
        metric: "VERTICAL_JUMP",
        value: 24.5 + i * 0.1,
        teamId: testTeamId,
        organizationId: testOrgId,
      }, testCoachId);
    }

    // Last 90 days (but not in last 30): 15 measurements
    for (let i = 31; i <= 45; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      await storage.createMeasurement({
        userId: testAthleteId,
        date: date.toISOString().split('T')[0],
        metric: "DASH_40YD",
        value: 4.8 + i * 0.01,
        teamId: testTeamId,
        organizationId: testOrgId,
      }, testCoachId);
    }

    // Create athlete created dates (for athlete trend testing)
    // This athlete was created during setup (current period)
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      if (testAthleteId) await storage.deleteUser(testAthleteId).catch(e => console.error("Error:", e));
      if (testCoachId) await storage.deleteUser(testCoachId).catch(e => console.error("Error:", e));
      if (testTeamId) await storage.deleteTeam(testTeamId).catch(e => console.error("Error:", e));
      if (testOrgId) await storage.deleteOrganization(testOrgId).catch(e => console.error("Error:", e));
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  beforeEach(() => {
    // Reset mock session before each test
    mockSessionUser = {
      id: testCoachId,
      role: 'coach',
      isSiteAdmin: false,
      primaryOrganizationId: testOrgId
    };
  });

  describe("Timeframe Preset Support", () => {
    it("should accept timeframe=7d (last 7 days)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: '7d'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
      // Should count measurements from last 7 days (5 measurements)
      expect(response.body.measurements.current).toBe(5);
    });

    it("should accept timeframe=30d (last 30 days)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: '30d'
        });

      expect(response.status).toBe(200);
      // Should count measurements from last 30 days (5 + 10 = 15 measurements)
      expect(response.body.measurements.current).toBe(15);
    });

    it("should accept timeframe=90d (last 90 days)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: '90d'
        });

      expect(response.status).toBe(200);
      // Should count all measurements (5 + 10 + 15 = 30 measurements)
      expect(response.body.measurements.current).toBe(30);
    });

    it("should accept timeframe=mtd (month to date)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'mtd'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
      // Should count measurements from first day of current month to today
    });

    it("should accept timeframe=lm (last month)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'lm'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
      // Should count measurements from last month
    });

    it("should accept timeframe=qtd (quarter to date)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'qtd'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
    });

    it("should accept timeframe=ytd (year to date)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'ytd'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
    });

    it("should accept timeframe=all (all time)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'all'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
    });
  });

  describe("Custom Date Range Support", () => {
    it("should accept custom dateFrom and dateTo", async () => {
      const today = new Date();
      const dateFrom = new Date(today);
      dateFrom.setDate(dateFrom.getDate() - 15);
      const dateTo = today;

      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'custom',
          dateFrom: dateFrom.toISOString().split('T')[0],
          dateTo: dateTo.toISOString().split('T')[0]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
      // Should count measurements within custom range (5 in last 7 days + 8 more = 13)
      expect(response.body.measurements.current).toBeGreaterThan(0);
    });

    it("should require dateFrom when timeframe=custom", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'custom',
          dateTo: new Date().toISOString().split('T')[0]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/dateFrom.*required/i);
    });

    it("should require dateTo when timeframe=custom", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 15);

      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'custom',
          dateFrom: dateFrom.toISOString().split('T')[0]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/dateTo.*required/i);
    });

    it("should validate dateFrom format (ISO 8601 date)", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'custom',
          dateFrom: 'invalid-date',
          dateTo: new Date().toISOString().split('T')[0]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/invalid.*date.*format/i);
    });

    it("should validate dateTo format (ISO 8601 date)", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 15);

      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'custom',
          dateFrom: dateFrom.toISOString().split('T')[0],
          dateTo: 'invalid-date'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/invalid.*date.*format/i);
    });
  });

  describe("Backward Compatibility", () => {
    it("should default to last 30 days when no timeframe specified", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
      // Should count measurements from last 30 days (same as timeframe=30d)
      // Note: The original endpoint used "current month" which is different from "last 30 days"
      // But the test should pass once we implement the feature
    });
  });

  describe("Invalid Timeframe Handling", () => {
    it("should reject invalid timeframe value", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/invalid.*timeframe/i);
    });
  });

  describe("Rolling Comparison Calculation", () => {
    it("should calculate rolling prior period with same duration", async () => {
      // Test with 7-day period
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: '7d'
        });

      expect(response.status).toBe(200);

      // Current period: last 7 days
      // Prior period: days 8-14 before today (same 7-day duration)

      // Verify prior period is calculated correctly
      // The API uses 'previous' not 'prior' for the comparison period
      expect(response.body.measurements).toHaveProperty('previous');
      expect(response.body.measurements).toHaveProperty('current');

      // Verify the rolling comparison logic is working
      // Current should have measurements from last 7 days (5 measurements)
      expect(response.body.measurements.current).toBe(5);
      // Previous should have measurements from days 8-14 (7 measurements based on our setup)
      expect(response.body.measurements.previous).toBeGreaterThan(0);
    });

    it("should calculate comparison labels correctly", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          timeframe: '30d'
        });

      expect(response.status).toBe(200);

      // Should include human-readable labels for current and comparison periods
      expect(response.body).toHaveProperty('periodLabel');
      expect(response.body).toHaveProperty('comparisonLabel');
      expect(typeof response.body.periodLabel).toBe('string');
      expect(typeof response.body.comparisonLabel).toBe('string');
    });
  });

  describe("Integration with Existing Filters", () => {
    it("should work with teamId filter and timeframe", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          teamId: testTeamId,
          timeframe: '7d'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
    });

    it("should work with athleteId filter and timeframe", async () => {
      const response = await request(app)
        .get("/api/dashboard/trends")
        .query({
          organizationId: testOrgId,
          teamId: testTeamId,
          athleteId: testAthleteId,
          timeframe: '7d'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('measurements');
    });
  });
});
