import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { storage } from '../storage';
import { db } from '../db';
import { siteBenchmarks, customBenchmarks, organizationBenchmarks, siteMetrics, organizations, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('Benchmark Storage', () => {
  let testOrgId: string;
  let siteAdminUserId: string;
  let testMetricCode: string;
  let createdBenchmarkIds: string[] = [];

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }
  });

  beforeEach(async () => {
    createdBenchmarkIds = [];

    // Create unique suffix to avoid race conditions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org Benchmarks ${uniqueSuffix}`,
      description: 'Test organization for benchmark storage tests',
    }).returning();
    testOrgId = org.id;

    // Create site admin user
    const [siteAdmin] = await db.insert(users).values({
      username: `siteadmin${uniqueSuffix}`,
      emails: ['siteadmin@example.com'],
      password: 'hashedpassword',
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    }).returning();
    siteAdminUserId = siteAdmin.id;

    // Create test metric (or use existing FLY10_TIME)
    testMetricCode = 'FLY10_TIME';
    const existingMetric = await db.select().from(siteMetrics).where(eq(siteMetrics.code, testMetricCode)).limit(1);
    if (existingMetric.length === 0) {
      await db.insert(siteMetrics).values({
        code: testMetricCode,
        label: '10-Yard Fly Time',
        category: 'speed',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
      });
    }
  });

  afterEach(async () => {
    // Clean up created benchmarks
    if (createdBenchmarkIds.length > 0) {
      await db.delete(siteBenchmarks).where(
        eq(siteBenchmarks.id, createdBenchmarkIds[0])
      );
    }

    // Clean up test organization and users (cascades)
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(users).where(eq(users.id, siteAdminUserId));
  });

  describe('Site Benchmarks CRUD', () => {
    // Cycle 1: createSiteBenchmark() inserts and returns benchmark
    it('should create a site benchmark and return it', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: 'Elite Speed Test',
        description: 'Test benchmark for elite speed',
        benchmarkValue: 1.00,
        comparisonOperator: 'lte' as const,
        gender: 'Male' as const,
        ageMin: 18,
        ageMax: 22,
        isActive: true,
        displayOrder: 1,
      };

      const created = await storage.createSiteBenchmark(benchmarkData, siteAdminUserId);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.metricCode).toBe(testMetricCode);
      expect(created.name).toBe('Elite Speed Test');
      expect(created.benchmarkValue).toBe('1.000'); // Decimal returned as string
      expect(created.comparisonOperator).toBe('lte');
      expect(created.createdBy).toBe(siteAdminUserId);

      createdBenchmarkIds.push(created.id);
    });

    // Cycle 2: getSiteBenchmark(id) returns benchmark or null
    it('should get a site benchmark by id', async () => {
      // Create a benchmark first
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Test Benchmark',
        benchmarkValue: 1.50,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      const fetched = await storage.getSiteBenchmark(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe('Test Benchmark');
    });

    it('should return undefined for non-existent benchmark', async () => {
      const result = await storage.getSiteBenchmark('non-existent-id');
      expect(result).toBeUndefined();
    });

    // Cycle 3: getAllSiteBenchmarks() returns all active benchmarks
    it('should get all active site benchmarks', async () => {
      // Create multiple benchmarks
      const created1 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Benchmark 1',
        benchmarkValue: 1.00,
        isActive: true,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created1.id);

      const created2 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Benchmark 2',
        benchmarkValue: 1.50,
        isActive: false, // Inactive
      }, siteAdminUserId);
      createdBenchmarkIds.push(created2.id);

      const activeBenchmarks = await storage.getSiteBenchmarks();

      const ourBenchmarks = activeBenchmarks.filter(b =>
        b.id === created1.id || b.id === created2.id
      );

      expect(ourBenchmarks.length).toBe(1); // Only active one
      expect(ourBenchmarks[0].id).toBe(created1.id);
    });

    it('should get all site benchmarks including inactive when requested', async () => {
      const created1 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Active Benchmark',
        benchmarkValue: 1.00,
        isActive: true,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created1.id);

      const created2 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Inactive Benchmark',
        benchmarkValue: 1.50,
        isActive: false,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created2.id);

      const allBenchmarks = await storage.getSiteBenchmarks({ includeInactive: true });

      const ourBenchmarks = allBenchmarks.filter(b =>
        b.id === created1.id || b.id === created2.id
      );

      expect(ourBenchmarks.length).toBe(2); // Both active and inactive
    });

    // Cycle 4: updateSiteBenchmark() updates fields
    it('should update a site benchmark', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Original Name',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      const updated = await storage.updateSiteBenchmark(created.id, {
        name: 'Updated Name',
        benchmarkValue: 2.00,
        description: 'Updated description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.benchmarkValue).toBe('2.000');
      expect(updated.description).toBe('Updated description');
      expect(updated.updatedAt).toBeDefined();
    });

    // Cycle 5: deleteSiteBenchmark() deletes benchmark
    it('should delete a site benchmark', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'To Be Deleted',
        benchmarkValue: 1.00,
        isSystemDefault: false,
      }, siteAdminUserId);

      await storage.deleteSiteBenchmark(created.id);

      const fetched = await storage.getSiteBenchmark(created.id);
      expect(fetched).toBeUndefined();
    });

    it('should not delete system default benchmarks', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'System Default',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Manually set as system default
      await db.update(siteBenchmarks)
        .set({ isSystemDefault: true })
        .where(eq(siteBenchmarks.id, created.id));

      await expect(storage.deleteSiteBenchmark(created.id))
        .rejects.toThrow('Cannot delete system default benchmark');
    });

    // Cycle 6: toggleSiteBenchmarkStatus() flips is_active
    it('should toggle site benchmark active status', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Toggle Test',
        benchmarkValue: 1.00,
        isActive: true,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Toggle to inactive
      const toggled = await storage.toggleSiteBenchmarkStatus(created.id, false);
      expect(toggled.isActive).toBe(false);

      // Toggle back to active
      const toggledAgain = await storage.toggleSiteBenchmarkStatus(created.id, true);
      expect(toggledAgain.isActive).toBe(true);
    });
  });
});
