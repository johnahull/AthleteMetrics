/**
 * Organization Type API Test Suite
 * Tests organization type functionality in API endpoints with TDD approach
 * 
 * RED Phase: These tests should fail initially before implementation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { registerAllRoutes } from "../routes/index";
import { db } from "../db";
import { organizations, siteBenchmarks, siteMetrics } from "@shared/schema";

// Test data setup
const testOrgData = {
  name: "Test College Organization",
  description: "A test college for organization type testing",
  location: "Test City, State",
  orgType: "college" as const,
};

const testHighSchoolOrgData = {
  name: "Test High School",
  description: "A test high school",
  location: "Test City, State", 
  orgType: "high_school" as const,
};

const testMetricData = {
  code: "TEST_METRIC_ORG_TYPE",
  label: "Test Metric with Org Type",
  category: "speed",
  unit: "s",
  lowerIsBetter: true,
  isSystemDefault: false,
  isActive: true,
  displayOrder: 1,
  description: "Test metric for organization type filtering",
  availableOrgTypes: ["college", "high_school"] as const,
};

const testBenchmarkData = {
  metricCode: "TEST_METRIC_ORG_TYPE",
  name: "College Elite Benchmark",
  description: "Elite performance benchmark for college athletes",
  benchmarkValue: "4.50",
  comparisonOperator: "lte" as const,
  applicableOrgTypes: ["college"] as const,
  isSystemDefault: false,
  isActive: true,
  displayOrder: 1,
};

let testOrgId: string;
let testHighSchoolOrgId: string;
let siteAdminSession: any;
let app: express.Express;

describe("Organization Type API Endpoints", () => {
  beforeEach(async () => {
    // Create test Express app with necessary middleware
    app = express();
    
    // Essential middleware for API testing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Register all routes
    registerAllRoutes(app);
    // Login as site admin
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({
        username: process.env.ADMIN_USER || "admin",
        password: process.env.ADMIN_PASS || "password",
      });
    
    expect(loginResponse.status).toBe(200);
    siteAdminSession = loginResponse.headers["set-cookie"];

    // Clean up existing test data
    await db.delete(siteBenchmarks).where({
      metricCode: testMetricData.code,
    });
    await db.delete(siteMetrics).where({
      code: testMetricData.code,
    });
    await db.delete(organizations).where({
      name: testOrgData.name,
    });
    await db.delete(organizations).where({
      name: testHighSchoolOrgData.name,
    });

    // Create test metric with org type restrictions
    await request(app)
      .post("/api/site-metrics")
      .set("Cookie", siteAdminSession)
      .send(testMetricData)
      .expect(201);

    // Create test benchmark with org type restrictions
    await request(app)
      .post("/api/site-benchmarks")
      .set("Cookie", siteAdminSession)
      .send(testBenchmarkData)
      .expect(201);
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(siteBenchmarks).where({
      metricCode: testMetricData.code,
    });
    await db.delete(siteMetrics).where({
      code: testMetricData.code,
    });
    if (testOrgId) {
      await db.delete(organizations).where({ id: testOrgId });
    }
    if (testHighSchoolOrgId) {
      await db.delete(organizations).where({ id: testHighSchoolOrgId });
    }
  });

  describe("Organization CRUD with orgType", () => {
    it("should create organization with orgType field", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testOrgData)
        .expect(201);

      expect(response.body.orgType).toBe("college");
      expect(response.body.name).toBe(testOrgData.name);
      testOrgId = response.body.id;
    });

    it("should get organization with orgType field", async () => {
      // First create organization
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testOrgData);
      testOrgId = createResponse.body.id;

      // Then retrieve it
      const response = await request(app)
        .get(`/api/organizations/${testOrgId}`)
        .set("Cookie", siteAdminSession)
        .expect(200);

      expect(response.body.orgType).toBe("college");
      expect(response.body.name).toBe(testOrgData.name);
    });

    it("should update organization orgType field", async () => {
      // First create organization
      const createResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testOrgData);
      testOrgId = createResponse.body.id;

      // Update orgType
      const response = await request(app)
        .patch(`/api/organizations/${testOrgId}`)
        .set("Cookie", siteAdminSession)
        .send({ orgType: "high_school" })
        .expect(200);

      expect(response.body.orgType).toBe("high_school");
    });

    it("should validate orgType enum values", async () => {
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send({
          ...testOrgData,
          orgType: "invalid_type",
        })
        .expect(400);

      expect(response.body.message).toContain("Invalid enum value");
    });

    it("should default orgType to 'club' when not provided", async () => {
      const { orgType, ...orgDataWithoutType } = testOrgData;
      const response = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(orgDataWithoutType)
        .expect(201);

      expect(response.body.orgType).toBe("club");
      testOrgId = response.body.id;
    });
  });

  describe("Metric Filtering by Organization Type", () => {
    beforeEach(async () => {
      // Create test organizations
      const collegeOrgResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testOrgData);
      testOrgId = collegeOrgResponse.body.id;

      const highSchoolOrgResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testHighSchoolOrgData);
      testHighSchoolOrgId = highSchoolOrgResponse.body.id;
    });

    it("should filter site metrics by organization type", async () => {
      const response = await request(app)
        .get("/api/site-metrics")
        .set("Cookie", siteAdminSession)
        .query({ orgType: "college" })
        .expect(200);

      // Should include metrics available to college orgs
      const testMetric = response.body.find((m: any) => m.code === testMetricData.code);
      expect(testMetric).toBeDefined();
      expect(testMetric.availableOrgTypes).toContain("college");
    });

    it("should exclude metrics not available to organization type", async () => {
      const response = await request(app)
        .get("/api/site-metrics")
        .set("Cookie", siteAdminSession)
        .query({ orgType: "club" })
        .expect(200);

      // Should NOT include metrics only available to college/high_school
      const testMetric = response.body.find((m: any) => m.code === testMetricData.code);
      expect(testMetric).toBeUndefined();
    });

    it("should include metrics with null availableOrgTypes (available to all)", async () => {
      // Create metric available to all org types
      const globalMetricData = {
        code: "GLOBAL_METRIC",
        label: "Global Metric",
        category: "strength",
        unit: "lbs",
        lowerIsBetter: false,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 1,
        availableOrgTypes: null, // Available to all org types
      };

      await request(app)
        .post("/api/site-metrics")
        .set("Cookie", siteAdminSession)
        .send(globalMetricData)
        .expect(201);

      // Test with club org type
      const response = await request(app)
        .get("/api/site-metrics")
        .set("Cookie", siteAdminSession)
        .query({ orgType: "club" })
        .expect(200);

      const globalMetric = response.body.find((m: any) => m.code === globalMetricData.code);
      expect(globalMetric).toBeDefined();

      // Cleanup
      await db.delete(siteMetrics).where({ code: globalMetricData.code });
    });
  });

  describe("Benchmark Filtering by Organization Type", () => {
    beforeEach(async () => {
      // Create test organizations
      const collegeOrgResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testOrgData);
      testOrgId = collegeOrgResponse.body.id;

      const highSchoolOrgResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testHighSchoolOrgData);
      testHighSchoolOrgId = highSchoolOrgResponse.body.id;
    });

    it("should filter site benchmarks by organization type", async () => {
      const response = await request(app)
        .get("/api/site-benchmarks")
        .set("Cookie", siteAdminSession)
        .query({ orgType: "college" })
        .expect(200);

      // Should include benchmarks applicable to college orgs
      const testBenchmark = response.body.find((b: any) => b.name === testBenchmarkData.name);
      expect(testBenchmark).toBeDefined();
      expect(testBenchmark.applicableOrgTypes).toContain("college");
    });

    it("should exclude benchmarks not applicable to organization type", async () => {
      const response = await request(app)
        .get("/api/site-benchmarks")
        .set("Cookie", siteAdminSession)
        .query({ orgType: "club" })
        .expect(200);

      // Should NOT include benchmarks only applicable to college
      const testBenchmark = response.body.find((b: any) => b.name === testBenchmarkData.name);
      expect(testBenchmark).toBeUndefined();
    });

    it("should include benchmarks with null applicableOrgTypes (apply to all)", async () => {
      // Create benchmark applicable to all org types
      const globalBenchmarkData = {
        metricCode: testMetricData.code,
        name: "Global Benchmark",
        description: "Applies to all organization types",
        benchmarkValue: "5.00",
        comparisonOperator: "lte" as const,
        applicableOrgTypes: null, // Applies to all org types
        isSystemDefault: true,
        isActive: true,
        displayOrder: 2,
      };

      await request(app)
        .post("/api/site-benchmarks")
        .set("Cookie", siteAdminSession)
        .send(globalBenchmarkData)
        .expect(201);

      // Test with club org type
      const response = await request(app)
        .get("/api/site-benchmarks")
        .set("Cookie", siteAdminSession)
        .query({ orgType: "club" })
        .expect(200);

      const globalBenchmark = response.body.find((b: any) => b.name === globalBenchmarkData.name);
      expect(globalBenchmark).toBeDefined();

      // Cleanup
      await db.delete(siteBenchmarks).where({ name: globalBenchmarkData.name });
    });
  });

  describe("Organization-specific Filtering", () => {
    beforeEach(async () => {
      // Create test organizations
      const collegeOrgResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testOrgData);
      testOrgId = collegeOrgResponse.body.id;

      const highSchoolOrgResponse = await request(app)
        .post("/api/organizations")
        .set("Cookie", siteAdminSession)
        .send(testHighSchoolOrgData);
      testHighSchoolOrgId = highSchoolOrgResponse.body.id;
    });

    it("should filter metrics based on requesting organization's type", async () => {
      // Get metrics for college organization
      const collegeResponse = await request(app)
        .get("/api/metrics")
        .set("Cookie", siteAdminSession)
        .set("X-Organization-Id", testOrgId) // College org
        .expect(200);

      const testMetric = collegeResponse.body.find((m: any) => m.code === testMetricData.code);
      expect(testMetric).toBeDefined();

      // Try to get metrics for non-existent club organization with club type
      // This should not include the college-only metric
      // Note: This would require creating a club org first, will be implemented when needed
    });

    it("should filter benchmarks based on requesting organization's type", async () => {
      // Get benchmarks for college organization
      const collegeResponse = await request(app)
        .get("/api/benchmarks")
        .set("Cookie", siteAdminSession)
        .set("X-Organization-Id", testOrgId) // College org
        .expect(200);

      const testBenchmark = collegeResponse.body.find((b: any) => b.name === testBenchmarkData.name);
      expect(testBenchmark).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid orgType query parameter gracefully", async () => {
      const response = await request(app)
        .get("/api/site-metrics")
        .set("Cookie", siteAdminSession)
        .query({ orgType: "invalid_org_type" })
        .expect(400);

      expect(response.body.message).toContain("Invalid organization type");
    });

    it("should handle missing organization context gracefully", async () => {
      const response = await request(app)
        .get("/api/metrics")
        .set("Cookie", siteAdminSession)
        // Missing X-Organization-Id header
        .expect(400);

      expect(response.body.message).toContain("Organization context required");
    });
  });
});