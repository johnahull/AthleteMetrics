/**
 * Metric management service
 * Handles site-level metric catalog and organization-level metric enablement
 */

import { BaseService } from "./base-service";
import { insertSiteMetricSchema, updateSiteMetricSchema } from "@shared/schema";
import type {
  SiteMetric,
  InsertSiteMetric,
  UpdateSiteMetric,
  OrganizationMetric,
  UpdateOrganizationMetric,
} from "@shared/schema";
import { validateFormula, detectCircularDependencies } from "./formula-service";

export interface SiteMetricFilters {
  includeInactive?: boolean;
  orgType?: string; // Filter by organization type
}

export interface OrganizationMetricFilters {
  enabledOnly?: boolean;
}

export class MetricService extends BaseService {
  // ========================================================================
  // SITE METRICS (Site Admin Only)
  // ========================================================================

  /**
   * Get all site metrics (master catalog)
   * By default, only returns active metrics unless includeInactive is true
   * Supports organization type filtering when orgType is specified
   */
  async getSiteMetrics(
    requestingUserId: string,
    filters?: SiteMetricFilters
  ): Promise<SiteMetric[]> {
    try {
      // Site admins can see all metrics (including inactive)
      // Regular users only see active metrics
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);

      const allMetrics = await this.storage.getSiteMetrics({
        includeInactive: isSiteAdmin && filters?.includeInactive,
      });

      // If organization type filtering is requested, filter metrics
      if (filters?.orgType) {
        return allMetrics.filter(metric => {
          // If metric has no availableOrgTypes restriction, it's available to all org types
          if (!metric.availableOrgTypes || metric.availableOrgTypes.length === 0) {
            return true;
          }
          // Otherwise, check if the requested org type is in the allowed list
          return metric.availableOrgTypes.includes(filters.orgType as any);
        });
      }

      return allMetrics;
    } catch (error) {
      return this.handleError(error, "MetricService.getSiteMetrics");
    }
  }

  /**
   * Get a specific site metric by code
   */
  async getSiteMetric(code: string): Promise<SiteMetric | undefined> {
    try {
      return await this.storage.getSiteMetric(code);
    } catch (error) {
      return this.handleError(error, "MetricService.getSiteMetric");
    }
  }

  /**
   * Get site metrics filtered by the requesting organization's type
   */
  async getSiteMetricsForOrganization(
    organizationId: string,
    requestingUserId: string,
    filters?: Omit<SiteMetricFilters, 'orgType'>
  ): Promise<SiteMetric[]> {
    try {
      // Get the organization to determine its type
      const organization = await this.storage.getOrganization(organizationId);
      if (!organization) {
        throw new Error("Organization not found");
      }

      // Get metrics filtered by organization type
      return await this.getSiteMetrics(requestingUserId, {
        ...filters,
        orgType: organization.orgType,
      });
    } catch (error) {
      return this.handleError(error, "MetricService.getSiteMetricsForOrganization");
    }
  }

  /**
   * Create a new site metric (site admin only)
   */
  async createSiteMetric(
    metricData: InsertSiteMetric,
    requestingUserId: string
  ): Promise<SiteMetric> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can create metrics");
      }

      // Validate input
      const validatedData = insertSiteMetricSchema.parse(metricData);

      // Check for duplicate code
      const existing = await this.storage.getSiteMetric(validatedData.code);
      if (existing) {
        throw new Error(`Metric with code ${validatedData.code} already exists`);
      }

      // DERIVED METRIC VALIDATION
      // If metric is being created as derived, validate formula requirements
      if (validatedData.isDerived === true) {
        if (!validatedData.formula || validatedData.formula.trim() === '') {
          throw new Error("Formula is required for derived metrics");
        }

        // Get all available metric codes (excluding this one since it's being created)
        const allMetrics = await this.storage.getSiteMetrics({ includeInactive: false });
        const availableCodes = allMetrics.map(m => m.code);

        // Validate formula syntax
        const formulaValidation = validateFormula(validatedData.formula, availableCodes);
        if (!formulaValidation.valid) {
          throw new Error(`Invalid formula: ${formulaValidation.errors.join(', ')}`);
        }

        // Set dependentMetrics from formula validation if not explicitly provided
        if (!validatedData.dependentMetrics || validatedData.dependentMetrics.length === 0) {
          validatedData.dependentMetrics = formulaValidation.referencedMetrics;
        }

        // Check for circular dependencies
        // Create a hypothetical metric list with the new metric
        const hypotheticalMetrics = [
          ...allMetrics.map(m => ({
            code: m.code,
            dependentMetrics: m.dependentMetrics || []
          })),
          {
            code: validatedData.code,
            dependentMetrics: validatedData.dependentMetrics || []
          }
        ];

        const circularCheck = detectCircularDependencies(hypotheticalMetrics);
        if (circularCheck.hasCircular) {
          throw new Error(`Circular dependency detected: ${circularCheck.cycle?.join(' → ')}`);
        }
      }

      // Create metric
      const metric = await this.storage.createSiteMetric(validatedData, requestingUserId);

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'metric_created',
          resourceType: 'site_metric',
          resourceId: metric.code,
          details: JSON.stringify({
            code: metric.code,
            label: metric.label,
            category: metric.category,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        // Log audit failure but don't fail the operation
        console.error('CRITICAL: Failed to create audit log for metric_created:', {
          error: auditError,
          userId: requestingUserId,
          resourceId: metric.code,
        });
      }

      return metric;
    } catch (error) {
      return this.handleError(error, "MetricService.createSiteMetric");
    }
  }

  /**
   * Update an existing site metric (site admin only)
   */
  async updateSiteMetric(
    code: string,
    metricData: Partial<UpdateSiteMetric>,
    requestingUserId: string
  ): Promise<SiteMetric> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can update metrics");
      }

      // Validate input
      const validatedData = updateSiteMetricSchema.parse(metricData);

      // DERIVED METRIC VALIDATION
      // If metric is being marked as derived, validate formula requirements
      if (validatedData.isDerived === true) {
        if (!validatedData.formula || validatedData.formula.trim() === '') {
          throw new Error("Formula is required for derived metrics");
        }

        // Get all available metric codes (excluding this one to allow self-updates)
        const allMetrics = await this.storage.getSiteMetrics({ includeInactive: false });
        const availableCodes = allMetrics
          .map(m => m.code)
          .filter(c => c !== code);

        // Validate formula syntax
        const formulaValidation = validateFormula(validatedData.formula, availableCodes);
        if (!formulaValidation.valid) {
          throw new Error(`Invalid formula: ${formulaValidation.errors.join(', ')}`);
        }

        // Set dependentMetrics from formula validation if not explicitly provided
        if (validatedData.dependentMetrics === undefined) {
          validatedData.dependentMetrics = formulaValidation.referencedMetrics;
        }

        // Check for circular dependencies
        // Create a hypothetical metric list with the updated metric
        const existingMetric = await this.storage.getSiteMetric(code);
        const hypotheticalMetrics = allMetrics
          .map(m => m.code === code ? {
            code: code,
            dependentMetrics: validatedData.dependentMetrics || []
          } : {
            code: m.code,
            dependentMetrics: m.dependentMetrics || []
          });

        const circularCheck = detectCircularDependencies(hypotheticalMetrics);
        if (circularCheck.hasCircular) {
          throw new Error(`Circular dependency detected: ${circularCheck.cycle?.join(' → ')}`);
        }
      }

      // Update metric
      const metric = await this.storage.updateSiteMetric(code, validatedData);

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'metric_updated',
          resourceType: 'site_metric',
          resourceId: code,
          details: JSON.stringify({
            changes: validatedData,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('CRITICAL: Failed to create audit log for metric_updated:', {
          error: auditError,
          userId: requestingUserId,
          resourceId: code,
        });
      }

      return metric;
    } catch (error) {
      return this.handleError(error, "MetricService.updateSiteMetric");
    }
  }

  /**
   * Toggle metric active status (site admin only)
   * Disabling a metric hides it from all organizations but preserves measurement data
   */
  async toggleSiteMetricStatus(
    code: string,
    isActive: boolean,
    requestingUserId: string
  ): Promise<SiteMetric> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can toggle metric status");
      }

      // Check if metric exists
      const metric = await this.storage.getSiteMetric(code);
      if (!metric) {
        throw new Error(`Metric with code ${code} not found`);
      }

      // Update status
      const updated = await this.storage.toggleSiteMetricStatus(code, isActive);

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: isActive ? 'metric_enabled' : 'metric_disabled',
          resourceType: 'site_metric',
          resourceId: code,
          details: JSON.stringify({
            code,
            label: metric.label,
            isActive,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('CRITICAL: Failed to create audit log for metric status toggle:', {
          error: auditError,
          userId: requestingUserId,
          resourceId: code,
          action: isActive ? 'metric_enabled' : 'metric_disabled',
        });
      }

      return updated;
    } catch (error) {
      return this.handleError(error, "MetricService.toggleSiteMetricStatus");
    }
  }

  /**
   * Delete a site metric (site admin only)
   * Only allowed if metric has no measurement data and is not a system default
   */
  async deleteSiteMetric(code: string, requestingUserId: string): Promise<void> {
    try {
      // Verify permissions
      if (!(await this.isSiteAdmin(requestingUserId))) {
        throw new Error("Unauthorized: Only site administrators can delete metrics");
      }

      // Get metric details for audit log
      const metric = await this.storage.getSiteMetric(code);
      if (!metric) {
        throw new Error(`Metric with code ${code} not found`);
      }

      // Delete metric (storage layer handles validation)
      await this.storage.deleteSiteMetric(code);

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'metric_deleted',
          resourceType: 'site_metric',
          resourceId: code,
          details: JSON.stringify({
            code,
            label: metric.label,
            category: metric.category,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('CRITICAL: Failed to create audit log for metric_deleted:', {
          error: auditError,
          userId: requestingUserId,
          resourceId: code,
        });
      }
    } catch (error) {
      return this.handleError(error, "MetricService.deleteSiteMetric");
    }
  }

  // ========================================================================
  // ORGANIZATION METRICS (Org Admin + Site Admin)
  // ========================================================================

  /**
   * Get all metrics enabled for an organization
   * Returns metrics with their site metric details
   */
  async getOrganizationMetrics(
    organizationId: string,
    requestingUserId: string,
    filters?: OrganizationMetricFilters
  ): Promise<(OrganizationMetric & { siteMetric: SiteMetric })[]> {
    try {
      // Verify access to organization
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      if (!isSiteAdmin) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId,
          organizationId,
          false
        );
        if (!hasAccess) {
          throw new Error(`Unauthorized: No access to organization ${organizationId}`);
        }
      }

      return await this.storage.getOrganizationMetrics(organizationId, filters);
    } catch (error) {
      return this.handleError(error, "MetricService.getOrganizationMetrics");
    }
  }

  /**
   * Enable a metric for an organization (org admin or site admin)
   */
  async enableMetricForOrganization(
    organizationId: string,
    metricCode: string,
    requestingUserId: string
  ): Promise<OrganizationMetric> {
    try {
      // Verify access to organization
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      if (!isSiteAdmin) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId,
          organizationId,
          false
        );
        if (!hasAccess) {
          throw new Error(`Unauthorized: No access to organization ${organizationId}`);
        }
      }

      // Verify metric exists and is active
      const metric = await this.storage.getSiteMetric(metricCode);
      if (!metric) {
        throw new Error(`Metric with code ${metricCode} not found`);
      }
      if (!metric.isActive) {
        throw new Error(`Metric ${metricCode} is not active and cannot be enabled for organizations`);
      }

      // Enable metric
      const orgMetric = await this.storage.enableMetricForOrganization(organizationId, metricCode);

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'org_metric_enabled',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            metricCode,
            metricLabel: metric.label,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('CRITICAL: Failed to create audit log for org_metric_enabled:', {
          error: auditError,
          userId: requestingUserId,
          organizationId,
          metricCode,
        });
      }

      return orgMetric;
    } catch (error) {
      return this.handleError(error, "MetricService.enableMetricForOrganization");
    }
  }

  /**
   * Disable a metric for an organization (org admin or site admin)
   * Does NOT delete measurement data, only hides metric from future use
   */
  async disableMetricForOrganization(
    organizationId: string,
    metricCode: string,
    requestingUserId: string
  ): Promise<OrganizationMetric> {
    try {
      // Verify access to organization
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      if (!isSiteAdmin) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId,
          organizationId,
          false
        );
        if (!hasAccess) {
          throw new Error(`Unauthorized: No access to organization ${organizationId}`);
        }
      }

      // Disable metric
      const orgMetric = await this.storage.disableMetricForOrganization(organizationId, metricCode);

      // Get metric details for audit log
      const metric = await this.storage.getSiteMetric(metricCode);

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'org_metric_disabled',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            metricCode,
            metricLabel: metric?.label || metricCode,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('CRITICAL: Failed to create audit log for org_metric_disabled:', {
          error: auditError,
          userId: requestingUserId,
          organizationId,
          metricCode,
        });
      }

      return orgMetric;
    } catch (error) {
      return this.handleError(error, "MetricService.disableMetricForOrganization");
    }
  }

  /**
   * Update organization metric settings (org admin or site admin)
   * Allows customizing display order and custom labels
   */
  async updateOrganizationMetric(
    organizationId: string,
    metricCode: string,
    data: Partial<UpdateOrganizationMetric>,
    requestingUserId: string
  ): Promise<OrganizationMetric> {
    try {
      // Verify access to organization
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      if (!isSiteAdmin) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId,
          organizationId,
          false
        );
        if (!hasAccess) {
          throw new Error(`Unauthorized: No access to organization ${organizationId}`);
        }
      }

      // Update metric settings
      const orgMetric = await this.storage.updateOrganizationMetric(
        organizationId,
        metricCode,
        data
      );

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'org_metric_updated',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            metricCode,
            changes: data,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('CRITICAL: Failed to create audit log for org_metric_updated:', {
          error: auditError,
          userId: requestingUserId,
          organizationId,
          metricCode,
        });
      }

      return orgMetric;
    } catch (error) {
      return this.handleError(error, "MetricService.updateOrganizationMetric");
    }
  }

  /**
   * Bulk enable multiple metrics for an organization (org admin or site admin)
   * Useful for initial setup or enabling multiple metrics at once
   */
  async bulkEnableMetricsForOrganization(
    organizationId: string,
    metricCodes: string[],
    requestingUserId: string
  ): Promise<OrganizationMetric[]> {
    try {
      // Verify access to organization
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      if (!isSiteAdmin) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId,
          organizationId,
          false
        );
        if (!hasAccess) {
          throw new Error(`Unauthorized: No access to organization ${organizationId}`);
        }
      }

      // Bulk enable (validation and transaction handling in storage layer)
      const results = await this.storage.bulkEnableMetricsForOrganization(
        organizationId,
        metricCodes
      );

      // Audit log
      try {
        await this.storage.createAuditLog({
          userId: requestingUserId,
          action: 'org_metrics_bulk_enabled',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            metricCodes,
            count: metricCodes.length,
          }),
          ipAddress: null,
          userAgent: null,
        });
      } catch (auditError) {
        console.error('CRITICAL: Failed to create audit log for org_metrics_bulk_enabled:', {
          error: auditError,
          userId: requestingUserId,
          organizationId,
          metricCodes,
        });
      }

      return results;
    } catch (error) {
      return this.handleError(error, "MetricService.bulkEnableMetricsForOrganization");
    }
  }
}

export const metricService = new MetricService();
