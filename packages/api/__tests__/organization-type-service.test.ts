/**
 * Unit tests for organization type filtering in services
 * Tests the core business logic without HTTP/authentication complexity
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { MetricService } from "../services/metric-service";
import { BenchmarkService } from "../services/benchmark-service";
import { db } from "../db";
import { organizations, siteMetrics, siteBenchmarks } from "@shared/schema";

describe("Organization Type Service Logic", () => {
  let metricService: MetricService;
  let benchmarkService: BenchmarkService;
  let testOrgId: string;
  
<<<<<<< HEAD
  // Generate unique suffix for this test run (shortened to fit DB constraints)
  // Use only uppercase letters and numbers to match metric code format constraint: ^[A-Z0-9_]+$
  const timestamp = Date.now().toString();
  const randomNum = Math.floor(Math.random() * 10000);
  const testSuffix = `${timestamp}_${randomNum}`;
  const TEST_ORG_NAME = `Test Service Org ${testSuffix}`;
  const TEST_METRIC_CODE = `TSTORG${timestamp.substring(8)}${randomNum}`; // Format: TSTORG<last5digits><random> to fit varchar(50) and ^[A-Z0-9_]+$
=======
  // Generate unique suffix for this test run (shortened to fit varchar(50) limit)
  const testSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const TEST_ORG_NAME = `Test Service Org ${testSuffix}`;
  const TEST_METRIC_CODE = `TMOF_${testSuffix}`; // Shortened from TEST_METRIC_ORG_FILTER to fit varchar(50)
>>>>>>> 2857d1b5 (fix: correct wellness magic link URL format and test string lengths)
  const TEST_BENCHMARK_NAME = `Test College Benchmark ${testSuffix}`;

  beforeAll(async () => {
    // Clean up and create test organization once
    await db.delete(organizations).where({
      name: TEST_ORG_NAME,
    });

    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "college",
      description: "Test organization for service testing",
      isActive: true,
      benchmarksEnabled: true,
    }).returning();
    testOrgId = org.id;
  });

  beforeEach(async () => {
    metricService = new MetricService();
    benchmarkService = new BenchmarkService();
    // Clean up any leftover test data before each test
    await db.delete(siteBenchmarks).where({
      name: TEST_BENCHMARK_NAME,
    });
    await db.execute(`DELETE FROM site_metrics WHERE code LIKE 'TSTORG%'`);
  });

  afterEach(async () => {
    // Clean up test data after each test - use LIKE to catch all variations
    await db.delete(siteBenchmarks).where({
      name: TEST_BENCHMARK_NAME,
    });
    // Delete all metrics that start with our test prefix
    await db.execute(`DELETE FROM site_metrics WHERE code LIKE 'TSTORG%'`);
  });

  afterAll(async () => {
    // Clean up organization after all tests
    if (testOrgId) {
      await db.delete(organizations).where({ id: testOrgId });
    }
  });

  describe("MetricService Organization Type Filtering", () => {
    it("should filter metrics by organization type", async () => {
      // Create test metric available only to college orgs
      const testMetricCode = `${TEST_METRIC_CODE}_FILTER`;
      const [metric] = await db.insert(siteMetrics).values({
        code: testMetricCode,
        label: "College-only Metric",
        category: "speed",
        unit: "s",
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        displayOrder: 1,
        availableOrgTypes: ["college", "elite_academy"],
      }).returning();

      // Test with college org type - should include metric
      const collegeMetrics = await metricService.getSiteMetrics("fake-user-id", { orgType: "college" });
      const collegeMetric = collegeMetrics.find(m => m.code === testMetricCode);
      expect(collegeMetric).toBeDefined();

      // Test with club org type - should exclude metric
      const clubMetrics = await metricService.getSiteMetrics("fake-user-id", { orgType: "club" });
      const clubMetric = clubMetrics.find(m => m.code === testMetricCode);
      expect(clubMetric).toBeUndefined();
    });

    it("should include metrics with null availableOrgTypes for all org types", async () => {
      // Create test metric available to all orgs
      await db.insert(siteMetrics).values({
        code: TEST_METRIC_CODE,
        label: "Global Metric",
        category: "strength",
        unit: "lbs",
        lowerIsBetter: false,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 1,
        availableOrgTypes: null, // Available to all
      });

      // Should be available to any org type
      const clubMetrics = await metricService.getSiteMetrics("fake-user-id", { orgType: "club" });
      const clubMetric = clubMetrics.find(m => m.code === TEST_METRIC_CODE);
      expect(clubMetric).toBeDefined();

      const collegeMetrics = await metricService.getSiteMetrics("fake-user-id", { orgType: "college" });
      const collegeMetric = collegeMetrics.find(m => m.code === TEST_METRIC_CODE);
      expect(collegeMetric).toBeDefined();
    });

    it("should get metrics for organization based on its type", async () => {
      // Create metric available only to college orgs
      await db.insert(siteMetrics).values({
        code: TEST_METRIC_CODE,
        label: "College Metric",
        category: "speed",
        unit: "s",
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        displayOrder: 1,
        availableOrgTypes: ["college"],
      });

      // Should get college metrics for college organization
      const orgMetrics = await metricService.getSiteMetricsForOrganization(testOrgId, "fake-user-id");
      const orgMetric = orgMetrics.find(m => m.code === TEST_METRIC_CODE);
      expect(orgMetric).toBeDefined();
      expect(orgMetric?.availableOrgTypes).toContain("college");
    });
  });

  describe("BenchmarkService Organization Type Filtering", () => {
    it("should filter benchmarks by organization type", async () => {
      // Create test metric first
      const [metric] = await db.insert(siteMetrics).values({
        code: TEST_METRIC_CODE,
        label: "Test Metric for Benchmark",
        category: "speed",
        unit: "s",
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        displayOrder: 1,
      }).returning();

      // Create test benchmark available only to college orgs
      const [benchmark] = await db.insert(siteBenchmarks).values({
        metricCode: metric.code,
        name: TEST_BENCHMARK_NAME,
        description: "Elite benchmark for college athletes",
        benchmarkValue: "4.50",
        comparisonOperator: "lte",
        applicableOrgTypes: ["college"],
        isSystemDefault: false,
        isActive: true,
        displayOrder: 1,
      }).returning();

      // Test with college org type - should include benchmark
      const collegeBenchmarks = await benchmarkService.getSiteBenchmarks("fake-user-id", { orgType: "college" });
      const collegeBenchmark = collegeBenchmarks.find(b => b.name === TEST_BENCHMARK_NAME);
      expect(collegeBenchmark).toBeDefined();

      // Test with club org type - should exclude benchmark
      const clubBenchmarks = await benchmarkService.getSiteBenchmarks("fake-user-id", { orgType: "club" });
      const clubBenchmark = clubBenchmarks.find(b => b.name === TEST_BENCHMARK_NAME);
      expect(clubBenchmark).toBeUndefined();
    });

    it("should include benchmarks with null applicableOrgTypes for all org types", async () => {
      // Create test metric first
      await db.insert(siteMetrics).values({
        code: TEST_METRIC_CODE,
        label: "Test Metric",
        category: "speed",
        unit: "s",
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        displayOrder: 1,
      });

      // Create benchmark available to all orgs
      await db.insert(siteBenchmarks).values({
        metricCode: TEST_METRIC_CODE,
        name: TEST_BENCHMARK_NAME,
        description: "Global benchmark",
        benchmarkValue: "5.00",
        comparisonOperator: "lte",
        applicableOrgTypes: null, // Available to all
        isSystemDefault: true,
        isActive: true,
        displayOrder: 1,
      });

      // Should be available to any org type
      const clubBenchmarks = await benchmarkService.getSiteBenchmarks("fake-user-id", { orgType: "club" });
      const clubBenchmark = clubBenchmarks.find(b => b.name === TEST_BENCHMARK_NAME);
      expect(clubBenchmark).toBeDefined();

      const collegeBenchmarks = await benchmarkService.getSiteBenchmarks("fake-user-id", { orgType: "college" });
      const collegeBenchmark = collegeBenchmarks.find(b => b.name === TEST_BENCHMARK_NAME);
      expect(collegeBenchmark).toBeDefined();
    });

    it("should get benchmarks for organization based on its type", async () => {
      // Create metric and benchmark
      await db.insert(siteMetrics).values({
        code: TEST_METRIC_CODE,
        label: "Test Metric",
        category: "speed",
        unit: "s",
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        displayOrder: 1,
      });

      await db.insert(siteBenchmarks).values({
        metricCode: TEST_METRIC_CODE,
        name: TEST_BENCHMARK_NAME,
        description: "College benchmark",
        benchmarkValue: "4.50",
        comparisonOperator: "lte",
        applicableOrgTypes: ["college"],
        isSystemDefault: false,
        isActive: true,
        displayOrder: 1,
      });

      // Should get college benchmarks for college organization
      const orgBenchmarks = await benchmarkService.getSiteBenchmarksForOrganization(testOrgId, "fake-user-id");
      const orgBenchmark = orgBenchmarks.find(b => b.name === TEST_BENCHMARK_NAME);
      expect(orgBenchmark).toBeDefined();
      expect(orgBenchmark?.applicableOrgTypes).toContain("college");
    });
  });
});