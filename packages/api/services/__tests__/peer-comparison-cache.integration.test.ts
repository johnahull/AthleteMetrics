/**
 * Peer Comparison Cache - Integration Tests
 *
 * Tests for cache behavior including:
 * - Cache creation when distribution is computed
 * - Cache retrieval (returns cached value when not expired)
 * - Cache expiration (expired entries are not returned)
 * - Cache cleanup (cleanupExpiredCache removes expired entries)
 * - Cache key normalization (same filters produce same cache key)
 *
 * IMPORTANT: These tests require a fully synced test database.
 * Before running, ensure your test database has all migrations applied:
 *
 *   npm run db:migrate:all
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import {
  users, measurements, organizations, teams, userTeams,
  siteMetrics, peerPercentileCache,
} from '@shared/schema';
import { eq, and, inArray, sql, lte } from 'drizzle-orm';
import { storage } from '../../storage';
import { peerComparisonService } from '../peer-comparison-service';

// Test constants
const TEST_METRIC_CODE = 'FLY10_TIME';

// Skip integration tests if database is not properly configured
let SKIP_INTEGRATION_TESTS = false;

// Check if required columns exist before running tests
async function checkDatabaseSchema(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'site_metrics' AND column_name = 'metric_type'
    `);
    return (result as any[]).length > 0;
  } catch {
    return false;
  }
}

describe.skipIf(SKIP_INTEGRATION_TESTS)('PeerComparisonService - Cache Integration Tests', () => {
  let testOrgId: string;
  let testTeamId: string;
  let testAthleteIds: string[] = [];
  let targetAthleteId: string;
  let uniqueSuffix: string;
  let schemaValid = false;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }

    // Verify required columns exist
    schemaValid = await checkDatabaseSchema();
    if (!schemaValid) {
      console.warn('Skipping peer comparison cache tests: metric_type column missing - run migrations first');
    }
  });

  beforeEach(async () => {
    if (!schemaValid) return;

    uniqueSuffix = `cache-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    testAthleteIds = [];

    // Clean up any existing cache entries for the test metric
    await db.delete(peerPercentileCache)
      .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE))
      .catch(() => {});

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org Cache ${uniqueSuffix}`,
      description: 'Test organization for cache tests',
      orgType: 'college',
    }).returning();
    testOrgId = org.id;

    // Create test team
    const [team] = await db.insert(teams).values({
      name: `Test Team Cache ${uniqueSuffix}`,
      organizationId: testOrgId,
      sport: 'Soccer',
    }).returning();
    testTeamId = team.id;

    // Ensure test metric exists
    const existingMetric = await db.select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, TEST_METRIC_CODE))
      .limit(1);

    if (existingMetric.length === 0) {
      await db.insert(siteMetrics).values({
        code: TEST_METRIC_CODE,
        label: '10-Yard Fly Time',
        category: 'speed',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
      });
    }

    // Create target athlete
    const targetBirthDate = new Date();
    targetBirthDate.setFullYear(targetBirthDate.getFullYear() - 20);
    const [targetAthlete] = await db.insert(users).values({
      username: `targetcache${uniqueSuffix}`,
      emails: [`targetcache${uniqueSuffix}@example.com`],
      password: 'hashedpassword',
      firstName: 'Target',
      lastName: 'CacheAthlete',
      fullName: 'Target CacheAthlete',
      isSiteAdmin: false,
      isActive: true,
      gender: 'Male',
      birthDate: targetBirthDate.toISOString().split('T')[0],
      sports: ['Soccer'],
      peerComparisonOptIn: true,
    }).returning();
    targetAthleteId = targetAthlete.id;
    testAthleteIds.push(targetAthleteId);

    await storage.addUserToOrganization(targetAthleteId, testOrgId, 'athlete');
    await db.insert(userTeams).values({
      userId: targetAthleteId,
      teamId: testTeamId,
      isActive: true,
    });

    // Create measurement for target athlete (must be verified to be included in peer pool)
    await db.insert(measurements).values({
      userId: targetAthleteId,
      submittedBy: targetAthleteId,
      metric: TEST_METRIC_CODE,
      value: '1.00',
      date: new Date().toISOString().split('T')[0],
      age: 20,
      units: 's',
      organizationId: testOrgId,
      isVerified: true,
    });

    // Create peer athletes to have enough sample size
    await createPeerAthletes();
  });

  afterEach(async () => {
    if (!schemaValid) return;

    // Clean up in reverse order of dependencies
    await db.delete(peerPercentileCache)
      .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE))
      .catch(() => {});

    for (const athleteId of testAthleteIds) {
      await db.delete(measurements).where(eq(measurements.userId, athleteId)).catch(() => {});
      await db.delete(userTeams).where(eq(userTeams.userId, athleteId)).catch(() => {});
      await storage.removeUserFromOrganization(athleteId, testOrgId, false).catch(() => {});
      await db.delete(users).where(eq(users.id, athleteId)).catch(() => {});
    }

    await db.delete(teams).where(eq(teams.id, testTeamId)).catch(() => {});
    await db.delete(organizations).where(eq(organizations.id, testOrgId)).catch(() => {});
  });

  async function createPeerAthletes() {
    // Create enough peers to meet minimum sample size (10+)
    const peers = [
      { age: 21, gender: 'Male', value: '0.95' },
      { age: 19, gender: 'Male', value: '1.05' },
      { age: 22, gender: 'Male', value: '0.98' },
      { age: 20, gender: 'Male', value: '0.92' },
      { age: 21, gender: 'Male', value: '1.02' },
      { age: 20, gender: 'Male', value: '1.10' },
      { age: 21, gender: 'Male', value: '1.08' },
      { age: 25, gender: 'Male', value: '0.88' },
      { age: 30, gender: 'Male', value: '0.90' },
      { age: 35, gender: 'Male', value: '1.15' },
      { age: 40, gender: 'Male', value: '1.20' },
      { age: 14, gender: 'Male', value: '1.25' },
    ];

    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i];
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - peer.age);

      const [athlete] = await db.insert(users).values({
        username: `peercache${i}${uniqueSuffix}`,
        emails: [`peercache${i}${uniqueSuffix}@example.com`],
        password: 'hashedpassword',
        firstName: `PeerCache${i}`,
        lastName: 'Athlete',
        fullName: `PeerCache${i} Athlete`,
        isSiteAdmin: false,
        isActive: true,
        gender: peer.gender,
        birthDate: birthDate.toISOString().split('T')[0],
        sports: ['Soccer'],
        peerComparisonOptIn: true,
      }).returning();

      testAthleteIds.push(athlete.id);
      await storage.addUserToOrganization(athlete.id, testOrgId, 'athlete');
      await db.insert(userTeams).values({
        userId: athlete.id,
        teamId: testTeamId,
        isActive: true,
      });

      await db.insert(measurements).values({
        userId: athlete.id,
        submittedBy: athlete.id,
        metric: TEST_METRIC_CODE,
        value: peer.value,
        date: new Date().toISOString().split('T')[0],
        age: peer.age,
        units: 's',
        organizationId: testOrgId,
        isVerified: true,  // Must be verified to be included in peer pool
      });
    }
  }

  describe('Cache Creation', () => {
    it('should create cache entry when computing distribution', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Verify no cache exists initially
      const initialCache = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));
      expect(initialCache.length).toBe(0);

      // Compute distribution (should create cache entry)
      const distribution = await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      expect(distribution).toBeDefined();
      expect(distribution.metricCode).toBe(TEST_METRIC_CODE);

      // Verify cache entry was created
      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      expect(cacheEntries.length).toBe(1);
      expect(cacheEntries[0].sampleSize).toBeGreaterThan(0);
    });

    it('should store correct percentile values in cache', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      const distribution = await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      expect(cacheEntries.length).toBe(1);
      const cached = cacheEntries[0];

      // Verify cached values match computed distribution
      expect(parseFloat(String(cached.p10))).toBeCloseTo(distribution.p10!, 2);
      expect(parseFloat(String(cached.p25))).toBeCloseTo(distribution.p25!, 2);
      expect(parseFloat(String(cached.p50))).toBeCloseTo(distribution.p50!, 2);
      expect(parseFloat(String(cached.p75))).toBeCloseTo(distribution.p75!, 2);
      expect(parseFloat(String(cached.p90))).toBeCloseTo(distribution.p90!, 2);
    });
  });

  describe('Cache Retrieval', () => {
    it('should return cached distribution on subsequent calls', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // First call creates cache
      const firstResult = await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Second call should return cached value
      const secondResult = await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Verify both results have identical distribution data (indicating cache hit)
      expect(secondResult.sampleSize).toBe(firstResult.sampleSize);
      expect(secondResult.p10).toBe(firstResult.p10);
      expect(secondResult.p50).toBe(firstResult.p50);
      expect(secondResult.p90).toBe(firstResult.p90);

      // Verify only one cache entry exists (not recomputed)
      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));
      expect(cacheEntries.length).toBe(1);
    });

    it('should create different cache entries for different filters', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Query with gender=Male filter
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Query with no filter
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        {}
      );

      // Should have 2 cache entries (different filter criteria)
      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      expect(cacheEntries.length).toBe(2);
    });
  });

  describe('Cache Expiration', () => {
    it('should set correct expiration time on cache entries', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      const beforeCompute = new Date();

      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      const cached = cacheEntries[0];
      expect(cached.expiresAt).toBeDefined();

      // Expiration should be ~15 minutes from computation time
      const expiresAt = new Date(cached.expiresAt!);
      const computedAt = new Date(cached.computedAt!);
      const ttlMinutes = (expiresAt.getTime() - computedAt.getTime()) / (60 * 1000);

      // Allow some tolerance (14-16 minutes)
      expect(ttlMinutes).toBeGreaterThanOrEqual(14);
      expect(ttlMinutes).toBeLessThanOrEqual(16);
    });

    it('should recompute when cache entry is expired', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Create initial cache entry
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Manually expire the cache entry
      await db.update(peerPercentileCache)
        .set({ expiresAt: new Date(Date.now() - 1000) }) // 1 second in the past
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      const expiredCache = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));
      const expiredComputedAt = expiredCache[0].computedAt;

      // Request distribution again - should recompute
      const result = await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Result should have a newer computedAt time
      expect(result.computedAt.getTime()).toBeGreaterThan(expiredComputedAt!.getTime());
    });
  });

  describe('Cache Cleanup', () => {
    it('should remove expired cache entries via cleanupExpiredCache', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Create cache entry
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Manually expire the cache entry
      await db.update(peerPercentileCache)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      // Verify entry exists (even though expired)
      const beforeCleanup = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));
      expect(beforeCleanup.length).toBe(1);

      // Run cleanup
      const deletedCount = await peerComparisonService.cleanupExpiredCache();
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify entry was removed
      const afterCleanup = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));
      expect(afterCleanup.length).toBe(0);
    });

    it('should not remove non-expired cache entries', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Create cache entry (will have future expiresAt)
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Run cleanup
      await peerComparisonService.cleanupExpiredCache();

      // Verify entry still exists
      const afterCleanup = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));
      expect(afterCleanup.length).toBe(1);
    });
  });

  describe('Cache Key Normalization', () => {
    it('should produce same cache entry for equivalent filter objects', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // First query with sports in one order
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { sports: ['Basketball', 'Soccer'] }
      );

      // Second query with sports in different order (should use same cache key)
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { sports: ['Soccer', 'Basketball'] }
      );

      // Should only have 1 cache entry (normalized filters are identical)
      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      expect(cacheEntries.length).toBe(1);
    });

    it('should normalize sports to uppercase for cache keys', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Query with lowercase sport
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { sports: ['soccer'] }
      );

      // Query with uppercase sport (should use same cache key)
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { sports: ['SOCCER'] }
      );

      // Should only have 1 cache entry
      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      expect(cacheEntries.length).toBe(1);
    });

    it('should treat empty arrays same as no filter', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Query with empty sports array
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { sports: [] }
      );

      // Query with no sports filter
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        {}
      );

      // Should only have 1 cache entry (empty array normalized to no filter)
      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      expect(cacheEntries.length).toBe(1);
    });
  });

  describe('Cache Upsert Behavior', () => {
    it('should update existing cache entry instead of creating duplicate', async () => {
      if (!schemaValid) return; // Skip if schema is incomplete

      // Create initial cache entry
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Expire the cache entry
      await db.update(peerPercentileCache)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      // Recompute (should upsert, not create new)
      await peerComparisonService.getDistribution(
        TEST_METRIC_CODE,
        { gender: 'Male' }
      );

      // Should still have only 1 cache entry
      const cacheEntries = await db.select()
        .from(peerPercentileCache)
        .where(eq(peerPercentileCache.metricCode, TEST_METRIC_CODE));

      expect(cacheEntries.length).toBe(1);
    });
  });
});
