/**
 * Benchmark management service
 * Handles site-level benchmark catalog, organization-level custom benchmarks,
 * and benchmark enablement with athlete attribute filtering
 */

import { BaseService } from "./base-service";
import { retryAuditLog } from "../utils/audit-retry";
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
  OrganizationBenchmarkWithDetails,
} from "@shared/schema";

export interface BenchmarkFilters {
  includeInactive?: boolean;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
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
    requestingUserId: string,
    context?: RequestContext
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

      // Cycle 3: Create audit log with retry logic
      await retryAuditLog(
        async () => {
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
            ipAddress: context?.ipAddress || null,
            userAgent: context?.userAgent || null,
          });
        },
        {
          operation: 'benchmark_created',
          userId: requestingUserId,
          resourceType: 'site_benchmark',
          resourceId: benchmark.id,
        }
      );

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
    requestingUserId: string,
    context?: RequestContext
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
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);

        // Security: Block operation in production if audit log fails
        if (process.env.NODE_ENV === 'production') {
          console.error('SECURITY ALERT: Audit log failure - blocking operation', {
            operation: 'audit_log_failure',
            userId: requestingUserId,
            error: auditError instanceof Error ? auditError.message : 'Unknown error',
          });
          throw new Error('Failed to create audit log - operation blocked for security');
        }
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
    requestingUserId: string,
    context?: RequestContext
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

      // Create audit log BEFORE deletion with production safety check
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'benchmark_deleted',
          resourceType: 'site_benchmark',
          resourceId: benchmarkId,
          details: JSON.stringify({ name: benchmark.name }),
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);

        // Security: Block operation in production if audit log fails - prevent deletion
        if (process.env.NODE_ENV === 'production') {
          console.error('SECURITY ALERT: Audit log failure - blocking operation', {
            operation: 'audit_log_failure',
            userId: requestingUserId,
            error: auditError instanceof Error ? auditError.message : 'Unknown error',
          });
          throw new Error('Failed to create audit log - operation blocked for security');
        }
      }

      // Delete benchmark AFTER audit log is created (storage layer also validates)
      await this.storage.deleteSiteBenchmark(benchmarkId);
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
    requestingUserId: string,
    context?: RequestContext
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
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);

        // Security: Block operation in production if audit log fails
        if (process.env.NODE_ENV === 'production') {
          console.error('SECURITY ALERT: Audit log failure - blocking operation', {
            operation: 'audit_log_failure',
            userId: requestingUserId,
            error: auditError instanceof Error ? auditError.message : 'Unknown error',
          });
          throw new Error('Failed to create audit log - operation blocked for security');
        }
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

  // ========================================================================
  // CUSTOM BENCHMARKS (Org Admin + Site Admin)
  // ========================================================================

  /**
   * Create a new custom benchmark (org admin OR site admin)
   * Cycle 7: Requires org admin or site admin permission
   * Cycle 8: Validates allow_custom_benchmarks feature flag
   * Cycle 9: Creates audit log
   */
  async createCustomBenchmark(
    benchmarkData: InsertCustomBenchmark,
    requestingUserId: string,
    context?: RequestContext
  ): Promise<CustomBenchmark> {
    try {
      // Cycle 7: Verify org admin OR site admin permission
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      const hasOrgAccess = await this.validateOrganizationAccess(
        requestingUserId,
        benchmarkData.organizationId,
        isSiteAdmin
      );

      if (!hasOrgAccess && !isSiteAdmin) {
        throw new Error("Unauthorized: Only organization administrators or site administrators can create custom benchmarks");
      }

      // Validate input
      const validatedData = insertCustomBenchmarkSchema.parse(benchmarkData);

      // Cycle 8: Check if custom benchmarks are allowed for this organization
      const organization = await this.storage.getOrganization(validatedData.organizationId);
      if (!organization) {
        throw new Error(`Organization with id ${validatedData.organizationId} not found`);
      }

      if (!organization.allowCustomBenchmarks) {
        throw new Error(`Custom benchmarks are not allowed for organization ${organization.name}`);
      }

      // Validate metric exists
      const metric = await this.storage.getSiteMetric(validatedData.metricCode);
      if (!metric) {
        throw new Error(`Metric with code ${validatedData.metricCode} does not exist`);
      }

      // Create benchmark
      const benchmark = await this.storage.createCustomBenchmark(validatedData, requestingUserId);

      // Cycle 9: Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'custom_benchmark_created',
          resourceType: 'custom_benchmark',
          resourceId: benchmark.id,
          details: JSON.stringify({
            name: benchmark.name,
            metricCode: benchmark.metricCode,
            organizationId: benchmark.organizationId,
            benchmarkValue: benchmark.benchmarkValue,
          }),
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);

        // Security: Block operation in production if audit log fails
        if (process.env.NODE_ENV === 'production') {
          console.error('SECURITY ALERT: Audit log failure - blocking operation', {
            operation: 'audit_log_failure',
            userId: requestingUserId,
            error: auditError instanceof Error ? auditError.message : 'Unknown error',
          });
          throw new Error('Failed to create audit log - operation blocked for security');
        }
      }

      return benchmark;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.createCustomBenchmark");
    }
  }

  /**
   * Update a custom benchmark (owner org admin OR site admin)
   * Cycle 10: Only allows owner org or site admin
   */
  async updateCustomBenchmark(
    organizationId: string,
    benchmarkId: string,
    benchmarkData: Partial<UpdateCustomBenchmark>,
    requestingUserId: string,
    context?: RequestContext
  ): Promise<CustomBenchmark> {
    try {
      // Cycle 10: Verify owner org admin OR site admin permission
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      const hasOrgAccess = await this.validateOrganizationAccess(
        requestingUserId,
        organizationId,
        isSiteAdmin
      );

      if (!hasOrgAccess && !isSiteAdmin) {
        throw new Error("Unauthorized: Only the owning organization administrators or site administrators can update custom benchmarks");
      }

      // Validate input if provided fields
      if (Object.keys(benchmarkData).length > 0) {
        updateCustomBenchmarkSchema.parse(benchmarkData);
      }

      // Update benchmark (storage layer validates ownership)
      const updated = await this.storage.updateCustomBenchmark(organizationId, benchmarkId, benchmarkData);

      // Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'custom_benchmark_updated',
          resourceType: 'custom_benchmark',
          resourceId: benchmarkId,
          details: JSON.stringify(benchmarkData),
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);

        // Security: Block operation in production if audit log fails
        if (process.env.NODE_ENV === 'production') {
          console.error('SECURITY ALERT: Audit log failure - blocking operation', {
            operation: 'audit_log_failure',
            userId: requestingUserId,
            error: auditError instanceof Error ? auditError.message : 'Unknown error',
          });
          throw new Error('Failed to create audit log - operation blocked for security');
        }
      }

      return updated;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.updateCustomBenchmark");
    }
  }

  /**
   * Delete a custom benchmark (owner org admin OR site admin)
   * Cycle 11: Only allows owner org or site admin
   */
  async deleteCustomBenchmark(
    organizationId: string,
    benchmarkId: string,
    requestingUserId: string,
    context?: RequestContext
  ): Promise<void> {
    try {
      // Cycle 11: Verify owner org admin OR site admin permission
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      const hasOrgAccess = await this.validateOrganizationAccess(
        requestingUserId,
        organizationId,
        isSiteAdmin
      );

      if (!hasOrgAccess && !isSiteAdmin) {
        throw new Error("Unauthorized: Only the owning organization administrators or site administrators can delete custom benchmarks");
      }

      // Get benchmark for audit log BEFORE deletion
      const benchmarks = await this.storage.getCustomBenchmarksForOrg(organizationId);
      const benchmark = benchmarks.find(b => b.id === benchmarkId);

      if (!benchmark) {
        throw new Error(`Custom benchmark ${benchmarkId} not found for organization ${organizationId}`);
      }

      // Create audit log BEFORE deletion with production safety check
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'custom_benchmark_deleted',
          resourceType: 'custom_benchmark',
          resourceId: benchmarkId,
          details: JSON.stringify({ name: benchmark.name, organizationId }),
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
        // In production, audit trail is mandatory for compliance - prevent deletion
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Failed to create audit trail for custom benchmark deletion. Operation aborted for compliance.');
        }
      }

      // Delete benchmark AFTER audit log is created (storage layer validates ownership)
      await this.storage.deleteCustomBenchmark(organizationId, benchmarkId);
    } catch (error) {
      return this.handleError(error, "BenchmarkService.deleteCustomBenchmark");
    }
  }

  /**
   * Get all custom benchmarks for an organization
   */
  async getCustomBenchmarksForOrg(
    organizationId: string,
    requestingUserId: string,
    filters?: BenchmarkFilters
  ): Promise<CustomBenchmark[]> {
    try {
      // Verify organization exists first (even for site admins)
      const org = await this.storage.getOrganization(organizationId);
      if (!org) {
        throw new Error(`Organization not found: ${organizationId}`);
      }

      // Verify org access
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      const hasOrgAccess = await this.validateOrganizationAccess(
        requestingUserId,
        organizationId,
        isSiteAdmin
      );

      if (!hasOrgAccess && !isSiteAdmin) {
        throw new Error("Unauthorized: Cannot access custom benchmarks for this organization");
      }

      return await this.storage.getCustomBenchmarksForOrg(organizationId, filters);
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getCustomBenchmarksForOrg");
    }
  }

  // ========================================================================
  // BENCHMARK ENABLEMENT (Org Admin + Site Admin)
  // ========================================================================

  /**
   * Enable a benchmark for an organization (org admin OR site admin)
   * Cycle 12: Requires org admin or site admin permission
   * Cycle 13: Validates benchmarks_enabled feature flag
   */
  async enableBenchmarkForOrg(
    organizationId: string,
    benchmarkId: string,
    benchmarkType: 'site' | 'custom',
    requestingUserId: string,
    context?: RequestContext
  ): Promise<OrganizationBenchmark> {
    try {
      // Cycle 12: Verify org admin OR site admin permission
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      const hasOrgAccess = await this.validateOrganizationAccess(
        requestingUserId,
        organizationId,
        isSiteAdmin
      );

      if (!hasOrgAccess && !isSiteAdmin) {
        throw new Error("Unauthorized: Only organization administrators or site administrators can enable benchmarks");
      }

      // Cycle 13: Check if benchmarks are enabled for this organization
      const organization = await this.storage.getOrganization(organizationId);
      if (!organization) {
        throw new Error(`Organization with id ${organizationId} not found`);
      }

      if (!organization.benchmarksEnabled) {
        throw new Error(`Benchmarks are not enabled for organization ${organization.name}`);
      }

      // Enable benchmark
      const enabled = await this.storage.enableBenchmarkForOrg(organizationId, benchmarkId, benchmarkType);

      // Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'org_benchmark_enabled',
          resourceType: 'organization_benchmark',
          resourceId: enabled.id,
          details: JSON.stringify({
            organizationId,
            benchmarkId,
            benchmarkType,
          }),
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);

        // Security: Block operation in production if audit log fails
        if (process.env.NODE_ENV === 'production') {
          console.error('SECURITY ALERT: Audit log failure - blocking operation', {
            operation: 'audit_log_failure',
            userId: requestingUserId,
            error: auditError instanceof Error ? auditError.message : 'Unknown error',
          });
          throw new Error('Failed to create audit log - operation blocked for security');
        }
      }

      return enabled;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.enableBenchmarkForOrg");
    }
  }

  /**
   * Disable a benchmark for an organization (org admin OR site admin)
   * Cycle 14: Requires org admin or site admin permission
   */
  async disableBenchmarkForOrg(
    organizationId: string,
    benchmarkId: string,
    benchmarkType: 'site' | 'custom',
    requestingUserId: string,
    context?: RequestContext
  ): Promise<OrganizationBenchmark> {
    try {
      // Cycle 14: Verify org admin OR site admin permission
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      const hasOrgAccess = await this.validateOrganizationAccess(
        requestingUserId,
        organizationId,
        isSiteAdmin
      );

      if (!hasOrgAccess && !isSiteAdmin) {
        throw new Error("Unauthorized: Only organization administrators or site administrators can disable benchmarks");
      }

      // Disable benchmark
      const disabled = await this.storage.disableBenchmarkForOrg(organizationId, benchmarkId, benchmarkType);

      // Create audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'org_benchmark_disabled',
          resourceType: 'organization_benchmark',
          resourceId: disabled.id,
          details: JSON.stringify({
            organizationId,
            benchmarkId,
          }),
          ipAddress: context?.ipAddress || null,
          userAgent: context?.userAgent || null,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);

        // Security: Block operation in production if audit log fails
        if (process.env.NODE_ENV === 'production') {
          console.error('SECURITY ALERT: Audit log failure - blocking operation', {
            operation: 'audit_log_failure',
            userId: requestingUserId,
            error: auditError instanceof Error ? auditError.message : 'Unknown error',
          });
          throw new Error('Failed to create audit log - operation blocked for security');
        }
      }

      return disabled;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.disableBenchmarkForOrg");
    }
  }

  /**
   * Get all enabled benchmarks for an organization with full benchmark details
   */
  async getOrganizationBenchmarks(
    organizationId: string,
    requestingUserId: string,
    filters?: BenchmarkFilters
  ): Promise<OrganizationBenchmarkWithDetails[]> {
    try {
      // Verify org access
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      const hasOrgAccess = await this.validateOrganizationAccess(
        requestingUserId,
        organizationId,
        isSiteAdmin
      );

      if (!hasOrgAccess && !isSiteAdmin) {
        throw new Error("Unauthorized: Cannot access benchmarks for this organization");
      }

      // Get organization benchmarks with full details in a single query (optimized to avoid N+1 problem)
      const enrichedBenchmarks = await this.storage.getOrganizationBenchmarksWithDetails(organizationId, filters);

      return enrichedBenchmarks;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getOrganizationBenchmarks");
    }
  }

  // ========================================================================
  // EVALUATION LOGIC (Cycles 15-19)
  // ========================================================================

  /**
   * Evaluate if an athlete's value meets a benchmark
   * Cycle 15: Handles 'lte' operator (lower is better)
   * Cycle 16: Handles 'gte' operator (higher is better)
   * Cycle 17: Handles 'eq' operator (exact match)
   */
  evaluateBenchmark(
    athleteValue: number,
    benchmarkValue: number,
    operator: 'lte' | 'gte' | 'eq'
  ): boolean {
    switch (operator) {
      case 'lte':
        return athleteValue <= benchmarkValue;
      case 'gte':
        return athleteValue >= benchmarkValue;
      case 'eq':
        return athleteValue === benchmarkValue;
      default:
        throw new Error(`Invalid comparison operator: ${operator}`);
    }
  }

  /**
   * Calculate progress percentage towards a benchmark
   * Cycle 18: Calculates percentage for lte/gte/eq operators
   * Returns 100 for exactly meeting goal, >100 for exceeding, <100 for not meeting
   */
  getBenchmarkProgress(
    athleteValue: number,
    benchmarkValue: number,
    operator: 'lte' | 'gte' | 'eq'
  ): number {
    if (operator === 'eq') {
      // For exact match, return 100 if met, 0 if not met
      return athleteValue === benchmarkValue ? 100 : 0;
    }

    if (benchmarkValue === 0) {
      // Avoid division by zero
      return athleteValue === 0 ? 100 : 0;
    }

    if (operator === 'lte') {
      // Lower is better: progress = (benchmarkValue / athleteValue) * 100
      // If athlete is 0.90 and benchmark is 1.00: (1.00 / 0.90) * 100 = 111.1%
      // If athlete is 1.10 and benchmark is 1.00: (1.00 / 1.10) * 100 = 90.9%
      return (benchmarkValue / athleteValue) * 100;
    } else {
      // gte: Higher is better: progress = (athleteValue / benchmarkValue) * 100
      // If athlete is 33 and benchmark is 30: (33 / 30) * 100 = 110%
      // If athlete is 27 and benchmark is 30: (27 / 30) * 100 = 90%
      return (athleteValue / benchmarkValue) * 100;
    }
  }

  /**
   * Get benchmark status for an athlete
   * Cycle 19: Returns met/unmet status for all applicable benchmarks
   * Filters benchmarks by athlete attributes (age, gender, position, level)
   */
  async getAthleteBenchmarkStatus(
    athleteId: string,
    organizationId: string
  ): Promise<Array<{
    benchmarkId: string;
    benchmarkName: string;
    metricCode: string;
    benchmarkValue: number;
    comparisonOperator: 'lte' | 'gte' | 'eq';
    athleteValue: number | null;
    isMet: boolean;
    progress: number;
  }>> {
    try {
      // Get athlete details
      const athlete = await this.storage.getUser(athleteId);
      if (!athlete) {
        throw new Error(`Athlete with id ${athleteId} not found`);
      }

      // Calculate athlete age if birthDate is available
      let athleteAge: number | null = null;
      if (athlete.birthDate) {
        const today = new Date();
        const birthDate = new Date(athlete.birthDate);
        athleteAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          athleteAge--;
        }
      }

      // Get all enabled benchmarks for the organization
      const orgBenchmarks = await this.storage.getOrganizationBenchmarks(organizationId);

      // Get site and custom benchmarks
      const siteBenchmarkIds = orgBenchmarks
        .filter(ob => ob.benchmarkType === 'site' && ob.isEnabled)
        .map(ob => ob.benchmarkId);
      const customBenchmarkIds = orgBenchmarks
        .filter(ob => ob.benchmarkType === 'custom' && ob.isEnabled)
        .map(ob => ob.benchmarkId);

      const siteBenchmarks = siteBenchmarkIds.length > 0
        ? await this.storage.getSiteBenchmarksByIds(siteBenchmarkIds)
        : [];
      const customBenchmarks = await this.storage.getCustomBenchmarksForOrg(organizationId);

      // Combine all benchmarks
      const allBenchmarks = [
        ...siteBenchmarks,
        ...customBenchmarks.filter(b => customBenchmarkIds.includes(b.id))
      ];

      // Filter benchmarks by athlete attributes
      const applicableBenchmarks = allBenchmarks.filter(benchmark => {
        // Age filter
        if (benchmark.ageMin !== null && athleteAge !== null && athleteAge < benchmark.ageMin) {
          return false;
        }
        if (benchmark.ageMax !== null && athleteAge !== null && athleteAge > benchmark.ageMax) {
          return false;
        }

        // Gender filter
        if (benchmark.gender !== null && athlete.gender !== null && benchmark.gender !== athlete.gender) {
          return false;
        }

        // Position filter (athlete.positions is array)
        if (benchmark.position !== null && athlete.positions && athlete.positions.length > 0) {
          if (!athlete.positions.includes(benchmark.position)) {
            return false;
          }
        }

        // Level filter (not currently in users table - skip for now)
        // TODO: Add level field to users table if needed
        // if (benchmark.level !== null && athlete.level !== null && benchmark.level !== athlete.level) {
        //   return false;
        // }

        return true;
      });

      // Get latest measurements for each metric
      const measurements = await this.storage.getMeasurements({ userId: athleteId });

      // Group measurements by metric and get latest for each
      const latestMeasurements = new Map<string, number>();
      for (const measurement of measurements) {
        const existing = latestMeasurements.get(measurement.metric);
        if (!existing) {
          // Parse value from decimal string to number
          const value = typeof measurement.value === 'string'
            ? parseFloat(measurement.value)
            : measurement.value;
          latestMeasurements.set(measurement.metric, value);
        }
        // Assuming measurements are already sorted by date (newest first)
      }

      // Evaluate each benchmark
      const status = applicableBenchmarks.map(benchmark => {
        const athleteValue = latestMeasurements.get(benchmark.metricCode) ?? null;

        let isMet = false;
        let progress = 0;

        if (athleteValue !== null) {
          const benchmarkValue = typeof benchmark.benchmarkValue === 'string'
            ? parseFloat(benchmark.benchmarkValue)
            : benchmark.benchmarkValue;

          isMet = this.evaluateBenchmark(athleteValue, benchmarkValue, benchmark.comparisonOperator as 'lte' | 'gte' | 'eq');
          progress = this.getBenchmarkProgress(athleteValue, benchmarkValue, benchmark.comparisonOperator as 'lte' | 'gte' | 'eq');
        }

        return {
          benchmarkId: benchmark.id,
          benchmarkName: benchmark.name,
          metricCode: benchmark.metricCode,
          benchmarkValue: typeof benchmark.benchmarkValue === 'string'
            ? parseFloat(benchmark.benchmarkValue)
            : benchmark.benchmarkValue,
          comparisonOperator: benchmark.comparisonOperator as 'lte' | 'gte' | 'eq',
          athleteValue,
          isMet,
          progress,
        };
      });

      return status;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getAthleteBenchmarkStatus");
    }
  }
}
