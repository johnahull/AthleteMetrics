/**
 * Benchmark management service
 * Handles site-level benchmark catalog, organization-level custom benchmarks,
 * and benchmark enablement with athlete attribute filtering
 */

import { BaseService } from "./base-service";
import {
  insertSiteBenchmarkSchema,
  updateSiteBenchmarkSchema,
  insertCustomBenchmarkSchema,
  updateCustomBenchmarkSchema,
} from "@shared/schema";
import type {
  SiteBenchmark,
  InsertSiteBenchmark,
  UpdateSiteBenchmark,
  CustomBenchmark,
  InsertCustomBenchmark,
  UpdateCustomBenchmark,
  OrganizationBenchmark,
} from "@shared/schema";

export interface BenchmarkFilters {
  includeInactive?: boolean;
}

export class BenchmarkService extends BaseService {
  // ========================================================================
  // SITE BENCHMARKS (Site Admin Only)
  // ========================================================================

  /**
   * Create a new site benchmark (site admin only)
   * Cycle 1: Requires site admin permission
   * Cycle 2: Validates metric exists
   * Cycle 3: Creates audit log
   */
  async createSiteBenchmark(
    benchmarkData: InsertSiteBenchmark,
    requestingUserId: string
  ): Promise<SiteBenchmark> {
    try {
      // Cycle 1: Verify site admin permission
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can create site benchmarks");
      }

      // Validate input
      const validatedData = insertSiteBenchmarkSchema.parse(benchmarkData);

      // Cycle 2: Validate metric exists
      const metric = await this.storage.getSiteMetric(validatedData.metricCode);
      if (!metric) {
        throw new Error(`Metric with code ${validatedData.metricCode} does not exist`);
      }

      // Create benchmark
      const benchmark = await this.storage.createSiteBenchmark(validatedData, requestingUserId);

      // Cycle 3: Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'benchmark_created',
          resourceType: 'site_benchmark',
          resourceId: benchmark.id,
          details: JSON.stringify({
            name: benchmark.name,
            metricCode: benchmark.metricCode,
            benchmarkValue: benchmark.benchmarkValue,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      return benchmark;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.createSiteBenchmark");
    }
  }

  /**
   * Update a site benchmark (site admin only)
   * Cycle 4: Requires site admin permission
   */
  async updateSiteBenchmark(
    benchmarkId: string,
    benchmarkData: Partial<UpdateSiteBenchmark>,
    requestingUserId: string
  ): Promise<SiteBenchmark> {
    try {
      // Cycle 4: Verify site admin permission
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can update site benchmarks");
      }

      // Validate input if provided fields
      if (Object.keys(benchmarkData).length > 0) {
        updateSiteBenchmarkSchema.parse(benchmarkData);
      }

      // Update benchmark
      const updated = await this.storage.updateSiteBenchmark(benchmarkId, benchmarkData);

      // Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'benchmark_updated',
          resourceType: 'site_benchmark',
          resourceId: benchmarkId,
          details: JSON.stringify(benchmarkData),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      return updated;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.updateSiteBenchmark");
    }
  }

  /**
   * Delete a site benchmark (site admin only)
   * Cycle 5: Prevents deleting system defaults
   */
  async deleteSiteBenchmark(
    benchmarkId: string,
    requestingUserId: string
  ): Promise<void> {
    try {
      // Verify site admin permission
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can delete site benchmarks");
      }

      // Cycle 5: Check if system default (storage layer also validates this)
      const benchmark = await this.storage.getSiteBenchmark(benchmarkId);
      if (!benchmark) {
        throw new Error(`Site benchmark with id ${benchmarkId} not found`);
      }

      if (benchmark.isSystemDefault) {
        throw new Error(`Cannot delete system default benchmark: ${benchmarkId}`);
      }

      // Delete benchmark (storage layer also validates)
      await this.storage.deleteSiteBenchmark(benchmarkId);

      // Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'benchmark_deleted',
          resourceType: 'site_benchmark',
          resourceId: benchmarkId,
          details: JSON.stringify({ name: benchmark.name }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }
    } catch (error) {
      return this.handleError(error, "BenchmarkService.deleteSiteBenchmark");
    }
  }

  /**
   * Toggle site benchmark active status (site admin only)
   * Cycle 6: Requires site admin permission
   */
  async toggleSiteBenchmarkStatus(
    benchmarkId: string,
    isActive: boolean,
    requestingUserId: string
  ): Promise<SiteBenchmark> {
    try {
      // Cycle 6: Verify site admin permission
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can toggle benchmark status");
      }

      // Toggle status
      const updated = await this.storage.toggleSiteBenchmarkStatus(benchmarkId, isActive);

      // Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: isActive ? 'benchmark_enabled' : 'benchmark_disabled',
          resourceType: 'site_benchmark',
          resourceId: benchmarkId,
          details: JSON.stringify({ isActive }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      return updated;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.toggleSiteBenchmarkStatus");
    }
  }

  /**
   * Get all site benchmarks
   */
  async getSiteBenchmarks(
    requestingUserId: string,
    filters?: BenchmarkFilters
  ): Promise<SiteBenchmark[]> {
    try {
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);

      return await this.storage.getSiteBenchmarks({
        includeInactive: isSiteAdmin && filters?.includeInactive,
      });
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getSiteBenchmarks");
    }
  }

  /**
   * Get a specific site benchmark by ID
   */
  async getSiteBenchmark(benchmarkId: string): Promise<SiteBenchmark | undefined> {
    try {
      return await this.storage.getSiteBenchmark(benchmarkId);
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getSiteBenchmark");
    }
  }
}
