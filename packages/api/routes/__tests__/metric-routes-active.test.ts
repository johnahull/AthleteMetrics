/**
 * Integration tests for GET /api/metrics/active endpoint
 *
 * Test coverage:
 * - Authentication: Returns 401 when not authenticated
 * - Authorization: Returns 200 for any authenticated user (not just admins)
 * - Filtering: Returns only active metrics (isActive=true)
 * - Filtering: Does NOT include inactive metrics
 * - Response shape: Returns proper fields
 * - Role access: Works for regular athletes (non-site-admin)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { registerMetricRoutes } from "../metric-routes";
import { db } from "../../db";
import { siteMetrics } from "@shared/schema";
import { eq } from "drizzle-orm";

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

  // Register metric routes
  registerMetricRoutes(app);

  return app;
}

const app = createTestApp();

// Test data IDs
let testSiteAdminId: string;
let testRegularUserId: string;
let testAthleteId: string;
let activeMetricCode: string;
let inactiveMetricCode: string;

describe("GET /api/metrics/active", () => {
  beforeAll(async () => {
    const timestamp = Date.now();
    const uniqueSuffix = `${timestamp}-${Math.random().toString(36).substring(7)}`;

    // Create site admin user
    const siteAdmin = await storage.createUser({
      username: `siteadmin-active-${uniqueSuffix}`,
      email: `siteadmin-active-${uniqueSuffix}@test.com`,
      hashedPassword: "hashed",
      role: "site_admin",
      isSiteAdmin: true,
      firstName: "Site",
      lastName: "Admin",
    });
    testSiteAdminId = siteAdmin.id;

    // Create regular user (not admin)
    const regularUser = await storage.createUser({
      username: `regular-active-${uniqueSuffix}`,
      email: `regular-active-${uniqueSuffix}@test.com`,
      hashedPassword: "hashed",
      role: "athlete",
      isSiteAdmin: false,
      firstName: "Regular",
      lastName: "User",
    });
    testRegularUserId = regularUser.id;

    // Create athlete user (independent, no org)
    const athlete = await storage.createUser({
      username: `athlete-active-${uniqueSuffix}`,
      email: `athlete-active-${uniqueSuffix}@test.com`,
      hashedPassword: "hashed",
      role: "athlete",
      isSiteAdmin: false,
      firstName: "Test",
      lastName: "Athlete",
    });
    testAthleteId = athlete.id;

    // Create test metrics
    activeMetricCode = `ACTIVE_TEST_${uniqueSuffix.replace(/-/g, '_').toUpperCase()}`;
    inactiveMetricCode = `INACTIVE_TEST_${uniqueSuffix.replace(/-/g, '_').toUpperCase()}`;

    // Create an active metric
    await db.insert(siteMetrics).values({
      code: activeMetricCode,
      label: 'Active Test Metric',
      category: 'Test',
      unit: 's',
      metricType: 'lower_is_better',
      lowerIsBetter: true,
      isSystemDefault: false,
      isActive: true,
      displayOrder: 100,
      description: 'Active test metric',
      decimalPrecision: 2,
      createdBy: testSiteAdminId,
    });

    // Create an inactive metric
    await db.insert(siteMetrics).values({
      code: inactiveMetricCode,
      label: 'Inactive Test Metric',
      category: 'Test',
      unit: 's',
      metricType: 'lower_is_better',
      lowerIsBetter: true,
      isSystemDefault: false,
      isActive: false,
      displayOrder: 101,
      description: 'Inactive test metric',
      decimalPrecision: 2,
      createdBy: testSiteAdminId,
    });
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      if (activeMetricCode) {
        await db.delete(siteMetrics).where(eq(siteMetrics.code, activeMetricCode));
      }
      if (inactiveMetricCode) {
        await db.delete(siteMetrics).where(eq(siteMetrics.code, inactiveMetricCode));
      }
      if (testSiteAdminId) {
        await storage.deleteUser(testSiteAdminId);
      }
      if (testRegularUserId) {
        await storage.deleteUser(testRegularUserId);
      }
      if (testAthleteId) {
        await storage.deleteUser(testAthleteId);
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  beforeEach(() => {
    // Reset mock session before each test
    mockSessionUser = null;
  });

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(401);
    });

    it("should return 200 for any authenticated user", async () => {
      mockSessionUser = {
        id: testRegularUserId,
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("Authorization", () => {
    it("should work for site admins", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);
    });

    it("should work for regular athletes (non-site-admin)", async () => {
      mockSessionUser = {
        id: testAthleteId,
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);
    });

    it("should work for users without organization context", async () => {
      // User with no org membership
      mockSessionUser = {
        id: testAthleteId,
        isSiteAdmin: false,
        // No organizationId
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("Filtering", () => {
    it("should return only active metrics", async () => {
      mockSessionUser = {
        id: testRegularUserId,
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);

      // All returned metrics should be active
      const metrics = response.body;
      expect(metrics.every((m: any) => m.isActive === true)).toBe(true);

      // Our active test metric should be included
      const activeMetric = metrics.find((m: any) => m.code === activeMetricCode);
      expect(activeMetric).toBeDefined();
    });

    it("should NOT include inactive metrics", async () => {
      mockSessionUser = {
        id: testRegularUserId,
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);

      // Our inactive test metric should NOT be included
      const inactiveMetric = response.body.find((m: any) => m.code === inactiveMetricCode);
      expect(inactiveMetric).toBeUndefined();
    });
  });

  describe("Response shape", () => {
    it("should return proper fields for each metric", async () => {
      mockSessionUser = {
        id: testRegularUserId,
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);

      // Find our test metric
      const metric = response.body.find((m: any) => m.code === activeMetricCode);
      expect(metric).toBeDefined();

      // Check required fields exist
      expect(metric).toHaveProperty('code');
      expect(metric).toHaveProperty('label');
      expect(metric).toHaveProperty('unit');
      expect(metric).toHaveProperty('metricType');
      expect(metric).toHaveProperty('category');
      expect(metric).toHaveProperty('description');
      expect(metric).toHaveProperty('isActive');

      // Verify values
      expect(metric.code).toBe(activeMetricCode);
      expect(metric.label).toBe('Active Test Metric');
      expect(metric.unit).toBe('s');
      expect(metric.metricType).toBe('lower_is_better');
      expect(metric.category).toBe('Test');
      expect(metric.isActive).toBe(true);
    });

    it("should include derived metric fields when present", async () => {
      mockSessionUser = {
        id: testRegularUserId,
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/metrics/active");

      expect(response.status).toBe(200);

      // Response should have structure for derived metrics
      const metric = response.body.find((m: any) => m.code === activeMetricCode);
      expect(metric).toHaveProperty('isDerived');
      expect(metric).toHaveProperty('formula');
      expect(metric).toHaveProperty('dependentMetrics');
    });
  });
});
