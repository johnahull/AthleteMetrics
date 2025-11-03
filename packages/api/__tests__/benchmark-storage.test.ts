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
  });
});
