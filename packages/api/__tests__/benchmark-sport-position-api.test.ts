/**
 * API Layer Tests for Benchmark Sport and Position Filtering
 *
 * Tests the storage layer (which the API routes use) for sport/position fields.
 * Validates that:
 * - Storage methods accept sport and position fields
 * - Storage methods return sport and position in responses
 * - Validation is enforced at the schema level (tested in shared tests)
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { storage } from '../storage';
import { db } from '../db';
import { siteBenchmarks, customBenchmarks, organizations, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('Benchmark Sport/Position Storage API', () => {
  let testOrgId: string;
  let siteAdminUserId: string;
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
    createdBenchmarkIds = [];
    uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org Sport Position ${uniqueSuffix}`,
      description: 'Test organization for sport/position tests',
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

    // Use existing metric
    testMetricCode = 'FLY10_TIME';
  });

  afterEach(async () => {
    // Clean up created benchmarks
    for (const id of createdBenchmarkIds) {
      try {
        await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, id));
      } catch (error) {
        // Ignore errors (benchmark might not exist)
      }
      try {
        await db.delete(customBenchmarks).where(eq(customBenchmarks.id, id));
      } catch (error) {
        // Ignore errors
      }
    }

    // Clean up test organization and users (cascades)
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(users).where(eq(users.id, siteAdminUserId));
  });

  describe('Site Benchmarks with Sport/Position', () => {
    it('should create site benchmark with sport only', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: `Soccer Speed Benchmark ${uniqueSuffix}`,
        description: 'Speed benchmark for soccer players',
        benchmarkValue: 1.5,
        comparisonOperator: 'lte' as const,
        sport: 'SOCCER',
      };

      const created = await storage.createSiteBenchmark(benchmarkData, siteAdminUserId);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.sport).toBe('SOCCER');
      expect(created.position).toBeNull();

      createdBenchmarkIds.push(created.id);
    });

    it('should create site benchmark with sport and position', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: `Soccer Forward Speed ${uniqueSuffix}`,
        description: 'Speed benchmark for soccer forwards',
        benchmarkValue: 1.4,
        comparisonOperator: 'lte' as const,
        sport: 'SOCCER',
        position: 'Forward',
      };

      const created = await storage.createSiteBenchmark(benchmarkData, siteAdminUserId);

      expect(created).toBeDefined();
      expect(created.sport).toBe('SOCCER');
      expect(created.position).toBe('Forward');

      createdBenchmarkIds.push(created.id);
    });

    it('should create site benchmark without sport or position (both optional)', async () => {
      const benchmarkData = {
        metricCode: testMetricCode,
        name: `General Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.5,
        comparisonOperator: 'lte' as const,
      };

      const created = await storage.createSiteBenchmark(benchmarkData, siteAdminUserId);

      expect(created.sport).toBeNull();
      expect(created.position).toBeNull();

      createdBenchmarkIds.push(created.id);
    });

    it('should update site benchmark to add sport', async () => {
      // Create benchmark without sport
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Original Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.5,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Update to add sport
      const updated = await storage.updateSiteBenchmark(created.id, {
        sport: 'BASKETBALL',
      });

      expect(updated.sport).toBe('BASKETBALL');
      expect(updated.position).toBeNull();
    });

    it('should update site benchmark to add sport and position', async () => {
      // Create benchmark without sport/position
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Original Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.5,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Update to add sport and position
      const updated = await storage.updateSiteBenchmark(created.id, {
        sport: 'FOOTBALL',
        position: 'Quarterback',
      });

      expect(updated.sport).toBe('FOOTBALL');
      expect(updated.position).toBe('Quarterback');
    });

    it('should allow clearing sport and position', async () => {
      // Create benchmark with sport and position
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Specific Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.5,
        sport: 'BASEBALL',
        position: 'Pitcher',
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Clear sport and position
      const updated = await storage.updateSiteBenchmark(created.id, {
        sport: null,
        position: null,
      });

      expect(updated.sport).toBeNull();
      expect(updated.position).toBeNull();
    });

    it('should retrieve benchmark with sport and position fields', async () => {
      // Create benchmark with sport and position
      const created = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Basketball Guard Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.5,
        sport: 'BASKETBALL',
        position: 'Point Guard',
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Retrieve it
      const fetched = await storage.getSiteBenchmark(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.sport).toBe('BASKETBALL');
      expect(fetched?.position).toBe('Point Guard');
    });

    it('should list benchmarks with sport and position in results', async () => {
      // Create multiple benchmarks with different sport/position combos
      const created1 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Soccer Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.5,
        sport: 'SOCCER',
      }, siteAdminUserId);
      createdBenchmarkIds.push(created1.id);

      const created2 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Basketball Forward ${uniqueSuffix}`,
        benchmarkValue: 1.4,
        sport: 'BASKETBALL',
        position: 'Forward',
      }, siteAdminUserId);
      createdBenchmarkIds.push(created2.id);

      // List all benchmarks
      const allBenchmarks = await storage.getSiteBenchmarks({ includeInactive: true });

      const soccer = allBenchmarks.find(b => b.id === created1.id);
      const basketball = allBenchmarks.find(b => b.id === created2.id);

      expect(soccer).toBeDefined();
      expect(soccer?.sport).toBe('SOCCER');
      expect(soccer?.position).toBeNull();

      expect(basketball).toBeDefined();
      expect(basketball?.sport).toBe('BASKETBALL');
      expect(basketball?.position).toBe('Forward');
    });
  });

  describe('Custom Benchmarks with Sport/Position', () => {
    it('should create custom benchmark with sport only', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: `Custom Soccer Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.6,
        comparisonOperator: 'lte' as const,
        sport: 'SOCCER',
      };

      const created = await storage.createCustomBenchmark(benchmarkData, siteAdminUserId);

      expect(created.sport).toBe('SOCCER');
      expect(created.position).toBeNull();
      expect(created.organizationId).toBe(testOrgId);

      createdBenchmarkIds.push(created.id);
    });

    it('should create custom benchmark with sport and position', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: `Custom Forward Benchmark ${uniqueSuffix}`,
        benchmarkValue: 1.4,
        comparisonOperator: 'lte' as const,
        sport: 'SOCCER',
        position: 'Forward',
      };

      const created = await storage.createCustomBenchmark(benchmarkData, siteAdminUserId);

      expect(created.sport).toBe('SOCCER');
      expect(created.position).toBe('Forward');

      createdBenchmarkIds.push(created.id);
    });

    it('should retrieve custom benchmark with sport and position', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: `Custom Test ${uniqueSuffix}`,
        benchmarkValue: 1.5,
        sport: 'FOOTBALL',
        position: 'Linebacker',
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // List custom benchmarks for org
      const customBenchmarks = await storage.getCustomBenchmarksForOrg(testOrgId);
      const found = customBenchmarks.find(b => b.id === created.id);

      expect(found).toBeDefined();
      expect(found?.sport).toBe('FOOTBALL');
      expect(found?.position).toBe('Linebacker');
    });
  });

  describe('Filtering by Sport/Position', () => {
    it('should filter applicable benchmarks by sport', async () => {
      // Create benchmarks with different sports
      const soccerBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Soccer Speed ${uniqueSuffix}`,
        benchmarkValue: 1.5,
        sport: 'SOCCER',
      }, siteAdminUserId);
      createdBenchmarkIds.push(soccerBenchmark.id);

      const basketballBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Basketball Speed ${uniqueSuffix}`,
        benchmarkValue: 1.4,
        sport: 'BASKETBALL',
      }, siteAdminUserId);
      createdBenchmarkIds.push(basketballBenchmark.id);

      const anySportBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Any Sport ${uniqueSuffix}`,
        benchmarkValue: 1.6,
        // sport: null (applies to all sports)
      }, siteAdminUserId);
      createdBenchmarkIds.push(anySportBenchmark.id);

      // Enable all benchmarks for org
      await storage.enableBenchmarkForOrg(testOrgId, soccerBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, basketballBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, anySportBenchmark.id, 'site');

      // Get applicable benchmarks for soccer athlete
      const applicable = await storage.getApplicableBenchmarks(testOrgId, testMetricCode, {
        sport: 'SOCCER',
      });

      // Should return soccer-specific and any-sport benchmarks, but NOT basketball
      const soccerFound = applicable.find(b => b.id === soccerBenchmark.id);
      const anyFound = applicable.find(b => b.id === anySportBenchmark.id);
      const basketballFound = applicable.find(b => b.id === basketballBenchmark.id);

      expect(soccerFound).toBeDefined();
      expect(anyFound).toBeDefined();
      expect(basketballFound).toBeUndefined();
    });

    it('should filter applicable benchmarks by position within sport', async () => {
      // Create benchmarks with different positions within SOCCER
      const forwardBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Soccer Forward ${uniqueSuffix}`,
        benchmarkValue: 1.4,
        sport: 'SOCCER',
        position: 'Forward',
      }, siteAdminUserId);
      createdBenchmarkIds.push(forwardBenchmark.id);

      const defenderBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Soccer Defender ${uniqueSuffix}`,
        benchmarkValue: 1.6,
        sport: 'SOCCER',
        position: 'Defender',
      }, siteAdminUserId);
      createdBenchmarkIds.push(defenderBenchmark.id);

      const anyPositionBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: `Soccer All Positions ${uniqueSuffix}`,
        benchmarkValue: 1.5,
        sport: 'SOCCER',
        // position: null (applies to all positions within soccer)
      }, siteAdminUserId);
      createdBenchmarkIds.push(anyPositionBenchmark.id);

      // Enable all benchmarks
      await storage.enableBenchmarkForOrg(testOrgId, forwardBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, defenderBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, anyPositionBenchmark.id, 'site');

      // Get applicable benchmarks for soccer forward
      const applicable = await storage.getApplicableBenchmarks(testOrgId, testMetricCode, {
        sport: 'SOCCER',
        position: 'Forward',
      });

      // Should return forward-specific, any-position soccer, but NOT defender
      const forwardFound = applicable.find(b => b.id === forwardBenchmark.id);
      const anyFound = applicable.find(b => b.id === anyPositionBenchmark.id);
      const defenderFound = applicable.find(b => b.id === defenderBenchmark.id);

      expect(forwardFound).toBeDefined();
      expect(anyFound).toBeDefined();
      expect(defenderFound).toBeUndefined();
    });
  });
});
