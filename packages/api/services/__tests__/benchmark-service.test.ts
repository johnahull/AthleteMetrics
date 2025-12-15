import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { BenchmarkService } from '../benchmark-service';
import { storage } from '../../storage';
import { db } from '../../db';
import { siteBenchmarks, customBenchmarks, siteMetrics, organizations, users, auditLogs, measurements } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

describe('Benchmark Service', () => {
  let benchmarkService: BenchmarkService;
  let testOrgId: string;
  let siteAdminUserId: string;
  let orgAdminUserId: string;
  let regularUserId: string;
  let testMetricCode: string;
  let createdBenchmarkIds: string[] = [];
  let uniqueSuffix: string;

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

    uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

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
        name: `Elite Speed ${uniqueSuffix}`,
        benchmarkValue: 1.00,
      };

      await expect(
        benchmarkService.createSiteBenchmark(benchmarkData, regularUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should allow site admin to create site benchmark', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: `Elite Speed ${uniqueSuffix}`,
        benchmarkValue: 1.00,
      };

      const created = await benchmarkService.createSiteBenchmark(benchmarkData, siteAdminUserId);

      expect(created).toBeDefined();
      expect(created.name).toBe(`Elite Speed ${uniqueSuffix}`);
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
        name: `Valid Metric Benchmark ${uniqueSuffix}`,
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
        name: `Audited Benchmark ${uniqueSuffix}`,
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
        name: `Original Name ${uniqueSuffix}`,
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
        name: `Original Name ${uniqueSuffix}`,
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      const updated = await benchmarkService.updateSiteBenchmark(created.id, {
        name: `Updated Name ${uniqueSuffix}`,
      }, siteAdminUserId);

      expect(updated.name).toBe(`Updated Name ${uniqueSuffix}`);
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

  describe('Org Admin Operations', () => {
    // Cycle 7: createCustomBenchmark() requires org admin OR site admin
    it('should throw error if regular user tries to create custom benchmark', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Team Custom',
        benchmarkValue: 1.10,
      };

      await expect(
        benchmarkService.createCustomBenchmark(benchmarkData, regularUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should allow org admin to create custom benchmark', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Team Custom',
        benchmarkValue: 1.10,
      };

      const created = await benchmarkService.createCustomBenchmark(benchmarkData, orgAdminUserId);

      expect(created).toBeDefined();
      expect(created.name).toBe('Team Custom');
      expect(created.organizationId).toBe(testOrgId);
      createdBenchmarkIds.push(created.id);
    });

    it('should allow site admin to create custom benchmark', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Site Admin Custom',
        benchmarkValue: 1.10,
      };

      const created = await benchmarkService.createCustomBenchmark(benchmarkData, siteAdminUserId);

      expect(created).toBeDefined();
      expect(created.organizationId).toBe(testOrgId);
      createdBenchmarkIds.push(created.id);
    });

    // Cycle 8: createCustomBenchmark() fails if allow_custom_benchmarks = false
    it('should throw error if custom benchmarks are not allowed for organization', async () => {
      // Disable custom benchmarks for org
      await db.update(organizations)
        .set({ allowCustomBenchmarks: false })
        .where(eq(organizations.id, testOrgId));

      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Disallowed Custom',
        benchmarkValue: 1.10,
      };

      await expect(
        benchmarkService.createCustomBenchmark(benchmarkData, orgAdminUserId)
      ).rejects.toThrow('not allowed');

      // Re-enable for other tests
      await db.update(organizations)
        .set({ allowCustomBenchmarks: true })
        .where(eq(organizations.id, testOrgId));
    });

    it('should allow custom benchmark creation when feature is enabled', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Allowed Custom',
        benchmarkValue: 1.10,
      };

      const created = await benchmarkService.createCustomBenchmark(benchmarkData, orgAdminUserId);

      expect(created).toBeDefined();
      createdBenchmarkIds.push(created.id);
    });

    // Cycle 9: createCustomBenchmark() creates audit log
    it('should create audit log when custom benchmark is created', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Audited Custom',
        benchmarkValue: 1.10,
      };

      const created = await benchmarkService.createCustomBenchmark(benchmarkData, orgAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Query audit logs to verify
      const logs = await db.select().from(auditLogs)
        .where(eq(auditLogs.userId, orgAdminUserId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);

      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[0];
      expect(latestLog.action).toBe('custom_benchmark_created');
      expect(latestLog.resourceType).toBe('custom_benchmark');
      expect(latestLog.resourceId).toBe(created.id);
    });

    // Cycle 10: updateCustomBenchmark() only allows owner org or site admin
    it('should throw error if non-owner org admin tries to update custom benchmark', async () => {
      // Create benchmark for testOrg
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Protected Custom',
        benchmarkValue: 1.10,
      }, orgAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Create another org and admin
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const [otherOrg] = await db.insert(organizations).values({
        name: `Other Org ${uniqueSuffix}`,
        benchmarksEnabled: true,
        allowCustomBenchmarks: true,
      }).returning();

      const [otherAdmin] = await db.insert(users).values({
        username: `otheradmin${uniqueSuffix}`,
        emails: ['otheradmin@example.com'],
        password: 'hashedpassword',
        firstName: 'Other',
        lastName: 'Admin',
        fullName: 'Other Admin',
        isSiteAdmin: false,
      }).returning();

      await storage.addUserToOrganization(otherAdmin.id, otherOrg.id, 'org_admin');

      await expect(
        benchmarkService.updateCustomBenchmark(created.organizationId, created.id, { name: 'Hacked' }, otherAdmin.id)
      ).rejects.toThrow('Unauthorized');

      // Cleanup
      await storage.removeUserFromOrganization(otherAdmin.id, otherOrg.id, false).catch(() => {});
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
      await db.delete(users).where(eq(users.id, otherAdmin.id));
    });

    it('should allow owner org admin to update custom benchmark', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Original Custom Name',
        benchmarkValue: 1.10,
      }, orgAdminUserId);
      createdBenchmarkIds.push(created.id);

      const updated = await benchmarkService.updateCustomBenchmark(
        testOrgId,
        created.id,
        { name: 'Updated Custom Name' },
        orgAdminUserId
      );

      expect(updated.name).toBe('Updated Custom Name');
    });

    it('should allow site admin to update any custom benchmark', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: `Original Name ${uniqueSuffix}`,
        benchmarkValue: 1.10,
      }, orgAdminUserId);
      createdBenchmarkIds.push(created.id);

      const updated = await benchmarkService.updateCustomBenchmark(
        testOrgId,
        created.id,
        { name: 'Site Admin Updated' },
        siteAdminUserId
      );

      expect(updated.name).toBe('Site Admin Updated');
    });

    // Cycle 11: deleteCustomBenchmark() only allows owner org or site admin
    it('should throw error if non-owner org admin tries to delete custom benchmark', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Protected from Deletion',
        benchmarkValue: 1.10,
      }, orgAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Create another org and admin
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const [otherOrg] = await db.insert(organizations).values({
        name: `Other Org ${uniqueSuffix}`,
      }).returning();

      const [otherAdmin] = await db.insert(users).values({
        username: `otheradmin${uniqueSuffix}`,
        emails: ['otheradmin@example.com'],
        password: 'hashedpassword',
        firstName: 'Other',
        lastName: 'Admin',
        fullName: 'Other Admin',
        isSiteAdmin: false,
      }).returning();

      await storage.addUserToOrganization(otherAdmin.id, otherOrg.id, 'org_admin');

      await expect(
        benchmarkService.deleteCustomBenchmark(created.organizationId, created.id, otherAdmin.id)
      ).rejects.toThrow('Unauthorized');

      // Cleanup
      await storage.removeUserFromOrganization(otherAdmin.id, otherOrg.id, false).catch(() => {});
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
      await db.delete(users).where(eq(users.id, otherAdmin.id));

      // Verify benchmark still exists
      const fetched = await storage.getCustomBenchmarksForOrg(testOrgId);
      expect(fetched.some(b => b.id === created.id)).toBe(true);
    });

    it('should allow owner org admin to delete custom benchmark', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'To Be Deleted By Org Admin',
        benchmarkValue: 1.10,
      }, orgAdminUserId);

      await benchmarkService.deleteCustomBenchmark(testOrgId, created.id, orgAdminUserId);

      const benchmarks = await storage.getCustomBenchmarksForOrg(testOrgId);
      expect(benchmarks.some(b => b.id === created.id)).toBe(false);
    });

    it('should allow site admin to delete any custom benchmark', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'To Be Deleted By Site Admin',
        benchmarkValue: 1.10,
      }, orgAdminUserId);

      await benchmarkService.deleteCustomBenchmark(testOrgId, created.id, siteAdminUserId);

      const benchmarks = await storage.getCustomBenchmarksForOrg(testOrgId);
      expect(benchmarks.some(b => b.id === created.id)).toBe(false);
    });
  });

  describe('Enablement Operations', () => {
    let siteBenchmarkId: string;
    let customBenchmarkId: string;

    beforeEach(async () => {
      // Create a site benchmark for testing
      const siteBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Site Benchmark for Enablement',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      siteBenchmarkId = siteBenchmark.id;
      createdBenchmarkIds.push(siteBenchmarkId);

      // Create a custom benchmark for testing
      const customBenchmark = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Custom Benchmark for Enablement',
        benchmarkValue: 1.10,
      }, orgAdminUserId);
      customBenchmarkId = customBenchmark.id;
      createdBenchmarkIds.push(customBenchmarkId);
    });

    // Cycle 12: enableBenchmarkForOrg() requires org admin OR site admin
    it('should throw error if regular user tries to enable benchmark', async () => {
      await expect(
        benchmarkService.enableBenchmarkForOrg(testOrgId, siteBenchmarkId, 'site', regularUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should allow org admin to enable benchmark for their org', async () => {
      const enabled = await benchmarkService.enableBenchmarkForOrg(
        testOrgId,
        siteBenchmarkId,
        'site',
        orgAdminUserId
      );

      expect(enabled).toBeDefined();
      expect(enabled.benchmarkId).toBe(siteBenchmarkId);
      expect(enabled.organizationId).toBe(testOrgId);
      expect(enabled.isEnabled).toBe(true);
    });

    it('should allow site admin to enable benchmark for any org', async () => {
      const enabled = await benchmarkService.enableBenchmarkForOrg(
        testOrgId,
        siteBenchmarkId,
        'site',
        siteAdminUserId
      );

      expect(enabled).toBeDefined();
      expect(enabled.benchmarkId).toBe(siteBenchmarkId);
      expect(enabled.isEnabled).toBe(true);
    });

    // Cycle 13: enableBenchmarkForOrg() fails if benchmarks_enabled = false
    it('should throw error if benchmarks are not enabled for organization', async () => {
      // Disable benchmarks for org
      await db.update(organizations)
        .set({ benchmarksEnabled: false })
        .where(eq(organizations.id, testOrgId));

      await expect(
        benchmarkService.enableBenchmarkForOrg(testOrgId, siteBenchmarkId, 'site', orgAdminUserId)
      ).rejects.toThrow('not enabled');

      // Re-enable for other tests
      await db.update(organizations)
        .set({ benchmarksEnabled: true })
        .where(eq(organizations.id, testOrgId));
    });

    it('should allow enabling benchmark when feature is enabled', async () => {
      const enabled = await benchmarkService.enableBenchmarkForOrg(
        testOrgId,
        customBenchmarkId,
        'custom',
        orgAdminUserId
      );

      expect(enabled).toBeDefined();
      expect(enabled.benchmarkType).toBe('custom');
      expect(enabled.isEnabled).toBe(true);
    });

    // Cycle 14: disableBenchmarkForOrg() requires org admin OR site admin
    it('should throw error if regular user tries to disable benchmark', async () => {
      // Enable it first
      await storage.enableBenchmarkForOrg(testOrgId, siteBenchmarkId, 'site');

      await expect(
        benchmarkService.disableBenchmarkForOrg(testOrgId, siteBenchmarkId, 'site', regularUserId)
      ).rejects.toThrow('Unauthorized');
    });

    it('should allow org admin to disable benchmark for their org', async () => {
      // Enable it first
      await storage.enableBenchmarkForOrg(testOrgId, siteBenchmarkId, 'site');

      const disabled = await benchmarkService.disableBenchmarkForOrg(
        testOrgId,
        siteBenchmarkId,
        'site',
        orgAdminUserId
      );

      expect(disabled).toBeDefined();
      expect(disabled.isEnabled).toBe(false);
    });

    it('should allow site admin to disable benchmark for any org', async () => {
      // Enable it first
      await storage.enableBenchmarkForOrg(testOrgId, customBenchmarkId, 'custom');

      const disabled = await benchmarkService.disableBenchmarkForOrg(
        testOrgId,
        customBenchmarkId,
        'custom',
        siteAdminUserId
      );

      expect(disabled).toBeDefined();
      expect(disabled.isEnabled).toBe(false);
    });
  });

  describe('Evaluation Logic', () => {
    // Cycle 15: evaluateBenchmark() returns true for met 'lte' benchmark
    it('should return true when athlete value meets lte benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(0.95, 1.00, 'lte');
      expect(result).toBe(true);
    });

    it('should return false when athlete value does not meet lte benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(1.05, 1.00, 'lte');
      expect(result).toBe(false);
    });

    it('should return true when athlete value equals lte benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(1.00, 1.00, 'lte');
      expect(result).toBe(true);
    });

    // Cycle 16: evaluateBenchmark() returns true for met 'gte' benchmark
    it('should return true when athlete value meets gte benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(35, 30, 'gte');
      expect(result).toBe(true);
    });

    it('should return false when athlete value does not meet gte benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(25, 30, 'gte');
      expect(result).toBe(false);
    });

    it('should return true when athlete value equals gte benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(30, 30, 'gte');
      expect(result).toBe(true);
    });

    // Cycle 17: evaluateBenchmark() handles 'eq' operator
    it('should return true when athlete value equals eq benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(100, 100, 'eq');
      expect(result).toBe(true);
    });

    it('should return false when athlete value does not equal eq benchmark', () => {
      const result = benchmarkService.evaluateBenchmark(99, 100, 'eq');
      expect(result).toBe(false);
    });

    it('should throw error for invalid comparison operator', () => {
      expect(() => {
        benchmarkService.evaluateBenchmark(100, 100, 'invalid' as any);
      }).toThrow('Invalid comparison operator');
    });

    // Cycle 18: getBenchmarkProgress() calculates percentage correctly
    it('should calculate progress percentage for lte benchmark (lower is better)', () => {
      // Benchmark: 1.00, Athlete: 0.90 (10% better)
      const progress = benchmarkService.getBenchmarkProgress(0.90, 1.00, 'lte');
      expect(progress).toBeCloseTo(111.11, 1); // 111.11% of goal (11.11% better than target)
    });

    it('should calculate progress percentage for gte benchmark (higher is better)', () => {
      // Benchmark: 30 inches, Athlete: 33 inches (10% better)
      const progress = benchmarkService.getBenchmarkProgress(33, 30, 'gte');
      expect(progress).toBeCloseTo(110, 1); // 110% of goal
    });

    it('should return 100 for exactly meeting benchmark', () => {
      const progressLte = benchmarkService.getBenchmarkProgress(1.00, 1.00, 'lte');
      const progressGte = benchmarkService.getBenchmarkProgress(30, 30, 'gte');
      expect(progressLte).toBe(100);
      expect(progressGte).toBe(100);
    });

    it('should return percentage below 100 for not meeting benchmark', () => {
      // Benchmark: 1.00, Athlete: 1.10 (10% worse)
      const progress = benchmarkService.getBenchmarkProgress(1.10, 1.00, 'lte');
      expect(progress).toBeCloseTo(90.9, 1); // ~90.9% of goal
    });

    it('should handle eq operator for progress calculation', () => {
      const progressMet = benchmarkService.getBenchmarkProgress(100, 100, 'eq');
      const progressNotMet = benchmarkService.getBenchmarkProgress(95, 100, 'eq');
      expect(progressMet).toBe(100);
      expect(progressNotMet).toBe(0);
    });

    // Cycle 19: getAthleteBenchmarkStatus() returns met/unmet for all applicable benchmarks
    it('should return benchmark status for athlete with met benchmarks', async () => {
      // Create a site benchmark for FLY10_TIME with lte operator
      const benchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Elite Speed Benchmark',
        benchmarkValue: 1.00,
        comparisonOperator: 'lte',
      }, siteAdminUserId);
      createdBenchmarkIds.push(benchmark.id);

      // Enable benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'site');

      // Create athlete with birth year for age calculation
      const [athlete] = await db.insert(users).values({
        username: `athlete${Date.now()}`,
        emails: ['athlete@example.com'],
        password: 'hashedpassword',
        firstName: 'Fast',
        lastName: 'Athlete',
        fullName: 'Fast Athlete',
        isSiteAdmin: false,
        birthYear: 2000,
      }).returning();

      // Add athlete to org
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');

      // Create measurement that meets benchmark (0.95 <= 1.00)
      const measurement = await storage.createMeasurement({
        userId: athlete.id,
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        metric: testMetricCode,
        value: 0.95,
      }, siteAdminUserId);

      const status = await benchmarkService.getAthleteBenchmarkStatus(athlete.id, testOrgId);

      expect(status).toBeDefined();
      expect(status.length).toBeGreaterThan(0);
      const benchmarkStatus = status.find(s => s.benchmarkId === benchmark.id);
      expect(benchmarkStatus).toBeDefined();
      expect(benchmarkStatus?.isMet).toBe(true);
      expect(benchmarkStatus?.athleteValue).toBe(0.95);
      expect(benchmarkStatus?.progress).toBeGreaterThanOrEqual(100);

      // Cleanup - delete in correct order
      await db.delete(measurements).where(eq(measurements.userId, athlete.id));
      await storage.removeUserFromOrganization(athlete.id, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athlete.id));
    });

    it('should return benchmark status with unmet benchmarks', async () => {
      // Create a site benchmark for FLY10_TIME with lte operator
      const benchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Very Elite Speed',
        benchmarkValue: 0.85,
        comparisonOperator: 'lte',
      }, siteAdminUserId);
      createdBenchmarkIds.push(benchmark.id);

      // Enable benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'site');

      // Create athlete with birth year
      const [athlete] = await db.insert(users).values({
        username: `athleteslow${Date.now()}`,
        emails: ['athleteslow@example.com'],
        password: 'hashedpassword',
        firstName: 'Slow',
        lastName: 'Athlete',
        fullName: 'Slow Athlete',
        isSiteAdmin: false,
        birthYear: 2000,
      }).returning();

      // Add athlete to org
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');

      // Create measurement that does NOT meet benchmark (1.00 > 0.85)
      const measurement = await storage.createMeasurement({
        userId: athlete.id,
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        metric: testMetricCode,
        value: 1.00,
      }, siteAdminUserId);

      const status = await benchmarkService.getAthleteBenchmarkStatus(athlete.id, testOrgId);

      expect(status).toBeDefined();
      expect(status.length).toBeGreaterThan(0);
      const benchmarkStatus = status.find(s => s.benchmarkId === benchmark.id);
      expect(benchmarkStatus).toBeDefined();
      expect(benchmarkStatus?.isMet).toBe(false);
      expect(benchmarkStatus?.athleteValue).toBe(1.00);
      expect(benchmarkStatus?.progress).toBeLessThan(100);

      // Cleanup - delete in correct order
      await db.delete(measurements).where(eq(measurements.userId, athlete.id));
      await storage.removeUserFromOrganization(athlete.id, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athlete.id));
    });

    it('should only return benchmarks applicable to athlete filters', async () => {
      // Create benchmark with age filter (ageMin: 18, ageMax: 22)
      const benchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'College Age Benchmark',
        benchmarkValue: 1.00,
        comparisonOperator: 'lte',
        ageMin: 18,
        ageMax: 22,
      }, siteAdminUserId);
      createdBenchmarkIds.push(benchmark.id);

      // Enable benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'site');

      // Create athlete with age outside filter (age 25, birthDate format)
      const [athlete] = await db.insert(users).values({
        username: `athleteold${Date.now()}`,
        emails: ['athleteold@example.com'],
        password: 'hashedpassword',
        firstName: 'Old',
        lastName: 'Athlete',
        fullName: 'Old Athlete',
        isSiteAdmin: false,
        birthDate: '1999-01-01', // ~25 years old (string format, not Date object)
      }).returning();

      // Add athlete to org
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');

      const status = await benchmarkService.getAthleteBenchmarkStatus(athlete.id, testOrgId);

      // Should not include the age-filtered benchmark
      const benchmarkStatus = status.find(s => s.benchmarkId === benchmark.id);
      expect(benchmarkStatus).toBeUndefined();

      // Cleanup - delete in correct order
      await storage.removeUserFromOrganization(athlete.id, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athlete.id));
    });
  });

  describe('Range-Based Evaluation Logic', () => {
    // Cycle 20: evaluateRangeBenchmark() returns true when athlete value is within range
    it('should return true when athlete value is within range (inclusive)', () => {
      // Range: 25-30 inches, Athlete: 27 inches
      const result = benchmarkService.evaluateRangeBenchmark(27, 25, 30);
      expect(result).toBe(true);
    });

    it('should return true when athlete value equals minValue', () => {
      const result = benchmarkService.evaluateRangeBenchmark(25, 25, 30);
      expect(result).toBe(true);
    });

    it('should return true when athlete value equals maxValue', () => {
      const result = benchmarkService.evaluateRangeBenchmark(30, 25, 30);
      expect(result).toBe(true);
    });

    it('should return false when athlete value is below minValue', () => {
      const result = benchmarkService.evaluateRangeBenchmark(24, 25, 30);
      expect(result).toBe(false);
    });

    it('should return false when athlete value is above maxValue', () => {
      const result = benchmarkService.evaluateRangeBenchmark(31, 25, 30);
      expect(result).toBe(false);
    });

    // Cycle 21: getRangeBenchmarkProgress() calculates percentage correctly
    it('should return 100% when athlete value is within range', () => {
      // Within range = 100% (meets benchmark)
      const progress = benchmarkService.getRangeBenchmarkProgress(27, 25, 30);
      expect(progress).toBe(100);
    });

    it('should return < 100% when athlete value is below range', () => {
      // Below range: calculate how far below minValue
      // If minValue=25 and athlete=20, they're 5 units away from 25
      // Progress = (20/25) * 100 = 80%
      const progress = benchmarkService.getRangeBenchmarkProgress(20, 25, 30);
      expect(progress).toBeCloseTo(80, 1);
    });

    it('should return < 100% when athlete value is above range', () => {
      // Above range: calculate how far above maxValue
      // If maxValue=30 and athlete=35, they're 5 units over
      // Progress = 100 - ((35-30)/30 * 100) = 100 - 16.67 = 83.33%
      const progress = benchmarkService.getRangeBenchmarkProgress(35, 25, 30);
      expect(progress).toBeCloseTo(83.33, 1);
    });

    it('should return 100% when athlete exactly hits minValue', () => {
      const progress = benchmarkService.getRangeBenchmarkProgress(25, 25, 30);
      expect(progress).toBe(100);
    });

    it('should return 100% when athlete exactly hits maxValue', () => {
      const progress = benchmarkService.getRangeBenchmarkProgress(30, 25, 30);
      expect(progress).toBe(100);
    });

    it('should handle zero values correctly', () => {
      // Range: 0-10, Athlete: 5
      const progress = benchmarkService.getRangeBenchmarkProgress(5, 0, 10);
      expect(progress).toBe(100);
    });

    it('should handle negative ranges correctly', () => {
      // Range: -10 to -5, Athlete: -7
      const progress = benchmarkService.getRangeBenchmarkProgress(-7, -10, -5);
      expect(progress).toBe(100);
    });

    // Edge case: single point range (min === max)
    it('should handle single point range (min === max)', () => {
      // Range: 25 to 25, Athlete: 25 - should be 100%
      const progressExact = benchmarkService.getRangeBenchmarkProgress(25, 25, 25);
      expect(progressExact).toBe(100);

      // Range: 25 to 25, Athlete: 24 - should be less than 100%
      const progressBelow = benchmarkService.getRangeBenchmarkProgress(24, 25, 25);
      expect(progressBelow).toBeLessThan(100);

      // Range: 25 to 25, Athlete: 26 - should be less than 100%
      const progressAbove = benchmarkService.getRangeBenchmarkProgress(26, 25, 25);
      expect(progressAbove).toBeLessThan(100);
    });

    // Edge case: NaN and Infinity inputs
    it('should return 0 for NaN inputs', () => {
      expect(benchmarkService.getRangeBenchmarkProgress(NaN, 25, 30)).toBe(0);
      expect(benchmarkService.getRangeBenchmarkProgress(27, NaN, 30)).toBe(0);
      expect(benchmarkService.getRangeBenchmarkProgress(27, 25, NaN)).toBe(0);
    });

    it('should return 0 for Infinity inputs', () => {
      expect(benchmarkService.getRangeBenchmarkProgress(Infinity, 25, 30)).toBe(0);
      expect(benchmarkService.getRangeBenchmarkProgress(27, Infinity, 30)).toBe(0);
      expect(benchmarkService.getRangeBenchmarkProgress(27, 25, Infinity)).toBe(0);
      expect(benchmarkService.getRangeBenchmarkProgress(-Infinity, 25, 30)).toBe(0);
    });

    // Edge case: extreme deviations from range
    it('should clamp progress for extreme values below range', () => {
      // Athlete at 1 when min is 1000000 - should be clamped between 0-100
      const progress = benchmarkService.getRangeBenchmarkProgress(1, 1000000, 2000000);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    });

    it('should clamp progress for extreme values above range', () => {
      // Athlete at 1000000 when max is 30 - should not go below 0%
      const progress = benchmarkService.getRangeBenchmarkProgress(1000000, 25, 30);
      expect(progress).toBeGreaterThanOrEqual(0);
    });

    // Cycle 22: getAthleteBenchmarkStatus() correctly evaluates range-based benchmarks
    it('should return benchmark status for range-based benchmarks (athlete within range)', async () => {
      // Create a site benchmark with range (minValue: 25, maxValue: 30 inches for vertical jump)
      const benchmark = await storage.createSiteBenchmark({
        metricCode: 'VERTICAL_JUMP',
        name: 'Acceptable Vertical Jump Range',
        benchmarkValue: null, // No single value for range benchmarks
        minValue: 25,
        maxValue: 30,
        comparisonOperator: 'range',
      }, siteAdminUserId);
      createdBenchmarkIds.push(benchmark.id);

      // Enable benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'site');

      // Create athlete
      const [athlete] = await db.insert(users).values({
        username: `athlete_range${Date.now()}`,
        emails: ['athlete_range@example.com'],
        password: 'hashedpassword',
        firstName: 'Range',
        lastName: 'Athlete',
        fullName: 'Range Athlete',
        isSiteAdmin: false,
        birthYear: 2000,
      }).returning();

      // Add athlete to org
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');

      // Create measurement within range (27 inches)
      const measurement = await storage.createMeasurement({
        userId: athlete.id,
        date: new Date().toISOString().split('T')[0],
        metric: 'VERTICAL_JUMP',
        value: 27,
      }, siteAdminUserId);

      const status = await benchmarkService.getAthleteBenchmarkStatus(athlete.id, testOrgId);

      expect(status).toBeDefined();
      const benchmarkStatus = status.find(s => s.benchmarkId === benchmark.id);
      expect(benchmarkStatus).toBeDefined();
      expect(benchmarkStatus?.isMet).toBe(true);
      expect(benchmarkStatus?.athleteValue).toBe(27);
      expect(benchmarkStatus?.progress).toBe(100);

      // Cleanup
      await db.delete(measurements).where(eq(measurements.userId, athlete.id));
      await storage.removeUserFromOrganization(athlete.id, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athlete.id));
    });

    it('should return benchmark status for range-based benchmarks (athlete below range)', async () => {
      // Create a site benchmark with range
      const benchmark = await storage.createSiteBenchmark({
        metricCode: 'VERTICAL_JUMP',
        name: 'Vertical Jump Range Below Test',
        benchmarkValue: null,
        minValue: 25,
        maxValue: 30,
        comparisonOperator: 'range',
      }, siteAdminUserId);
      createdBenchmarkIds.push(benchmark.id);

      // Enable benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'site');

      // Create athlete
      const [athlete] = await db.insert(users).values({
        username: `athlete_below_range${Date.now()}`,
        emails: ['athlete_below_range@example.com'],
        password: 'hashedpassword',
        firstName: 'Below',
        lastName: 'Range',
        fullName: 'Below Range',
        isSiteAdmin: false,
        birthYear: 2000,
      }).returning();

      // Add athlete to org
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');

      // Create measurement below range (20 inches)
      const measurement = await storage.createMeasurement({
        userId: athlete.id,
        date: new Date().toISOString().split('T')[0],
        metric: 'VERTICAL_JUMP',
        value: 20,
      }, siteAdminUserId);

      const status = await benchmarkService.getAthleteBenchmarkStatus(athlete.id, testOrgId);

      expect(status).toBeDefined();
      const benchmarkStatus = status.find(s => s.benchmarkId === benchmark.id);
      expect(benchmarkStatus).toBeDefined();
      expect(benchmarkStatus?.isMet).toBe(false);
      expect(benchmarkStatus?.athleteValue).toBe(20);
      expect(benchmarkStatus?.progress).toBeLessThan(100);

      // Cleanup
      await db.delete(measurements).where(eq(measurements.userId, athlete.id));
      await storage.removeUserFromOrganization(athlete.id, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athlete.id));
    });

    it('should return benchmark status for range-based benchmarks (athlete above range)', async () => {
      // Create a site benchmark with range
      const benchmark = await storage.createSiteBenchmark({
        metricCode: 'VERTICAL_JUMP',
        name: 'Vertical Jump Range Above Test',
        benchmarkValue: null,
        minValue: 25,
        maxValue: 30,
        comparisonOperator: 'range',
      }, siteAdminUserId);
      createdBenchmarkIds.push(benchmark.id);

      // Enable benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'site');

      // Create athlete
      const [athlete] = await db.insert(users).values({
        username: `athlete_above_range${Date.now()}`,
        emails: ['athlete_above_range@example.com'],
        password: 'hashedpassword',
        firstName: 'Above',
        lastName: 'Range',
        fullName: 'Above Range',
        isSiteAdmin: false,
        birthYear: 2000,
      }).returning();

      // Add athlete to org
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');

      // Create measurement above range (35 inches)
      const measurement = await storage.createMeasurement({
        userId: athlete.id,
        date: new Date().toISOString().split('T')[0],
        metric: 'VERTICAL_JUMP',
        value: 35,
      }, siteAdminUserId);

      const status = await benchmarkService.getAthleteBenchmarkStatus(athlete.id, testOrgId);

      expect(status).toBeDefined();
      const benchmarkStatus = status.find(s => s.benchmarkId === benchmark.id);
      expect(benchmarkStatus).toBeDefined();
      expect(benchmarkStatus?.isMet).toBe(false);
      expect(benchmarkStatus?.athleteValue).toBe(35);
      expect(benchmarkStatus?.progress).toBeLessThan(100);

      // Cleanup
      await db.delete(measurements).where(eq(measurements.userId, athlete.id));
      await storage.removeUserFromOrganization(athlete.id, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athlete.id));
    });
  });

  describe('Tier Benchmark Evaluation', () => {
    // Test tier evaluation logic
    it('should identify correct tier for athlete value within range', () => {
      const tiers = [
        { minValue: 4.2, maxValue: 4.4, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        { minValue: 4.4, maxValue: 4.6, tierName: 'Excellent', tierColor: 'silver', tierOrder: 2 },
        { minValue: 4.6, maxValue: 4.8, tierName: 'Good', tierColor: 'bronze', tierOrder: 3 },
      ];

      // Athlete value within "Excellent" tier
      const result = benchmarkService.evaluateTierBenchmark(4.5, tiers, true);

      expect(result.tierName).toBe('Excellent');
      expect(result.tierColor).toBe('silver');
      expect(result.tierOrder).toBe(2);
    });

    it('should calculate distance to next tier (lower-is-better metric)', () => {
      const tiers = [
        { minValue: 4.2, maxValue: 4.4, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        { minValue: 4.4, maxValue: 4.6, tierName: 'Excellent', tierColor: 'silver', tierOrder: 2 },
        { minValue: 4.6, maxValue: 4.8, tierName: 'Good', tierColor: 'bronze', tierOrder: 3 },
      ];

      // Athlete at 4.5 (in Excellent tier), needs to reach 4.4 to enter Elite
      const result = benchmarkService.evaluateTierBenchmark(4.5, tiers, true);

      expect(result.nextTierName).toBe('Elite');
      expect(result.distanceToNextTier).toBeCloseTo(0.1, 2); // 4.5 - 4.4 = 0.1
    });

    it('should calculate distance to next tier (higher-is-better metric)', () => {
      const tiers = [
        { minValue: 30, maxValue: 35, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        { minValue: 25, maxValue: 30, tierName: 'Excellent', tierColor: 'silver', tierOrder: 2 },
        { minValue: 20, maxValue: 25, tierName: 'Good', tierColor: 'bronze', tierOrder: 3 },
      ];

      // Athlete at 27 (in Excellent tier), needs to reach 30 to enter Elite
      const result = benchmarkService.evaluateTierBenchmark(27, tiers, false);

      expect(result.nextTierName).toBe('Elite');
      expect(result.distanceToNextTier).toBeCloseTo(3, 2); // 30 - 27 = 3
    });

    it('should handle value at tier boundary', () => {
      const tiers = [
        { minValue: 4.2, maxValue: 4.4, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        { minValue: 4.4, maxValue: 4.6, tierName: 'Excellent', tierColor: 'silver', tierOrder: 2 },
      ];

      // Athlete exactly at boundary (4.4) - should be in Excellent tier
      const result = benchmarkService.evaluateTierBenchmark(4.4, tiers, true);

      expect(result.tierName).toBe('Excellent');
      expect(result.tierOrder).toBe(2);
    });

    it('should return null nextTier when at best tier', () => {
      const tiers = [
        { minValue: 4.2, maxValue: 4.4, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        { minValue: 4.4, maxValue: 4.6, tierName: 'Excellent', tierColor: 'silver', tierOrder: 2 },
      ];

      // Athlete at 4.3 (in Elite tier - best tier)
      const result = benchmarkService.evaluateTierBenchmark(4.3, tiers, true);

      expect(result.tierName).toBe('Elite');
      expect(result.nextTierName).toBeNull();
      expect(result.distanceToNextTier).toBeNull();
    });

    it('should handle value below all tiers', () => {
      const tiers = [
        { minValue: 4.2, maxValue: 4.4, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        { minValue: 4.4, maxValue: 4.6, tierName: 'Excellent', tierColor: 'silver', tierOrder: 2 },
        { minValue: 4.6, maxValue: 4.8, tierName: 'Good', tierColor: 'bronze', tierOrder: 3 },
      ];

      // Athlete at 5.0 (below all tiers for lower-is-better)
      const result = benchmarkService.evaluateTierBenchmark(5.0, tiers, true);

      expect(result.tierName).toBeNull();
      expect(result.tierOrder).toBeNull();
      expect(result.nextTierName).toBe('Good'); // Closest tier to enter
      expect(result.distanceToNextTier).toBeCloseTo(0.2, 2); // 5.0 - 4.8 = 0.2
    });

    it('should handle gaps between tier ranges', () => {
      const tiers = [
        { minValue: 4.2, maxValue: 4.4, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        // GAP: 4.4 to 4.5
        { minValue: 4.5, maxValue: 4.7, tierName: 'Good', tierColor: 'bronze', tierOrder: 2 },
      ];

      // Athlete at 4.45 (falls in gap between tiers)
      const result = benchmarkService.evaluateTierBenchmark(4.45, tiers, true);

      expect(result.tierName).toBeNull(); // Not in any tier
      expect(result.nextTierName).toBe('Elite'); // Next best tier to reach
      expect(result.distanceToNextTier).toBeCloseTo(0.05, 2); // 4.45 - 4.4 = 0.05
    });

    it('should handle value above all tiers (higher-is-better)', () => {
      const tiers = [
        { minValue: 30, maxValue: 35, tierName: 'Elite', tierColor: 'gold', tierOrder: 1 },
        { minValue: 25, maxValue: 30, tierName: 'Good', tierColor: 'bronze', tierOrder: 2 },
      ];

      // Athlete at 36 (above all tiers for higher-is-better) - already exceeds best tier
      const result = benchmarkService.evaluateTierBenchmark(36, tiers, false);

      expect(result.tierName).toBeNull(); // Above all defined tiers
      expect(result.nextTierName).toBeNull(); // No next tier when already exceeding
      expect(result.distanceToNextTier).toBeNull();
    });
  });
});
