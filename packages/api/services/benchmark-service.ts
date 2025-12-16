/**
 * Benchmark management service
 * Handles site-level benchmark catalog, organization-level custom benchmarks,
 * and benchmark enablement with athlete attribute filtering
 */

import { BaseService } from "./base-service";
import { retryAuditLog } from "../utils/audit-retry";
import { db } from "../db";
import crypto from "crypto";
import {
  insertSiteBenchmarkSchema,
  updateSiteBenchmarkSchema,
  insertCustomBenchmarkSchema,
  updateCustomBenchmarkSchema,
  insertTierGroupSchema,
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
  InsertTierGroup,
} from "@shared/schema";

export interface BenchmarkFilters {
  includeInactive?: boolean;
  orgType?: string; // Filter by organization type
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface TierEvaluationResult {
  tierName: string | null;
  tierColor: string | null;
  tierOrder: number | null;
  nextTierName: string | null;
  distanceToNextTier: number | null;
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

      // Create audit log with retry logic
      await retryAuditLog(
        async () => {
          await this.storage.createAuditLog({
            userId: requestingUserId,
            action: 'benchmark_updated',
            resourceType: 'site_benchmark',
            resourceId: benchmarkId,
            details: JSON.stringify(benchmarkData),
            ipAddress: context?.ipAddress || null,
            userAgent: context?.userAgent || null,
          });
        },
        {
          operation: 'benchmark_updated',
          userId: requestingUserId,
          resourceType: 'site_benchmark',
          resourceId: benchmarkId,
        }
      );

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

      // Create audit log BEFORE deletion with retry logic
      await retryAuditLog(
        async () => {
          await this.storage.createAuditLog({
            userId: requestingUserId,
            action: 'benchmark_deleted',
            resourceType: 'site_benchmark',
            resourceId: benchmarkId,
            details: JSON.stringify({ name: benchmark.name }),
            ipAddress: context?.ipAddress || null,
            userAgent: context?.userAgent || null,
          });
        },
        {
          operation: 'benchmark_deleted',
          userId: requestingUserId,
          resourceType: 'site_benchmark',
          resourceId: benchmarkId,
        }
      );

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

      // Create audit log with retry logic
      await retryAuditLog(
        async () => {
          await this.storage.createAuditLog({
            userId: requestingUserId,
            action: isActive ? 'benchmark_enabled' : 'benchmark_disabled',
            resourceType: 'site_benchmark',
            resourceId: benchmarkId,
            details: JSON.stringify({ isActive }),
            ipAddress: context?.ipAddress || null,
            userAgent: context?.userAgent || null,
          });
        },
        {
          operation: isActive ? 'benchmark_enabled' : 'benchmark_disabled',
          userId: requestingUserId,
          resourceType: 'site_benchmark',
          resourceId: benchmarkId,
        }
      );

      return updated;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.toggleSiteBenchmarkStatus");
    }
  }

  /**
   * Get all site benchmarks
   * Supports organization type filtering when orgType is specified
   */
  async getSiteBenchmarks(
    requestingUserId: string,
    filters?: BenchmarkFilters
  ): Promise<SiteBenchmark[]> {
    try {
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);

      const allBenchmarks = await this.storage.getSiteBenchmarks({
        includeInactive: isSiteAdmin && filters?.includeInactive,
      });

      // If organization type filtering is requested, filter benchmarks
      if (filters?.orgType) {
        return allBenchmarks.filter(benchmark => {
          // If benchmark has no applicableOrgTypes restriction, it applies to all org types
          if (!benchmark.applicableOrgTypes || benchmark.applicableOrgTypes.length === 0) {
            return true;
          }
          // Otherwise, check if the requested org type is in the allowed list
          return benchmark.applicableOrgTypes.includes(filters.orgType as any);
        });
      }

      return allBenchmarks;
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

  /**
   * Get tier groups for site benchmarks
   * Returns a list of tier groups with their metric code and tier count
   * Used for populating tier group dropdowns in the benchmark form
   */
  async getSiteTierGroups(metricCode?: string): Promise<Array<{ tierGroupId: string; metricCode: string; tierCount: number }>> {
    try {
      return await this.storage.getSiteTierGroups(metricCode);
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getSiteTierGroups");
    }
  }

  /**
   * Create a tier group (batch creation of related benchmarks)
   * All benchmarks in the group share the same tierGroupId and filters
   * Uses a database transaction to ensure atomicity
   */
  async createTierGroup(
    data: InsertTierGroup,
    createdBy: string,
    context?: RequestContext
  ): Promise<{ tierGroupId: string; benchmarks: SiteBenchmark[] }> {
    try {
      // Verify site admin permission
      if (!(await this.isSiteAdmin(createdBy))) {
        throw new Error("Unauthorized: Only site administrators can create tier groups");
      }

      // Validate input
      const validatedData = insertTierGroupSchema.parse(data);

      // Validate metric exists
      const metric = await this.storage.getSiteMetric(validatedData.metricCode);
      if (!metric) {
        throw new Error(`Metric with code ${validatedData.metricCode} does not exist`);
      }

      // Generate shared tierGroupId
      const tierGroupId = crypto.randomUUID();

      // Create all benchmarks in a transaction
      // Note: tx is unused because storage.createSiteBenchmark doesn't support transaction context
      // TODO: Pass tx to storage layer for true transaction atomicity
      const benchmarks = await db.transaction(async (_tx) => {
        const createdBenchmarks: SiteBenchmark[] = [];

        for (const tier of validatedData.tiers) {
          // Construct benchmark name: "{name} - {tierName}"
          const benchmarkName = `${validatedData.name} - ${tier.tierName}`;

          // Build benchmark data with shared filters
          const benchmarkData: InsertSiteBenchmark = {
            metricCode: validatedData.metricCode,
            name: benchmarkName,
            description: validatedData.description,
            comparisonOperator: validatedData.comparisonOperator,
            benchmarkValue: tier.benchmarkValue,
            minValue: tier.minValue,
            maxValue: tier.maxValue,
            tierGroupId,
            tierOrder: tier.tierOrder,
            tierName: tier.tierName,
            tierColor: tier.tierColor,
            // Shared filters
            gender: validatedData.gender,
            ageMin: validatedData.ageMin,
            ageMax: validatedData.ageMax,
            position: validatedData.position,
            level: validatedData.level,
            applicableOrgTypes: validatedData.applicableOrgTypes,
            isActive: true,
          };

          // Create benchmark within transaction
          const benchmark = await this.storage.createSiteBenchmark(benchmarkData, createdBy);
          createdBenchmarks.push(benchmark);
        }

        return createdBenchmarks;
      });

      // Create audit log for tier group creation
      // Use 'benchmark_created' action as tier groups are batch benchmark creation
      await retryAuditLog(
        async () => {
          await this.storage.createAuditLog({
            userId: createdBy,
            action: 'benchmark_created',
            resourceType: 'site_benchmark',
            resourceId: tierGroupId,
            details: JSON.stringify({
              tierGroup: true,
              name: validatedData.name,
              metricCode: validatedData.metricCode,
              tierCount: validatedData.tiers.length,
              benchmarkIds: benchmarks.map(b => b.id),
            }),
            ipAddress: context?.ipAddress || null,
            userAgent: context?.userAgent || null,
          });
        },
        {
          operation: 'benchmark_created',
          userId: createdBy,
          resourceType: 'site_benchmark',
          resourceId: tierGroupId,
        }
      );

      return { tierGroupId, benchmarks };
    } catch (error) {
      return this.handleError(error, "BenchmarkService.createTierGroup");
    }
  }

  /**
   * Get site benchmarks filtered by the requesting organization's type
   */
  async getSiteBenchmarksForOrganization(
    organizationId: string,
    requestingUserId: string,
    filters?: Omit<BenchmarkFilters, 'orgType'>
  ): Promise<SiteBenchmark[]> {
    try {
      // Get the organization to determine its type
      const organization = await this.storage.getOrganization(organizationId);
      if (!organization) {
        throw new Error("Organization not found");
      }

      // Get benchmarks filtered by organization type
      return await this.getSiteBenchmarks(requestingUserId, {
        ...filters,
        orgType: organization.orgType,
      });
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getSiteBenchmarksForOrganization");
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

      // Auto-enable the custom benchmark for the organization
      // This ensures the benchmark is immediately usable in reports
      await this.storage.enableBenchmarkForOrg(
        validatedData.organizationId,
        benchmark.id,
        'custom'
      );

      // Cycle 9: Create audit log
      // Create audit log with retry logic
      await retryAuditLog(
        async () => {
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
        },
        {
          operation: 'custom_benchmark_created',
          userId: requestingUserId,
          resourceType: 'custom_benchmark',
          resourceId: benchmark.id,
        }
      );

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
      // Create audit log with retry logic
      await retryAuditLog(
        async () => {
          await this.storage.createAuditLog({
            userId: requestingUserId,
            action: 'custom_benchmark_updated',
            resourceType: 'custom_benchmark',
            resourceId: benchmarkId,
            details: JSON.stringify(benchmarkData),
            ipAddress: context?.ipAddress || null,
            userAgent: context?.userAgent || null,
          });
        },
        {
          operation: 'custom_benchmark_updated',
          userId: requestingUserId,
          resourceType: 'custom_benchmark',
          resourceId: benchmarkId,
        }
      );

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
      // Create audit log with retry logic
      await retryAuditLog(
        async () => {
          await this.storage.createAuditLog({
            userId: requestingUserId,
            action: 'custom_benchmark_deleted',
            resourceType: 'custom_benchmark',
            resourceId: benchmarkId,
            details: JSON.stringify({ name: benchmark.name, organizationId }),
            ipAddress: context?.ipAddress || null,
            userAgent: context?.userAgent || null,
          });
        },
        {
          operation: 'custom_benchmark_deleted',
          userId: requestingUserId,
          resourceType: 'custom_benchmark',
          resourceId: benchmarkId,
        }
      );

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
      // Create audit log with retry logic
      await retryAuditLog(
        async () => {
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
        },
        {
          operation: 'org_benchmark_enabled',
          userId: requestingUserId,
          resourceType: 'organization_benchmark',
          resourceId: enabled.id,
        }
      );

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
      // Create audit log with retry logic
      await retryAuditLog(
        async () => {
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
        },
        {
          operation: 'org_benchmark_disabled',
          userId: requestingUserId,
          resourceType: 'organization_benchmark',
          resourceId: disabled.id,
        }
      );

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
   * Evaluate if an athlete's value is within a range benchmark
   * Cycle 20: Returns true when athlete value is within [minValue, maxValue] (inclusive)
   */
  evaluateRangeBenchmark(
    athleteValue: number,
    minValue: number,
    maxValue: number
  ): boolean {
    return athleteValue >= minValue && athleteValue <= maxValue;
  }

  /**
   * Calculate progress percentage for range-based benchmarks
   * Cycle 21: Returns 100% when within range, <100% when outside range
   * - Within range: 100% (meets benchmark)
   * - Below range: percentage based on distance from minValue
   * - Above range: percentage based on distance from maxValue
   */
  getRangeBenchmarkProgress(
    athleteValue: number,
    minValue: number,
    maxValue: number
  ): number {
    // Validate inputs are finite numbers (guards against NaN, Infinity)
    if (!Number.isFinite(athleteValue) || !Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return 0;
    }

    // If within range, benchmark is met (100%)
    if (athleteValue >= minValue && athleteValue <= maxValue) {
      return 100;
    }

    // If below range, calculate how far below
    if (athleteValue < minValue) {
      // Avoid division by zero
      if (minValue === 0) {
        return 0;
      }
      // Progress = (athleteValue / minValue) * 100
      // Example: minValue=25, athlete=20 → (20/25)*100 = 80%
      const progress = (athleteValue / minValue) * 100;
      // Clamp to reasonable bounds (0-100) for display purposes
      return Math.max(0, Math.min(100, progress));
    }

    // If above range, calculate how far above
    // Progress = 100 - ((athleteValue - maxValue) / maxValue * 100)
    // Example: maxValue=30, athlete=35 → 100 - ((35-30)/30*100) = 100 - 16.67 = 83.33%
    if (maxValue === 0) {
      return 0;
    }
    const excessPercentage = ((athleteValue - maxValue) / maxValue) * 100;
    // Clamp to 0 minimum (can't have negative progress)
    return Math.max(0, 100 - excessPercentage);
  }

  /**
   * Evaluate which tier an athlete's value falls into
   * Cycle 23: Tier benchmark evaluation
   *
   * @param athleteValue - The athlete's measured value
   * @param tiers - Array of tier definitions with ranges and metadata
   * @param lowerIsBetter - True for metrics where lower values are better (e.g., time)
   * @returns Tier evaluation result with current tier and distance to next tier
   */
  evaluateTierBenchmark(
    athleteValue: number,
    tiers: Array<{ minValue: number; maxValue: number; tierName: string; tierColor: string; tierOrder: number }>,
    lowerIsBetter: boolean = true
  ): TierEvaluationResult {
    // Sort tiers by tierOrder (1 = best, 2 = second best, etc.)
    const sortedTiers = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);

    // Find the tier that contains the athlete's value
    // When value is exactly at a boundary, prefer the worse tier (higher tierOrder)
    const currentTier = sortedTiers
      .slice()
      .reverse()
      .find(tier => athleteValue >= tier.minValue && athleteValue <= tier.maxValue);

    if (currentTier) {
      // Athlete is within a tier
      const currentTierIndex = sortedTiers.indexOf(currentTier);

      // Check if there's a better tier (lower tierOrder)
      if (currentTierIndex > 0) {
        const nextTier = sortedTiers[currentTierIndex - 1];
        const distance = this.getDistanceToNextTier(
          athleteValue,
          nextTier.minValue,
          nextTier.maxValue,
          lowerIsBetter
        );

        return {
          tierName: currentTier.tierName,
          tierColor: currentTier.tierColor,
          tierOrder: currentTier.tierOrder,
          nextTierName: nextTier.tierName,
          distanceToNextTier: distance,
        };
      } else {
        // Already at best tier
        return {
          tierName: currentTier.tierName,
          tierColor: currentTier.tierColor,
          tierOrder: currentTier.tierOrder,
          nextTierName: null,
          distanceToNextTier: null,
        };
      }
    } else {
      // Athlete is not in any tier - find the next tier to reach
      if (lowerIsBetter) {
        // For lower-is-better metrics (e.g., time), find the worst tier they're slower than
        const nextTier = sortedTiers
          .slice()
          .reverse()
          .find(tier => athleteValue > tier.maxValue);

        if (nextTier) {
          const distance = athleteValue - nextTier.maxValue;
          return {
            tierName: null,
            tierColor: null,
            tierOrder: null,
            nextTierName: nextTier.tierName,
            distanceToNextTier: distance,
          };
        }
      } else {
        // For higher-is-better metrics (e.g., vertical jump), find the worst tier they're below
        const nextTier = sortedTiers
          .slice()
          .reverse()
          .find(tier => athleteValue < tier.minValue);

        if (nextTier) {
          const distance = nextTier.minValue - athleteValue;
          return {
            tierName: null,
            tierColor: null,
            tierOrder: null,
            nextTierName: nextTier.tierName,
            distanceToNextTier: distance,
          };
        }
      }

      // Value is outside all tiers (e.g., above best tier for higher-is-better)
      return {
        tierName: null,
        tierColor: null,
        tierOrder: null,
        nextTierName: null,
        distanceToNextTier: null,
      };
    }
  }

  /**
   * Calculate distance to next tier
   *
   * @param athleteValue - Current athlete value
   * @param nextTierMinValue - Next tier's minimum value
   * @param nextTierMaxValue - Next tier's maximum value
   * @param lowerIsBetter - True for metrics where lower values are better
   * @returns Distance to reach the next tier
   */
  getDistanceToNextTier(
    athleteValue: number,
    nextTierMinValue: number,
    nextTierMaxValue: number,
    lowerIsBetter: boolean
  ): number {
    if (lowerIsBetter) {
      // For lower-is-better, need to reach maxValue of next tier
      return athleteValue - nextTierMaxValue;
    } else {
      // For higher-is-better, need to reach minValue of next tier
      return nextTierMinValue - athleteValue;
    }
  }

  /**
   * Get benchmark status for an athlete
   * Cycle 19: Returns met/unmet status for all applicable benchmarks
   * Cycle 22: Now supports range-based benchmarks
   * Filters benchmarks by athlete attributes (age, gender, position, level)
   */
  async getAthleteBenchmarkStatus(
    athleteId: string,
    organizationId: string
  ): Promise<Array<{
    benchmarkId: string;
    benchmarkName: string;
    metricCode: string;
    benchmarkValue: number | null;
    comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
    minValue?: number | null;
    maxValue?: number | null;
    athleteValue: number | null;
    isMet: boolean;
    progress: number;
    source: string;  // "Global" for site benchmarks, org name for custom benchmarks
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

      // Get organization name for custom benchmarks
      const organization = await this.storage.getOrganization(organizationId);
      const orgName = organization?.name || 'Organization';

      // Combine all benchmarks with source info
      const siteBenchmarksWithSource = siteBenchmarks.map(b => ({ ...b, source: 'Global' }));
      const customBenchmarksWithSource = customBenchmarks
        .filter(b => customBenchmarkIds.includes(b.id))
        .map(b => ({ ...b, source: orgName }));

      const allBenchmarks = [
        ...siteBenchmarksWithSource,
        ...customBenchmarksWithSource
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
          if (benchmark.comparisonOperator === 'range') {
            // Range-based benchmark evaluation
            const minValue = typeof benchmark.minValue === 'string'
              ? parseFloat(benchmark.minValue)
              : benchmark.minValue ?? 0;
            const maxValue = typeof benchmark.maxValue === 'string'
              ? parseFloat(benchmark.maxValue)
              : benchmark.maxValue ?? 0;

            isMet = this.evaluateRangeBenchmark(athleteValue, minValue, maxValue);
            progress = this.getRangeBenchmarkProgress(athleteValue, minValue, maxValue);
          } else {
            // Single-value benchmark evaluation (lte, gte, eq)
            const benchmarkValue = typeof benchmark.benchmarkValue === 'string'
              ? parseFloat(benchmark.benchmarkValue)
              : benchmark.benchmarkValue ?? 0;

            isMet = this.evaluateBenchmark(athleteValue, benchmarkValue, benchmark.comparisonOperator as 'lte' | 'gte' | 'eq');
            progress = this.getBenchmarkProgress(athleteValue, benchmarkValue, benchmark.comparisonOperator as 'lte' | 'gte' | 'eq');
          }
        }

        return {
          benchmarkId: benchmark.id,
          benchmarkName: benchmark.name,
          metricCode: benchmark.metricCode,
          benchmarkValue: benchmark.benchmarkValue
            ? (typeof benchmark.benchmarkValue === 'string'
              ? parseFloat(benchmark.benchmarkValue)
              : benchmark.benchmarkValue)
            : null,
          comparisonOperator: benchmark.comparisonOperator as 'lte' | 'gte' | 'eq' | 'range',
          minValue: benchmark.minValue
            ? (typeof benchmark.minValue === 'string'
              ? parseFloat(benchmark.minValue)
              : benchmark.minValue)
            : null,
          maxValue: benchmark.maxValue
            ? (typeof benchmark.maxValue === 'string'
              ? parseFloat(benchmark.maxValue)
              : benchmark.maxValue)
            : null,
          athleteValue,
          isMet,
          progress,
          source: benchmark.source,
        };
      });

      return status;
    } catch (error) {
      return this.handleError(error, "BenchmarkService.getAthleteBenchmarkStatus");
    }
  }
}
