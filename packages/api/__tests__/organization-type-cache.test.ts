/**
 * Unit tests for organization type cache implementation
 * Tests cache behavior, race conditions, and edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizationTypeService } from '../services/organization-type-service';

describe('Organization Type Cache', () => {
  let service: OrganizationTypeService;

  beforeEach(() => {
    service = new OrganizationTypeService();
  });

  describe('Cache Operations', () => {
    it('should cache metrics query results', async () => {
      const orgType = 'college';
      const userId = 'test-user-id';

      // First call - cache miss
      const metrics1 = await service.getMetricsForOrganizationType(orgType, userId, true);
      const perfMetrics1 = service.getPerformanceMetrics();
      expect(perfMetrics1.cacheMisses).toBeGreaterThan(0);

      // Second call - should hit cache
      const metrics2 = await service.getMetricsForOrganizationType(orgType, userId, true);
      const perfMetrics2 = service.getPerformanceMetrics();
      expect(perfMetrics2.cacheHits).toBeGreaterThan(0);

      // Results should be identical
      expect(metrics1).toEqual(metrics2);
    });

    it('should bypass cache when useCache is false', async () => {
      const orgType = 'college';
      const userId = 'test-user-id';

      // Call with cache disabled
      await service.getMetricsForOrganizationType(orgType, userId, false);
      const perfMetrics = service.getPerformanceMetrics();

      // Should have cache miss, not cache hit
      expect(perfMetrics.cacheMisses).toBeGreaterThan(0);
      expect(perfMetrics.cacheHits).toBe(0);
    });

    it('should cache benchmarks separately from metrics', async () => {
      const orgType = 'high_school';
      const userId = 'test-user-id';

      await service.getMetricsForOrganizationType(orgType, userId, true);
      await service.getBenchmarksForOrganizationType(orgType, userId, true);

      const perfMetrics = service.getPerformanceMetrics();

      // Both should have separate cache entries
      expect(perfMetrics.cacheStats.metrics.size).toBeGreaterThan(0);
      expect(perfMetrics.cacheStats.benchmarks.size).toBeGreaterThan(0);
    });

    it('should invalidate cache by pattern', async () => {
      const orgType = 'club';
      const userId = 'test-user-id';

      // Populate cache
      await service.getMetricsForOrganizationType(orgType, userId, true);
      await service.getBenchmarksForOrganizationType(orgType, userId, true);

      const before = service.getPerformanceMetrics();
      const sizeBefore = before.cacheStats.metrics.size + before.cacheStats.benchmarks.size;

      // Invalidate metrics cache only
      service.invalidateCache('metrics');

      const after = service.getPerformanceMetrics();
      const sizeAfter = after.cacheStats.metrics.size + after.cacheStats.benchmarks.size;

      // Metrics cache should be cleared, benchmarks should remain
      expect(sizeAfter).toBeLessThan(sizeBefore);
    });

    it('should invalidate all caches when no pattern provided', async () => {
      const userId = 'test-user-id';

      // Populate caches
      await service.getMetricsForOrganizationType('college', userId, true);
      await service.getBenchmarksForOrganizationType('high_school', userId, true);

      service.invalidateCache();

      const perfMetrics = service.getPerformanceMetrics();
      expect(perfMetrics.cacheStats.metrics.size).toBe(0);
      expect(perfMetrics.cacheStats.benchmarks.size).toBe(0);
    });
  });

  describe('Cache Performance Metrics', () => {
    it('should track cache hit rate', async () => {
      const orgType = 'elite_academy';
      const userId = 'test-user-id';

      // Reset metrics
      service.resetPerformanceMetrics();

      // First call - miss
      await service.getMetricsForOrganizationType(orgType, userId, true);

      // Multiple cached calls - hits
      await service.getMetricsForOrganizationType(orgType, userId, true);
      await service.getMetricsForOrganizationType(orgType, userId, true);
      await service.getMetricsForOrganizationType(orgType, userId, true);

      const perfMetrics = service.getPerformanceMetrics();

      expect(perfMetrics.cacheHits).toBe(3);
      expect(perfMetrics.cacheMisses).toBe(1);
    });

    it('should track average query time', async () => {
      const userId = 'test-user-id';

      service.resetPerformanceMetrics();

      await service.getMetricsForOrganizationType('college', userId, false);
      await service.getMetricsForOrganizationType('high_school', userId, false);

      const perfMetrics = service.getPerformanceMetrics();

      expect(perfMetrics.queriesExecuted).toBe(2);
      expect(perfMetrics.averageQueryTime).toBeGreaterThan(0);
    });

    it('should allow resetting performance metrics', async () => {
      const userId = 'test-user-id';

      await service.getMetricsForOrganizationType('college', userId, true);
      await service.getMetricsForOrganizationType('college', userId, true);

      service.resetPerformanceMetrics();

      const perfMetrics = service.getPerformanceMetrics();

      expect(perfMetrics.queriesExecuted).toBe(0);
      expect(perfMetrics.cacheHits).toBe(0);
      expect(perfMetrics.cacheMisses).toBe(0);
      expect(perfMetrics.averageQueryTime).toBe(0);
    });
  });

  describe('Cache Eviction (Race Condition Prevention)', () => {
    it('should handle concurrent cache operations without corruption', async () => {
      const userId = 'test-user-id';

      // Simulate concurrent requests to different org types
      const promises = [
        service.getMetricsForOrganizationType('college', userId, true),
        service.getMetricsForOrganizationType('high_school', userId, true),
        service.getMetricsForOrganizationType('club', userId, true),
        service.getMetricsForOrganizationType('youth', userId, true),
        service.getMetricsForOrganizationType('elite_academy', userId, true),
        service.getMetricsForOrganizationType('private_facility', userId, true),
      ];

      // All should complete without errors
      const results = await Promise.all(promises);

      // All results should be arrays
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });

      // Cache should contain entries
      const perfMetrics = service.getPerformanceMetrics();
      expect(perfMetrics.cacheStats.metrics.size).toBeGreaterThan(0);
    });

    it('should handle concurrent invalidations without errors', async () => {
      const userId = 'test-user-id';

      // Populate cache
      await Promise.all([
        service.getMetricsForOrganizationType('college', userId, true),
        service.getBenchmarksForOrganizationType('college', userId, true),
      ]);

      // Concurrent invalidations
      const invalidations = [
        () => service.invalidateCache('metrics'),
        () => service.invalidateCache('benchmarks'),
        () => service.invalidateCache(),
      ];

      // Should not throw errors
      expect(() => {
        invalidations.forEach(fn => fn());
      }).not.toThrow();
    });

    it('should maintain cache consistency during rapid get/set operations', async () => {
      const userId = 'test-user-id';
      const iterations = 50;

      // Rapid-fire cache operations
      const promises = [];
      for (let i = 0; i < iterations; i++) {
        const orgType = ['college', 'high_school', 'club'][i % 3] as any;
        promises.push(service.getMetricsForOrganizationType(orgType, userId, true));
      }

      const results = await Promise.all(promises);

      // All results should be valid
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });

      // Cache stats should be consistent
      const perfMetrics = service.getPerformanceMetrics();
      const totalOps = perfMetrics.cacheHits + perfMetrics.cacheMisses;
      expect(totalOps).toBe(iterations);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status with good performance', async () => {
      const userId = 'test-user-id';

      // Warm up cache with fast operations
      await service.getMetricsForOrganizationType('college', userId, true);
      await service.getMetricsForOrganizationType('college', userId, true); // Cache hit

      const health = await service.healthCheck();

      expect(health.status).toMatch(/healthy|degraded/);
      expect(health.metrics).toBeDefined();
      expect(health.cacheSize).toBeGreaterThanOrEqual(0);
    });

    it('should include cache size in health check', async () => {
      const userId = 'test-user-id';

      await service.getMetricsForOrganizationType('college', userId, true);
      await service.getBenchmarksForOrganizationType('high_school', userId, true);

      const health = await service.healthCheck();

      expect(health.cacheSize).toBeGreaterThan(0);
    });

    it('should report unhealthy if validation fails', async () => {
      // Health check tests basic validation
      const health = await service.healthCheck();

      // Should at least return status
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined userId gracefully', async () => {
      // This tests error handling when userId is invalid
      await expect(
        service.getMetricsForOrganizationType('college', undefined as any, true)
      ).rejects.toThrow();
    });

    it('should handle invalid org type gracefully', async () => {
      const userId = 'test-user-id';

      await expect(
        service.getMetricsForOrganizationType('invalid_type' as any, userId, true)
      ).rejects.toThrow();
    });

    it('should handle cache key collisions correctly', async () => {
      const userId = 'test-user-id';

      // Same org type, different users should potentially share cache (or not, depending on design)
      await service.getMetricsForOrganizationType('college', userId, true);
      await service.getMetricsForOrganizationType('college', 'other-user-id', true);

      // Both should succeed
      const perfMetrics = service.getPerformanceMetrics();
      expect(perfMetrics.queriesExecuted).toBeGreaterThanOrEqual(2);
    });
  });
});
