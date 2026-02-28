/**
 * Integration tests for Benchmark API Routes
 *
 * Test coverage:
 * - GET /api/site-benchmarks/tier-groups - Returns empty array when no tier groups exist
 * - GET /api/site-benchmarks/tier-groups - Returns tier groups with tierGroupId, metricCode, tierCount
 * - GET /api/site-benchmarks/tier-groups?metricCode=X - Filters by metric code
 * - GET /api/site-benchmarks/tier-groups - Requires authentication (401 without session)
 * - GET /api/site-benchmarks/tier-groups - Requires site admin role (403 for non-admin)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { storage } from "../../storage";
import { registerBenchmarkRoutes } from "../benchmark-routes";

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

  // Register benchmark routes
  registerBenchmarkRoutes(app);

  return app;
}

const app = createTestApp();

// Test data IDs
let testSiteAdminId: string;
let testOrgAdminId: string;
let testCoachId: string;
let testOrgId: string;
let testBenchmark1Id: string;
let testBenchmark2Id: string;
let testBenchmark3Id: string;

describe("Benchmark API Routes - Tier Groups", () => {
  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test organization
    const org = await storage.createOrganization({
      name: `Test Org for Benchmarks ${timestamp}`,
      description: "Test org for benchmark routes",
      benchmarksEnabled: true,
      allowCustomBenchmarks: true,
    });
    testOrgId = org.id;

    // Create site admin user
    const siteAdmin = await storage.createUser({
      username: `siteadmin-bench-${timestamp}`,
      email: `siteadmin-bench-${timestamp}@test.com`,
      hashedPassword: "hashed",
      role: "site_admin",
      isSiteAdmin: true,
      firstName: "Site",
      lastName: "Admin",
    });
    testSiteAdminId = siteAdmin.id;

    // Create org admin user
    const orgAdmin = await storage.createUser({
      username: `orgadmin-bench-${timestamp}`,
      email: `orgadmin-bench-${timestamp}@test.com`,
      hashedPassword: "hashed",
      role: "org_admin",
      isSiteAdmin: false,
      firstName: "Org",
      lastName: "Admin",
    });
    testOrgAdminId = orgAdmin.id;

    // Link org admin to organization
    await storage.addUserToOrganization(testOrgAdminId, testOrgId, "org_admin");

    // Create coach user
    const coach = await storage.createUser({
      username: `coach-bench-${timestamp}`,
      email: `coach-bench-${timestamp}@test.com`,
      hashedPassword: "hashed",
      role: "coach",
      isSiteAdmin: false,
      firstName: "Test",
      lastName: "Coach",
    });
    testCoachId = coach.id;

    // Link coach to organization
    await storage.addUserToOrganization(testCoachId, testOrgId, "coach");

    // Create test benchmarks with tier groups
    // Generate UUIDs for tier groups
    const tierGroupFly10 = crypto.randomUUID();
    const tierGroupVJ = crypto.randomUUID();

    // Tier group 1: FLY10_TIME with 3 tiers
    const benchmark1 = await storage.createSiteBenchmark({
      name: `10-Yard Fly - Elite ${timestamp}`,
      metricCode: "FLY10_TIME",
      benchmarkType: "tier",
      benchmarkValue: 1.5,
      minValue: null,
      maxValue: null,
      comparisonOperator: "lte",
      isActive: true,
      tierGroupId: tierGroupFly10,
      tierOrder: 1,
      tierName: "Elite",
    });
    testBenchmark1Id = benchmark1.id;

    const benchmark2 = await storage.createSiteBenchmark({
      name: `10-Yard Fly - Good ${timestamp}`,
      metricCode: "FLY10_TIME",
      benchmarkType: "tier",
      benchmarkValue: null,
      minValue: 1.5,
      maxValue: 1.7,
      comparisonOperator: "range",
      isActive: true,
      tierGroupId: tierGroupFly10,
      tierOrder: 2,
      tierName: "Good",
    });
    testBenchmark2Id = benchmark2.id;

    await storage.createSiteBenchmark({
      name: `10-Yard Fly - Average ${timestamp}`,
      metricCode: "FLY10_TIME",
      benchmarkType: "tier",
      benchmarkValue: 1.7,
      minValue: null,
      maxValue: null,
      comparisonOperator: "gte",
      isActive: true,
      tierGroupId: tierGroupFly10,
      tierOrder: 3,
      tierName: "Average",
    });

    // Tier group 2: VERTICAL_JUMP with 2 tiers
    const benchmark3 = await storage.createSiteBenchmark({
      name: `Vertical Jump - Elite ${timestamp}`,
      metricCode: "VERTICAL_JUMP",
      benchmarkType: "tier",
      benchmarkValue: 30,
      minValue: null,
      maxValue: null,
      comparisonOperator: "gte",
      isActive: true,
      tierGroupId: tierGroupVJ,
      tierOrder: 1,
      tierName: "Elite",
    });
    testBenchmark3Id = benchmark3.id;

    await storage.createSiteBenchmark({
      name: `Vertical Jump - Average ${timestamp}`,
      metricCode: "VERTICAL_JUMP",
      benchmarkType: "tier",
      benchmarkValue: 30,
      minValue: null,
      maxValue: null,
      comparisonOperator: "lte",
      isActive: true,
      tierGroupId: tierGroupVJ,
      tierOrder: 2,
      tierName: "Average",
    });
  });

  afterAll(async () => {
    // Clean up test data
    try {
      // Delete benchmarks (no tier group tracking in DB, so just delete benchmarks)
      if (testBenchmark1Id) await storage.deleteSiteBenchmark(testBenchmark1Id, testSiteAdminId);
      if (testBenchmark2Id) await storage.deleteSiteBenchmark(testBenchmark2Id, testSiteAdminId);
      if (testBenchmark3Id) await storage.deleteSiteBenchmark(testBenchmark3Id, testSiteAdminId);

      // Remove users from organization before deleting
      if (testCoachId && testOrgId) await storage.removeUserFromOrganization(testCoachId, testOrgId);
      if (testOrgAdminId && testOrgId) await storage.removeUserFromOrganization(testOrgAdminId, testOrgId);

      // Delete users
      if (testCoachId) await storage.deleteUser(testCoachId);
      if (testOrgAdminId) await storage.deleteUser(testOrgAdminId);
      if (testSiteAdminId) await storage.deleteUser(testSiteAdminId);

      // Delete organization
      if (testOrgId) await storage.deleteOrganization(testOrgId);
    } catch (error) {
      console.error("Cleanup error in benchmark-routes.test.ts:", error);
    }
  });

  beforeEach(() => {
    // Reset mock session user before each test
    mockSessionUser = null;
  });

  describe("GET /api/site-benchmarks/tier-groups", () => {
    it("should return tier groups for site admin", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/site-benchmarks/tier-groups");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      // Verify structure - find a tier group with 3 tiers
      const tierGroupWith3 = response.body.find((tg: any) => tg.metricCode === "FLY10_TIME" && tg.tierCount === 3);
      expect(tierGroupWith3).toBeDefined();
      expect(tierGroupWith3).toHaveProperty("tierGroupId");
      expect(tierGroupWith3).toHaveProperty("metricCode");
      expect(tierGroupWith3).toHaveProperty("tierCount");
      expect(typeof tierGroupWith3.tierCount).toBe("number");
      expect(tierGroupWith3.tierCount).toBe(3); // FLY10_TIME has 3 tiers
    });

    it("should filter tier groups by metricCode query parameter", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/site-benchmarks/tier-groups?metricCode=FLY10_TIME");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // All results should have metricCode FLY10_TIME
      response.body.forEach((tg: any) => {
        expect(tg.metricCode).toBe("FLY10_TIME");
      });

      // Should find at least 1 tier group for FLY10_TIME
      expect(response.body.length).toBeGreaterThanOrEqual(1);

      // Find the tier group with 3 tiers (our test data)
      const tierGroupWith3 = response.body.find((tg: any) => tg.tierCount === 3);
      expect(tierGroupWith3).toBeDefined();
      expect(tierGroupWith3.tierCount).toBe(3);
    });

    it("should return empty array when filtering by non-existent metric", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/site-benchmarks/tier-groups?metricCode=NON_EXISTENT_METRIC");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/site-benchmarks/tier-groups");

      expect(response.status).toBe(401);
    });

    it("should return 403 for non-site-admin (org admin)", async () => {
      mockSessionUser = {
        id: testOrgAdminId,
        email: `orgadmin-bench-${Date.now()}@test.com`,
        role: "org_admin",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-benchmarks/tier-groups");

      expect(response.status).toBe(403);
    });

    it("should return 403 for non-site-admin (coach)", async () => {
      mockSessionUser = {
        id: testCoachId,
        email: `coach-bench-${Date.now()}@test.com`,
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-benchmarks/tier-groups");

      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/site-benchmarks/tier-group", () => {
    it("should create tier group with valid data", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const timestamp = Date.now();

      const tierGroupData = {
        metricCode: "VERTICAL_JUMP",
        name: `Vertical Jump Performance Tiers ${timestamp}`,
        description: "Performance tiers for vertical jump",
        comparisonOperator: "range" as const,
        tiers: [
          {
            tierName: "Elite",
            tierOrder: 1,
            tierColor: "gold",
            minValue: 35,
            maxValue: 50,
          },
          {
            tierName: "Advanced",
            tierOrder: 2,
            tierColor: "silver",
            minValue: 30,
            maxValue: 35,
          },
          {
            tierName: "Intermediate",
            tierOrder: 3,
            tierColor: "bronze",
            minValue: 25,
            maxValue: 30,
          },
        ],
        gender: "Male" as const,
        ageMin: 18,
        ageMax: 25,
      };

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send(tierGroupData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("tierGroupId");
      expect(response.body).toHaveProperty("benchmarks");
      expect(Array.isArray(response.body.benchmarks)).toBe(true);
      expect(response.body.benchmarks.length).toBe(3);

      // Verify all benchmarks have the same tierGroupId
      const tierGroupId = response.body.tierGroupId;
      response.body.benchmarks.forEach((benchmark: any) => {
        expect(benchmark.tierGroupId).toBe(tierGroupId);
      });

      // Verify benchmark names include tier names
      expect(response.body.benchmarks[0].name).toContain("Elite");
      expect(response.body.benchmarks[1].name).toContain("Advanced");
      expect(response.body.benchmarks[2].name).toContain("Intermediate");

      // Verify tier orders
      expect(response.body.benchmarks[0].tierOrder).toBe(1);
      expect(response.body.benchmarks[1].tierOrder).toBe(2);
      expect(response.body.benchmarks[2].tierOrder).toBe(3);

      // Verify shared filters are applied
      response.body.benchmarks.forEach((benchmark: any) => {
        expect(benchmark.gender).toBe("Male");
        expect(benchmark.ageMin).toBe(18);
        expect(benchmark.ageMax).toBe(25);
      });
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "VERTICAL_JUMP",
          name: "Test Tiers",
          comparisonOperator: "range",
          tiers: [
            { tierName: "Elite", tierOrder: 1, minValue: 35, maxValue: 50 },
            { tierName: "Average", tierOrder: 2, minValue: 25, maxValue: 35 },
          ],
        });

      expect(response.status).toBe(401);
    });

    it("should return 403 for non-site-admin users", async () => {
      mockSessionUser = {
        id: testOrgAdminId,
        email: `orgadmin-bench-${Date.now()}@test.com`,
        role: "org_admin",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "VERTICAL_JUMP",
          name: "Test Tiers",
          comparisonOperator: "range",
          tiers: [
            { tierName: "Elite", tierOrder: 1, minValue: 35, maxValue: 50 },
            { tierName: "Average", tierOrder: 2, minValue: 25, maxValue: 35 },
          ],
        });

      expect(response.status).toBe(403);
    });

    it("should return 400 for less than 2 tiers", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "VERTICAL_JUMP",
          name: "Test Tiers",
          comparisonOperator: "range",
          tiers: [
            { tierName: "Elite", tierOrder: 1, minValue: 35, maxValue: 50 },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("at least 2");
    });

    it("should return 400 for more than 10 tiers", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const tiers = Array.from({ length: 11 }, (_, i) => ({
        tierName: `Tier ${i + 1}`,
        tierOrder: i + 1,
        minValue: i * 10,
        maxValue: (i + 1) * 10,
      }));

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "VERTICAL_JUMP",
          name: "Test Tiers",
          comparisonOperator: "range",
          tiers,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("at most 10");
    });

    it("should return 400 for non-sequential tier orders", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "VERTICAL_JUMP",
          name: "Test Tiers",
          comparisonOperator: "range",
          tiers: [
            { tierName: "Elite", tierOrder: 1, minValue: 35, maxValue: 50 },
            { tierName: "Average", tierOrder: 3, minValue: 25, maxValue: 35 }, // Skip 2
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("sequential");
    });

    it("should return 400 for duplicate tier names", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "VERTICAL_JUMP",
          name: "Test Tiers",
          comparisonOperator: "range",
          tiers: [
            { tierName: "Elite", tierOrder: 1, minValue: 35, maxValue: 50 },
            { tierName: "Elite", tierOrder: 2, minValue: 25, maxValue: 35 }, // Duplicate name
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("unique");
    });

    it("should return 404 for non-existent metric code", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "NON_EXISTENT_METRIC",
          name: "Test Tiers",
          comparisonOperator: "range",
          tiers: [
            { tierName: "Elite", tierOrder: 1, minValue: 35, maxValue: 50 },
            { tierName: "Average", tierOrder: 2, minValue: 25, maxValue: 35 },
          ],
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain("does not exist");
    });

    it("should create benchmarks atomically in transaction", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-bench-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const timestamp = Date.now();

      // First request should succeed
      const response1 = await request(app)
        .post("/api/site-benchmarks/tier-group")
        .send({
          metricCode: "VERTICAL_JUMP",
          name: `VJ Tiers Transaction Test ${timestamp}`,
          comparisonOperator: "range",
          tiers: [
            { tierName: "T1", tierOrder: 1, minValue: 35, maxValue: 50 },
            { tierName: "T2", tierOrder: 2, minValue: 25, maxValue: 35 },
          ],
        });

      expect(response1.status).toBe(201);
      const tierGroupId = response1.body.tierGroupId;

      // Verify all benchmarks were created with same tierGroupId
      const benchmarksInGroup = await storage.getSiteBenchmarks({});
      const groupBenchmarks = benchmarksInGroup.filter((b: any) => b.tierGroupId === tierGroupId);
      expect(groupBenchmarks.length).toBe(2);
    });
  });
});
