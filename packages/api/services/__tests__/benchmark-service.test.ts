import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { BenchmarkService } from '../benchmark-service';
import { storage } from '../../storage';
import { db } from '../../db';
import { siteBenchmarks, customBenchmarks, siteMetrics, organizations, users, auditLogs } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

describe('Benchmark Service', () => {
  let benchmarkService: BenchmarkService;
  let testOrgId: string;
  let siteAdminUserId: string;
  let orgAdminUserId: string;
  let regularUserId: string;
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
    benchmarkService = new BenchmarkService();
    createdBenchmarkIds = [];

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization with benchmarks enabled
    const [org] = await db.insert(organizations).values({
      name: `Test Org Benchmarks Service ${uniqueSuffix}`,
      description: 'Test organization for benchmark service tests',
      benchmarksEnabled: true,
      allowCustomBenchmarks: true,
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

    // Create org admin user
    const [orgAdmin] = await db.insert(users).values({
      username: `orgadmin${uniqueSuffix}`,
      emails: ['orgadmin@example.com'],
      password: 'hashedpassword',
      firstName: 'Org',
      lastName: 'Admin',
      fullName: 'Org Admin',
      isSiteAdmin: false,
    }).returning();
    orgAdminUserId = orgAdmin.id;

    // Add org admin to organization
    await storage.addUserToOrganization(orgAdminUserId, testOrgId, 'org_admin');

    // Create regular user
    const [regularUser] = await db.insert(users).values({
      username: `regular${uniqueSuffix}`,
      emails: ['regular@example.com'],
      password: 'hashedpassword',
      firstName: 'Regular',
      lastName: 'User',
      fullName: 'Regular User',
      isSiteAdmin: false,
    }).returning();
    regularUserId = regularUser.id;

    // Ensure test metric exists
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
      for (const id of createdBenchmarkIds) {
        await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, id)).catch(() => {});
        await db.delete(customBenchmarks).where(eq(customBenchmarks.id, id)).catch(() => {});
      }
    }

    // Clean up in correct order (user_organizations before organizations)
    await storage.removeUserFromOrganization(orgAdminUserId, testOrgId, false).catch(() => {});

    // Clean up test organization and users
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(users).where(eq(users.id, siteAdminUserId));
    await db.delete(users).where(eq(users.id, orgAdminUserId));
    await db.delete(users).where(eq(users.id, regularUserId));
  });

  describe('Site Admin Operations', () => {
    // Cycle 1: createSiteBenchmark() requires site admin permission
    it('should throw error if non-site-admin tries to create site benchmark', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: 'Elite Speed',
        benchmarkValue: 1.00,
      };

      await expect(
        benchmarkService.createSiteBenchmark(benchmarkData, regularUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should allow site admin to create site benchmark', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: 'Elite Speed',
        benchmarkValue: 1.00,
      };

      const created = await benchmarkService.createSiteBenchmark(benchmarkData, siteAdminUserId);

      expect(created).toBeDefined();
      expect(created.name).toBe('Elite Speed');
      createdBenchmarkIds.push(created.id);
    });

    // Cycle 2: createSiteBenchmark() validates metric exists
    it('should throw error if metric does not exist', async () => {
      const benchmarkData = {
        metricCode: 'INVALID_METRIC',
        name: 'Invalid Benchmark',
        benchmarkValue: 1.00,
      };

      await expect(
        benchmarkService.createSiteBenchmark(benchmarkData, siteAdminUserId)
      ).rejects.toThrow('Metric');
    });

    it('should create benchmark for valid metric', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: 'Valid Metric Benchmark',
        benchmarkValue: 1.00,
      };

      const created = await benchmarkService.createSiteBenchmark(benchmarkData, siteAdminUserId);

      expect(created.metricCode).toBe(testMetricCode);
      createdBenchmarkIds.push(created.id);
    });

    // Cycle 3: createSiteBenchmark() creates audit log
    it('should create audit log when site benchmark is created', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: 'Audited Benchmark',
        benchmarkValue: 1.00,
      };

      const created = await benchmarkService.createSiteBenchmark(benchmarkData, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Query audit logs to verify
      const logs = await db.select().from(auditLogs)
        .where(eq(auditLogs.userId, siteAdminUserId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);

      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[0];
      expect(latestLog.action).toBe('benchmark_created');
      expect(latestLog.resourceType).toBe('site_benchmark');
      expect(latestLog.resourceId).toBe(created.id);
    });

    // Cycle 4: updateSiteBenchmark() requires site admin permission
    it('should throw error if non-site-admin tries to update site benchmark', async () => {
      // Create benchmark first
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Original Name',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      await expect(
        benchmarkService.updateSiteBenchmark(created.id, { name: 'Hacked Name' }, regularUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should allow site admin to update site benchmark', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Original Name',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      const updated = await benchmarkService.updateSiteBenchmark(created.id, {
        name: 'Updated Name',
      }, siteAdminUserId);

      expect(updated.name).toBe('Updated Name');
    });

    // Cycle 5: deleteSiteBenchmark() prevents deleting system defaults
    it('should throw error when trying to delete system default benchmark', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'System Default',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Mark as system default
      await db.update(siteBenchmarks)
        .set({ isSystemDefault: true })
        .where(eq(siteBenchmarks.id, created.id));

      await expect(
        benchmarkService.deleteSiteBenchmark(created.id, siteAdminUserId)
      ).rejects.toThrow('system default');
    });

    it('should allow deleting non-system-default benchmarks', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Deletable Benchmark',
        benchmarkValue: 1.00,
        isSystemDefault: false,
      }, siteAdminUserId);

      await benchmarkService.deleteSiteBenchmark(created.id, siteAdminUserId);

      const fetched = await storage.getSiteBenchmark(created.id);
      expect(fetched).toBeUndefined();
    });

    // Cycle 6: toggleSiteBenchmarkStatus() requires site admin
    it('should throw error if non-site-admin tries to toggle status', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Toggle Test',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      await expect(
        benchmarkService.toggleSiteBenchmarkStatus(created.id, false, regularUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should allow site admin to toggle benchmark status', async () => {
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Toggle Test',
        benchmarkValue: 1.00,
        isActive: true,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      const toggled = await benchmarkService.toggleSiteBenchmarkStatus(created.id, false, siteAdminUserId);

      expect(toggled.isActive).toBe(false);
    });
  });
});
