/**
 * Organization Type Service
 * 
 * @fileoverview Centralized service for organization type operations including:
 * - Type validation and normalization  
 * - Metrics and benchmarks filtering by organization type
 * - Performance optimized queries with caching
 * - Comprehensive error handling and logging
 * 
 * @author AthleteMetrics System
 * @version 1.0.0
 * @since 2025-11-09
 */

import { BaseService } from "./base-service";
import { MetricService } from "./metric-service";
import { BenchmarkService } from "./benchmark-service";
import {
  isValidOrganizationType,
  parseOrganizationType,
  validateOrganizationTypesBulk,
  organizationTypeLookup,
  type OrganizationType
} from "@shared/organization-type-utils";
import type { SiteMetric, SiteBenchmark, Organization } from "@shared/schema";

/**
 * Cache duration for organization type queries (5 minutes)
 * Short cache duration balances performance with data freshness
 */
const CACHE_DURATION_MS = 5 * 60 * 1000;

/**
 * Simple in-memory cache for organization type queries with LRU eviction
 *
 * PRODUCTION NOTE: This implementation is suitable for single-instance deployments.
 * For horizontal scaling (multiple server instances), replace with Redis or Memcached.
 *
 * CONCURRENCY SAFETY: While Node.js is single-threaded, async operations can interleave.
 * This implementation uses snapshot-based iteration to minimize inconsistencies.
 *
 * @see https://redis.io/ for production-grade distributed caching
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
  lastAccessed: number;
}

class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;
  private evicting = false; // Prevent concurrent eviction operations

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  set(key: string, data: T, ttlMs: number = CACHE_DURATION_MS): void {
    const now = Date.now();

    // Implement LRU eviction if cache is full
    // Use evicting flag to prevent concurrent eviction operations
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      expiry: now + ttlMs,
      lastAccessed: now,
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update last accessed time for LRU tracking
    // This mutation is safe because Map preserves insertion order
    entry.lastAccessed = now;
    this.hits++;
    return entry.data;
  }

  invalidate(pattern?: string): void {
    if (pattern) {
      // Create snapshot of keys to avoid mutation during iteration
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      }
      // Delete after iteration completes
      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }

  getStats(): { size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 0,
    };
  }

  /**
   * Evict the least recently used entry from cache
   * Used when cache reaches maxSize limit
   *
   * CONCURRENCY NOTE: Uses evicting flag and snapshot-based iteration
   * to prevent inconsistencies from interleaved async operations
   */
  private evictOldest(): void {
    // Prevent concurrent eviction operations
    if (this.evicting) {
      return;
    }

    this.evicting = true;

    try {
      // Create snapshot of entries to avoid issues with concurrent modifications
      // While Node.js is single-threaded, async operations can interleave between
      // iterations, potentially causing inconsistent state
      const entries = Array.from(this.cache.entries());

      if (entries.length === 0) {
        return;
      }

      // Find oldest entry from snapshot
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of entries) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = key;
        }
      }

      // Delete oldest entry if found
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    } finally {
      this.evicting = false;
    }
  }

  /**
   * Reset hit/miss statistics
   * Useful for monitoring intervals
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * Performance metrics for monitoring organization type operations
 */
interface PerformanceMetrics {
  queriesExecuted: number;
  cacheHits: number;
  cacheMisses: number;
  averageQueryTime: number;
  lastResetTime: number;
}

export class OrganizationTypeService extends BaseService {
  private metricsCache = new SimpleCache<SiteMetric[]>();
  private benchmarksCache = new SimpleCache<SiteBenchmark[]>();
  private organizationsCache = new SimpleCache<Organization[]>();
  private metricService: MetricService;
  private benchmarkService: BenchmarkService;
  private performanceMetrics: PerformanceMetrics = {
    queriesExecuted: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageQueryTime: 0,
    lastResetTime: Date.now(),
  };

  constructor() {
    super();
    this.metricService = new MetricService();
    this.benchmarkService = new BenchmarkService();
  }

