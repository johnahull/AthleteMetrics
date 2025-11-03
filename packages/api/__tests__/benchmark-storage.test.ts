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

  describe('Custom Benchmarks CRUD', () => {
    // Cycle 7: createCustomBenchmark() inserts with organization_id
    it('should create a custom benchmark with organization_id', async () => {
      const benchmarkData = {
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Team Custom Benchmark',
        description: 'Custom benchmark for our team',
        benchmarkValue: 1.20,
        comparisonOperator: 'lte' as const,
      };

      const created = await storage.createCustomBenchmark(benchmarkData, siteAdminUserId);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.organizationId).toBe(testOrgId);
      expect(created.metricCode).toBe(testMetricCode);
      expect(created.name).toBe('Team Custom Benchmark');
      expect(created.benchmarkValue).toBe('1.200');

      createdBenchmarkIds.push(created.id);
    });

    // Cycle 8: getCustomBenchmarksForOrg() returns only that org's benchmarks
    it('should get custom benchmarks for specific organization', async () => {
      const created1 = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Org 1 Benchmark',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created1.id);

      // Create another org and benchmark
      const [org2] = await db.insert(organizations).values({
        name: `Other Org ${Date.now()}`,
      }).returning();

      const created2 = await storage.createCustomBenchmark({
        organizationId: org2.id,
        metricCode: testMetricCode,
        name: 'Org 2 Benchmark',
        benchmarkValue: 1.50,
      }, siteAdminUserId);

      const org1Benchmarks = await storage.getCustomBenchmarksForOrg(testOrgId);
      const org2Benchmarks = await storage.getCustomBenchmarksForOrg(org2.id);

      // Clean up
      await db.delete(customBenchmarks).where(eq(customBenchmarks.id, created2.id));
      await db.delete(organizations).where(eq(organizations.id, org2.id));

      expect(org1Benchmarks.some(b => b.id === created1.id)).toBe(true);
      expect(org1Benchmarks.some(b => b.id === created2.id)).toBe(false);
      expect(org2Benchmarks.some(b => b.id === created2.id)).toBe(true);
      expect(org2Benchmarks.some(b => b.id === created1.id)).toBe(false);
    });

    // Cycle 9: Verify isolation - org benchmarks don't leak to other orgs
    it('should NOT return other organization benchmarks', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Private Benchmark',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Create another org
      const [otherOrg] = await db.insert(organizations).values({
        name: `Isolated Org ${Date.now()}`,
      }).returning();

      const otherOrgBenchmarks = await storage.getCustomBenchmarksForOrg(otherOrg.id);

      // Clean up
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));

      expect(otherOrgBenchmarks.some(b => b.id === created.id)).toBe(false);
    });

    // Cycle 10: updateCustomBenchmark() only updates if org_id matches
    it('should update custom benchmark for correct organization', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Original Custom',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      const updated = await storage.updateCustomBenchmark(testOrgId, created.id, {
        name: 'Updated Custom',
        benchmarkValue: 2.00,
      });

      expect(updated.name).toBe('Updated Custom');
      expect(updated.benchmarkValue).toBe('2.000');
    });

    it('should not update custom benchmark for wrong organization', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Protected Benchmark',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Create another org
      const [otherOrg] = await db.insert(organizations).values({
        name: `Wrong Org ${Date.now()}`,
      }).returning();

      await expect(
        storage.updateCustomBenchmark(otherOrg.id, created.id, { name: 'Hacked' })
      ).rejects.toThrow('not found');

      // Clean up
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
    });

    // Cycle 11: deleteCustomBenchmark() only deletes if org_id matches
    it('should delete custom benchmark for correct organization', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'To Be Deleted',
        benchmarkValue: 1.00,
      }, siteAdminUserId);

      await storage.deleteCustomBenchmark(testOrgId, created.id);

      const benchmarks = await storage.getCustomBenchmarksForOrg(testOrgId);
      expect(benchmarks.some(b => b.id === created.id)).toBe(false);
    });

    it('should not delete custom benchmark for wrong organization', async () => {
      const created = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Protected from Deletion',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(created.id);

      // Create another org
      const [otherOrg] = await db.insert(organizations).values({
        name: `Unauthorized Org ${Date.now()}`,
      }).returning();

      await expect(
        storage.deleteCustomBenchmark(otherOrg.id, created.id)
      ).rejects.toThrow('not found');

      // Clean up
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));

      // Verify it still exists
      const benchmarks = await storage.getCustomBenchmarksForOrg(testOrgId);
      expect(benchmarks.some(b => b.id === created.id)).toBe(true);
    });
  });

  describe('Organization Benchmarks Enablement', () => {
    // Cycle 12: getOrganizationBenchmarks() returns both site and custom benchmarks
    it('should get all enabled benchmarks for organization (site + custom)', async () => {
      // Create a site benchmark
      const siteBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Site Benchmark',
        benchmarkValue: 1.00,
        isActive: true,
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark.id);

      // Enable site benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark.id, 'site');

      // Create a custom benchmark for org
      const customBenchmark = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Custom Benchmark',
        benchmarkValue: 1.20,
      }, siteAdminUserId);
      createdBenchmarkIds.push(customBenchmark.id);

      // Enable custom benchmark for org
      await storage.enableBenchmarkForOrg(testOrgId, customBenchmark.id, 'custom');

      const orgBenchmarks = await storage.getOrganizationBenchmarks(testOrgId);

      expect(orgBenchmarks.length).toBeGreaterThanOrEqual(2);
      const siteBm = orgBenchmarks.find(b => b.benchmarkId === siteBenchmark.id && b.benchmarkType === 'site');
      const customBm = orgBenchmarks.find(b => b.benchmarkId === customBenchmark.id && b.benchmarkType === 'custom');

      expect(siteBm).toBeDefined();
      expect(siteBm?.isEnabled).toBe(true);
      expect(customBm).toBeDefined();
      expect(customBm?.isEnabled).toBe(true);
    });

    // Cycle 13: enableBenchmarkForOrg() creates organization_benchmarks record
    it('should enable a site benchmark for organization', async () => {
      const siteBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Elite Benchmark',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark.id);

      const enabled = await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark.id, 'site');

      expect(enabled).toBeDefined();
      expect(enabled.organizationId).toBe(testOrgId);
      expect(enabled.benchmarkId).toBe(siteBenchmark.id);
      expect(enabled.benchmarkType).toBe('site');
      expect(enabled.isEnabled).toBe(true);
    });

    it('should enable a custom benchmark for organization', async () => {
      const customBenchmark = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Team Custom',
        benchmarkValue: 1.10,
      }, siteAdminUserId);
      createdBenchmarkIds.push(customBenchmark.id);

      const enabled = await storage.enableBenchmarkForOrg(testOrgId, customBenchmark.id, 'custom');

      expect(enabled.benchmarkType).toBe('custom');
      expect(enabled.isEnabled).toBe(true);
    });

    // Cycle 14: disableBenchmarkForOrg() sets is_enabled to false
    it('should disable a benchmark for organization', async () => {
      const siteBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'To Be Disabled',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark.id);

      // Enable first
      await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark.id, 'site');

      // Then disable
      const disabled = await storage.disableBenchmarkForOrg(testOrgId, siteBenchmark.id, 'site');

      expect(disabled.isEnabled).toBe(false);
      expect(disabled.benchmarkId).toBe(siteBenchmark.id);
    });

    it('should only return enabled benchmarks by default', async () => {
      const siteBenchmark1 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Enabled Benchmark',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark1.id);

      const siteBenchmark2 = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Disabled Benchmark',
        benchmarkValue: 1.50,
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark2.id);

      await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark1.id, 'site');
      const enabled2 = await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark2.id, 'site');
      await storage.disableBenchmarkForOrg(testOrgId, siteBenchmark2.id, 'site');

      const orgBenchmarks = await storage.getOrganizationBenchmarks(testOrgId);
      const ourBenchmarks = orgBenchmarks.filter(b =>
        b.benchmarkId === siteBenchmark1.id || b.benchmarkId === siteBenchmark2.id
      );

      // Should only return enabled benchmark
      expect(ourBenchmarks.length).toBe(1);
      expect(ourBenchmarks[0].benchmarkId).toBe(siteBenchmark1.id);
      expect(ourBenchmarks[0].isEnabled).toBe(true);
    });

    // Cycle 15: updateOrganizationBenchmarkSettings() updates settings
    it('should update organization benchmark settings', async () => {
      const siteBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Benchmark for Settings',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark.id);

      const enabled = await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark.id, 'site');

      // Update settings (toggle enabled status)
      const updated = await storage.updateOrganizationBenchmarkSettings(
        testOrgId,
        siteBenchmark.id,
        'site',
        { isEnabled: false }
      );

      expect(updated.isEnabled).toBe(false);
      expect(updated.benchmarkId).toBe(siteBenchmark.id);
    });

    it('should not update benchmark settings for wrong organization', async () => {
      const siteBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Protected Settings',
        benchmarkValue: 1.00,
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark.id);

      await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark.id, 'site');

      // Create another org
      const [otherOrg] = await db.insert(organizations).values({
        name: `Other Org ${Date.now()}`,
      }).returning();

      await expect(
        storage.updateOrganizationBenchmarkSettings(otherOrg.id, siteBenchmark.id, 'site', { isEnabled: false })
      ).rejects.toThrow('not found');

      // Clean up
      await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
    });
  });

  describe('Evaluation Queries with Athlete Filtering', () => {
    let athleteUserId: string;

    beforeEach(async () => {
      // Create an athlete user with specific attributes
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const [athlete] = await db.insert(users).values({
        username: `athlete${uniqueSuffix}`,
        emails: ['athlete@example.com'],
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'Athlete',
        fullName: 'Test Athlete',
        gender: 'Male',
        birthYear: 2005, // Age 20 in 2025
        positions: ['Forward'],
      }).returning();
      athleteUserId = athlete.id;
    });

    afterEach(async () => {
      // Clean up athlete user
      await db.delete(users).where(eq(users.id, athleteUserId));
    });

    // Cycle 16: getApplicableBenchmarks() filters by athlete gender
    it('should return benchmarks matching athlete gender or NULL gender', async () => {
      // Create benchmarks with different gender filters
      const maleBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Male Only Benchmark',
        benchmarkValue: 1.00,
        gender: 'Male',
      }, siteAdminUserId);
      createdBenchmarkIds.push(maleBenchmark.id);

      const femaleBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Female Only Benchmark',
        benchmarkValue: 1.10,
        gender: 'Female',
      }, siteAdminUserId);
      createdBenchmarkIds.push(femaleBenchmark.id);

      const anyGenderBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Any Gender Benchmark',
        benchmarkValue: 1.20,
        // gender: null (not specified)
      }, siteAdminUserId);
      createdBenchmarkIds.push(anyGenderBenchmark.id);

      // Enable all benchmarks for org
      await storage.enableBenchmarkForOrg(testOrgId, maleBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, femaleBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, anyGenderBenchmark.id, 'site');

      // Get applicable benchmarks for male athlete
      const applicable = await storage.getApplicableBenchmarks(testOrgId, testMetricCode, {
        gender: 'Male',
      });

      // Should return male-specific and any-gender benchmarks, but NOT female
      expect(applicable.some(b => b.id === maleBenchmark.id)).toBe(true);
      expect(applicable.some(b => b.id === anyGenderBenchmark.id)).toBe(true);
      expect(applicable.some(b => b.id === femaleBenchmark.id)).toBe(false);
    });

    // Cycle 17: getApplicableBenchmarks() filters by athlete age
    it('should return benchmarks matching athlete age range or NULL age', async () => {
      const currentYear = 2025;
      const athleteAge = currentYear - 2005; // 20 years old

      // Create benchmarks with different age ranges
      const youngBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Youth Benchmark (14-17)',
        benchmarkValue: 1.30,
        ageMin: 14,
        ageMax: 17,
      }, siteAdminUserId);
      createdBenchmarkIds.push(youngBenchmark.id);

      const adultBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Adult Benchmark (18-25)',
        benchmarkValue: 1.00,
        ageMin: 18,
        ageMax: 25,
      }, siteAdminUserId);
      createdBenchmarkIds.push(adultBenchmark.id);

      const anyAgeBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'All Ages Benchmark',
        benchmarkValue: 1.40,
        // ageMin/ageMax: null
      }, siteAdminUserId);
      createdBenchmarkIds.push(anyAgeBenchmark.id);

      // Enable all benchmarks
      await storage.enableBenchmarkForOrg(testOrgId, youngBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, adultBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, anyAgeBenchmark.id, 'site');

      // Get applicable benchmarks for 20-year-old athlete
      const applicable = await storage.getApplicableBenchmarks(testOrgId, testMetricCode, {
        age: athleteAge,
      });

      // Should return adult and any-age, but NOT youth
      expect(applicable.some(b => b.id === adultBenchmark.id)).toBe(true);
      expect(applicable.some(b => b.id === anyAgeBenchmark.id)).toBe(true);
      expect(applicable.some(b => b.id === youngBenchmark.id)).toBe(false);
    });

    // Cycle 18: getApplicableBenchmarks() filters by athlete position
    it('should return benchmarks matching athlete position or NULL position', async () => {
      // Create benchmarks with different position filters
      const forwardBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Forward Benchmark',
        benchmarkValue: 1.00,
        position: 'Forward',
      }, siteAdminUserId);
      createdBenchmarkIds.push(forwardBenchmark.id);

      const defenderBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Defender Benchmark',
        benchmarkValue: 1.10,
        position: 'Defender',
      }, siteAdminUserId);
      createdBenchmarkIds.push(defenderBenchmark.id);

      const anyPositionBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'All Positions Benchmark',
        benchmarkValue: 1.20,
        // position: null
      }, siteAdminUserId);
      createdBenchmarkIds.push(anyPositionBenchmark.id);

      // Enable all benchmarks
      await storage.enableBenchmarkForOrg(testOrgId, forwardBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, defenderBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, anyPositionBenchmark.id, 'site');

      // Get applicable benchmarks for forward athlete
      const applicable = await storage.getApplicableBenchmarks(testOrgId, testMetricCode, {
        position: 'Forward',
      });

      // Should return forward-specific and any-position, but NOT defender
      expect(applicable.some(b => b.id === forwardBenchmark.id)).toBe(true);
      expect(applicable.some(b => b.id === anyPositionBenchmark.id)).toBe(true);
      expect(applicable.some(b => b.id === defenderBenchmark.id)).toBe(false);
    });

    // Cycle 19: getApplicableBenchmarks() returns UNION of site + custom benchmarks
    it('should return both site and custom benchmarks for organization', async () => {
      // Create a site benchmark
      const siteBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Site Benchmark',
        benchmarkValue: 1.00,
        gender: 'Male',
      }, siteAdminUserId);
      createdBenchmarkIds.push(siteBenchmark.id);

      // Create a custom benchmark for org
      const customBenchmark = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Custom Team Benchmark',
        benchmarkValue: 1.10,
        gender: 'Male',
      }, siteAdminUserId);
      createdBenchmarkIds.push(customBenchmark.id);

      // Enable both benchmarks
      await storage.enableBenchmarkForOrg(testOrgId, siteBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, customBenchmark.id, 'custom');

      // Get applicable benchmarks
      const applicable = await storage.getApplicableBenchmarks(testOrgId, testMetricCode, {
        gender: 'Male',
      });

      // Should include both site and custom benchmarks
      const siteBm = applicable.find(b => b.name === 'Site Benchmark');
      const customBm = applicable.find(b => b.name === 'Custom Team Benchmark');

      expect(siteBm).toBeDefined();
      expect(customBm).toBeDefined();
    });

    it('should filter by multiple athlete attributes simultaneously', async () => {
      // Create benchmark with multiple filters
      const specificBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Male Adult Forward Benchmark',
        benchmarkValue: 0.95,
        gender: 'Male',
        ageMin: 18,
        ageMax: 25,
        position: 'Forward',
      }, siteAdminUserId);
      createdBenchmarkIds.push(specificBenchmark.id);

      // Create benchmark that doesn't match
      const mismatchBenchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Female Youth Defender',
        benchmarkValue: 1.20,
        gender: 'Female',
        ageMin: 14,
        ageMax: 17,
        position: 'Defender',
      }, siteAdminUserId);
      createdBenchmarkIds.push(mismatchBenchmark.id);

      // Enable both
      await storage.enableBenchmarkForOrg(testOrgId, specificBenchmark.id, 'site');
      await storage.enableBenchmarkForOrg(testOrgId, mismatchBenchmark.id, 'site');

      // Get applicable for male, 20 year old, forward athlete
      const applicable = await storage.getApplicableBenchmarks(testOrgId, testMetricCode, {
        gender: 'Male',
        age: 20,
        position: 'Forward',
      });

      // Should only return the matching benchmark
      expect(applicable.some(b => b.id === specificBenchmark.id)).toBe(true);
      expect(applicable.some(b => b.id === mismatchBenchmark.id)).toBe(false);
    });
  });

  // Cascade Delete Tests
  describe('Cascade Deletes', () => {
    // These tests verify PostgreSQL triggers from migration 0024_add_benchmarks_system.sql
    // Triggers have been applied to test database
    test('deleting site benchmark should cascade to organization_benchmarks via trigger', async () => {
      // Create a site benchmark
      const benchmark = await storage.createSiteBenchmark({
        metricCode: testMetricCode,
        name: 'Test Cascade Delete',
        benchmarkValue: 1.5,
      }, siteAdminUserId);
      createdBenchmarkIds.push(benchmark.id);

      // Enable it for an organization
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'site');

      // Verify enablement exists
      const beforeDelete = await storage.getOrganizationBenchmarks(testOrgId);
      expect(beforeDelete.some(b => b.benchmarkId === benchmark.id)).toBe(true);

      // Delete the site benchmark
      await storage.deleteSiteBenchmark(benchmark.id);

      // Verify the organization_benchmarks record was also deleted via trigger
      const afterDelete = await storage.getOrganizationBenchmarks(testOrgId);
      expect(afterDelete.some(b => b.benchmarkId === benchmark.id)).toBe(false);
    });

    test('deleting custom benchmark should cascade to organization_benchmarks via trigger', async () => {
      // Create a custom benchmark
      const benchmark = await storage.createCustomBenchmark({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        name: 'Test Cascade Delete Custom',
        benchmarkValue: 2.0,
      }, siteAdminUserId);

      // Enable it for the organization
      await storage.enableBenchmarkForOrg(testOrgId, benchmark.id, 'custom');

      // Verify enablement exists
      const beforeDelete = await storage.getOrganizationBenchmarks(testOrgId);
      expect(beforeDelete.some(b => b.benchmarkId === benchmark.id)).toBe(true);

      // Delete the custom benchmark
      await storage.deleteCustomBenchmark(testOrgId, benchmark.id);

      // Verify the organization_benchmarks record was also deleted via trigger
      const afterDelete = await storage.getOrganizationBenchmarks(testOrgId);
      expect(afterDelete.some(b => b.benchmarkId === benchmark.id)).toBe(false);
    });
  });
});