  /**
   * Validate and normalize organization type from user input
   * 
   * @param orgType - Organization type to validate
   * @param allowNull - Whether to allow null values (defaults to false)
   * @returns Validated organization type or throws error
   * 
   * @throws {Error} If organization type is invalid and allowNull is false
   * 
   * @example
   * ```typescript
   * const validated = service.validateOrganizationType(userInput);
   * // Returns valid OrganizationType or throws error
   * ```
   */
  validateOrganizationType(
    orgType: unknown,
    allowNull: boolean = false
  ): OrganizationType | null {
    if (orgType == null) {
      if (allowNull) return null;
      throw new Error("Organization type is required");
    }

    if (!isValidOrganizationType(orgType)) {
      throw new Error(
        `Invalid organization type: ${orgType}. Valid types are: youth, high_school, college, club, private_facility, elite_academy`
      );
    }

    return orgType;
  }

  /**
   * Get metrics available for specific organization type with caching
   * 
   * @param orgType - Organization type to filter by
   * @param requestingUserId - ID of user making request (for audit logging)
   * @param useCache - Whether to use cached results (defaults to true)
   * @returns Array of available metrics
   * 
   * @example
   * ```typescript
   * const metrics = await service.getMetricsForOrganizationType('college', userId);
   * ```
   */
  async getMetricsForOrganizationType(
    orgType: OrganizationType,
    requestingUserId: string,
    useCache: boolean = true
  ): Promise<SiteMetric[]> {
    const startTime = Date.now();
    const cacheKey = `metrics:${orgType}`;

    try {
      // Validate organization type
      this.validateOrganizationType(orgType);

      // Try cache first
      if (useCache) {
        const cachedMetrics = this.metricsCache.get(cacheKey);
        if (cachedMetrics) {
          this.performanceMetrics.cacheHits++;
          return cachedMetrics;
        }
      }

      this.performanceMetrics.cacheMisses++;

      // Use MetricService to get metrics filtered by organization type
      // MetricService.getSiteMetrics handles the filtering logic
      const metrics = await this.metricService.getSiteMetrics(requestingUserId, {
        includeInactive: false,
        orgType
      });

      // Cache results
      if (useCache && metrics) {
        this.metricsCache.set(cacheKey, metrics);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(startTime);

      // Audit log for security monitoring
      await this.storage.createAuditLog({
        userId: requestingUserId,
        action: 'organization_type_metrics_queried',
        resourceType: 'site_metrics',
        resourceId: null,
        details: JSON.stringify({
          organizationType: orgType,
          resultCount: metrics?.length || 0,
          cached: false,
        }),
      });

      return metrics || [];
    } catch (error) {
      console.error(`OrganizationTypeService.getMetricsForOrganizationType:`, error);
      
      // Update error metrics
      this.updatePerformanceMetrics(startTime);
      
      throw new Error(
        `Failed to fetch metrics for organization type '${orgType}': ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get benchmarks available for specific organization type with caching
   * 
   * @param orgType - Organization type to filter by
   * @param requestingUserId - ID of user making request (for audit logging)
   * @param useCache - Whether to use cached results (defaults to true)
   * @returns Array of available benchmarks
   */
  async getBenchmarksForOrganizationType(
    orgType: OrganizationType,
    requestingUserId: string,
    useCache: boolean = true
  ): Promise<SiteBenchmark[]> {
    const startTime = Date.now();
    const cacheKey = `benchmarks:${orgType}`;

    try {
      // Validate organization type
      this.validateOrganizationType(orgType);

      // Try cache first
      if (useCache) {
        const cachedBenchmarks = this.benchmarksCache.get(cacheKey);
        if (cachedBenchmarks) {
          this.performanceMetrics.cacheHits++;
          return cachedBenchmarks;
        }
      }

      this.performanceMetrics.cacheMisses++;

      // Query database with organization type filtering
      const benchmarks = await this.storage.getSiteBenchmarks({
        includeInactive: false,
        orgType: orgType
      }) || [];

      // Cache results
      if (useCache && benchmarks) {
        this.benchmarksCache.set(cacheKey, benchmarks);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(startTime);

      // Audit log for security monitoring
      await this.storage.createAuditLog({
        userId: requestingUserId,
        action: 'organization_type_benchmarks_queried',
        resourceType: 'site_benchmarks',
        resourceId: null,
        details: JSON.stringify({
          organizationType: orgType,
          resultCount: benchmarks?.length || 0,
          cached: false,
        }),
      });

      return benchmarks || [];
    } catch (error) {
      console.error(`OrganizationTypeService.getBenchmarksForOrganizationType:`, error);
      
      // Update error metrics
      this.updatePerformanceMetrics(startTime);
      
      throw new Error(
        `Failed to fetch benchmarks for organization type '${orgType}': ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get organizations filtered by type with caching
   * 
   * @param orgType - Organization type to filter by (optional)
   * @param requestingUserId - ID of user making request
   * @param includeInactive - Whether to include inactive organizations
   * @returns Array of organizations
   */
  async getOrganizationsByType(
    orgType: OrganizationType | null,
    requestingUserId: string,
    includeInactive: boolean = false
  ): Promise<Organization[]> {
    const startTime = Date.now();
    const cacheKey = `orgs:${orgType || 'all'}:${includeInactive}`;

    try {
      // Validate organization type if provided
      if (orgType) {
        this.validateOrganizationType(orgType);
      }

      // Check access permissions
      const requestingUser = await this.storage.getUser(requestingUserId);
      const isSiteAdmin = requestingUser?.isSiteAdmin === true;
      
      if (!isSiteAdmin && includeInactive) {
        throw new Error("Only site administrators can view inactive organizations");
      }

      // Try cache first
      const cachedOrganizations = this.organizationsCache.get(cacheKey);
      if (cachedOrganizations) {
        this.performanceMetrics.cacheHits++;
        return cachedOrganizations;
      }

      this.performanceMetrics.cacheMisses++;

      // Query database with organization type filtering using new storage method
      const organizations = await this.storage.getOrganizations({
        includeInactive: includeInactive,
        orgType: orgType
      }) || [];

      // Cache results (shorter cache for admin queries with inactive orgs)
      const cacheTime = includeInactive ? CACHE_DURATION_MS / 2 : CACHE_DURATION_MS;
      if (organizations) {
        this.organizationsCache.set(cacheKey, organizations, cacheTime);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(startTime);

      return organizations || [];
    } catch (error) {
      console.error(`OrganizationTypeService.getOrganizationsByType:`, error);
      
      // Update error metrics
      this.updatePerformanceMetrics(startTime);
      
      throw error;
    }
  }

  /**
   * Bulk validate organization types for API endpoints
   * 
   * @param data - Array of objects containing organization type fields
   * @param typeField - Field name containing organization type
   * @returns Validated and normalized data
   */
  validateOrganizationTypesBulk<T extends Record<string, any>>(
    data: T[],
    typeField: keyof T = 'orgType' as keyof T
  ): T[] {
    try {
      return validateOrganizationTypesBulk(data, typeField);
    } catch (error) {
      console.error(`OrganizationTypeService.validateOrganizationTypesBulk:`, error);
      throw error;
    }
  }

  /**
   * Get organization type statistics for admin dashboard
   *
   * @param requestingUserId - ID of user making request (must be site admin)
   * @returns Statistics about organization type distribution
   *
   * @throws {Error} This endpoint is not yet implemented - storage query pending
   *
   * @todo Implement getOrganizationTypeStatistics in storage interface
   * Implementation requires:
   * 1. Add getOrganizationTypeStatistics() method to IStorage interface
   * 2. Implement in DatabaseStorage with query:
   *    SELECT org_type, COUNT(*) as count FROM organizations
   *    WHERE org_type IS NOT NULL GROUP BY org_type
   * 3. Handle null org_type organizations separately
   */
  async getOrganizationTypeStatistics(
    requestingUserId: string
  ): Promise<Record<OrganizationType, number> & { total: number }> {
    try {
      // Verify admin permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Only site administrators can view organization type statistics");
      }

      // Endpoint not yet implemented - throw explicit error
      throw new Error(
        "Organization type statistics endpoint is not yet implemented. " +
        "Storage query implementation is pending. " +
        "See TODO in OrganizationTypeService.getOrganizationTypeStatistics for details."
      );

      // Future implementation will return:
      // const result: Record<OrganizationType, number> & { total: number } = {
      //   youth: 0,
      //   high_school: 0,
      //   college: 0,
      //   club: 0,
      //   private_facility: 0,
      //   elite_academy: 0,
      //   total: 0,
      // };
      // return result;
    } catch (error) {
      console.error(`OrganizationTypeService.getOrganizationTypeStatistics:`, error);
      throw error;
    }
  }

  /**
   * Invalidate caches related to organization types
   * Call this when organization types, metrics, or benchmarks are updated
   * 
   * @param pattern - Optional pattern to match cache keys (invalidates all if not provided)
   */
  invalidateCache(pattern?: string): void {
    try {
      this.metricsCache.invalidate(pattern);
      this.benchmarksCache.invalidate(pattern);
      this.organizationsCache.invalidate(pattern);
      
      console.log(`Cache invalidated${pattern ? ` for pattern: ${pattern}` : ' (all)'}`);
    } catch (error) {
      console.error('OrganizationTypeService.invalidateCache:', error);
    }
  }

  /**
   * Get performance metrics for monitoring
   * 
   * @returns Current performance metrics and cache statistics
   */
  getPerformanceMetrics(): PerformanceMetrics & {
    cacheStats: {
      metrics: { size: number };
      benchmarks: { size: number };
      organizations: { size: number };
    };
  } {
    return {
      ...this.performanceMetrics,
      cacheStats: {
        metrics: this.metricsCache.getStats(),
        benchmarks: this.benchmarksCache.getStats(),
        organizations: this.organizationsCache.getStats(),
      },
    };
  }

  /**
   * Reset performance metrics (useful for monitoring intervals)
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      queriesExecuted: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageQueryTime: 0,
      lastResetTime: Date.now(),
    };
  }

  /**
   * Update performance metrics after query execution
   * 
   * @param startTime - Query start timestamp
   */
  private updatePerformanceMetrics(startTime: number): void {
    const queryTime = Date.now() - startTime;
    this.performanceMetrics.queriesExecuted++;
    
    // Calculate running average
    const totalQueries = this.performanceMetrics.queriesExecuted;
    const currentAvg = this.performanceMetrics.averageQueryTime;
    this.performanceMetrics.averageQueryTime = 
      ((currentAvg * (totalQueries - 1)) + queryTime) / totalQueries;
  }

  /**
   * Health check for organization type service
   * 
   * @returns Health status and metrics
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: PerformanceMetrics;
    cacheSize: number;
    lastError?: string;
  }> {
    try {
      // Test basic functionality
      const testOrgType: OrganizationType = 'club';
      this.validateOrganizationType(testOrgType);
      
      const totalCacheSize = 
        this.metricsCache.getStats().size +
        this.benchmarksCache.getStats().size +
        this.organizationsCache.getStats().size;
      
      // Determine health status based on performance
      const avgQueryTime = this.performanceMetrics.averageQueryTime;
      const status: 'healthy' | 'degraded' | 'unhealthy' = 
        avgQueryTime < 100 ? 'healthy' :
        avgQueryTime < 500 ? 'degraded' : 'unhealthy';

      return {
        status,
        metrics: this.performanceMetrics,
        cacheSize: totalCacheSize,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: this.performanceMetrics,
        cacheSize: 0,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}