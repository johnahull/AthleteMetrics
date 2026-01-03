/**
 * Custom Organization Metrics Service
 *
 * Manages organization-private custom metrics that are scoped to individual organizations.
 * These metrics are not shared across organizations and support derived (calculated) metrics.
 */

import { BaseService } from "./base-service";
import { db } from "../db";
import { customOrgMetrics, siteMetrics, measurements, userOrganizations } from "@shared/schema";
import { eq, and, count, sql, or } from "drizzle-orm";
import type { CustomOrgMetric } from "@shared/schema";
import { validateFormula, detectCircularDependencies } from "./formula-service";

export interface InsertCustomOrgMetric {
  label: string;
  category?: string;
  unit?: string;
  metricType: 'lower_is_better' | 'higher_is_better' | 'tracking';
  description?: string;
  validationMin?: number;
  validationMax?: number;
  decimalPrecision?: number;
  sportAssociations?: string[];
  isDerived?: boolean;
  formula?: string;
  dependentMetrics?: string[];
  calculationConfig?: {
    dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
    maxDateDifference?: number;
    missingSourceBehavior: 'skip' | 'error';
  };
  displayOrder?: number;
  color?: string;
  icon?: string;
}

export interface UpdateCustomOrgMetric extends Partial<InsertCustomOrgMetric> {}

export interface CustomOrgMetricFilters {
  includeArchived?: boolean;
  category?: string;
}

export class CustomOrgMetricService extends BaseService {
  // ========================================================================
  // CODE GENERATION
  // ========================================================================

  /**
   * Generate a unique metric code from org ID and label
   * Format: ORG_{orgIdPrefix}_METRIC_NAME
   */
  generateMetricCode(organizationId: string, label: string): string {
    // Extract first 8 chars of org ID (uppercase, remove hyphens)
    const orgPrefix = organizationId.substring(0, 8).toUpperCase().replace(/-/g, '');

    // Convert label to UPPER_SNAKE_CASE
    const labelPart = label
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '') // Remove special chars except spaces
      .trim()
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 30); // Limit length

    return `ORG_${orgPrefix}_${labelPart}`;
  }

  // ========================================================================
  // AUTHORIZATION HELPERS
  // ========================================================================

  /**
   * Check if user is an admin of the organization (org_admin role or site admin)
   */
  private async isOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
    // Check if site admin
    if (await this.isSiteAdmin(userId)) {
      return true;
    }

    // Check user's role in the organization
    const [userOrg] = await db.select()
      .from(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ))
      .limit(1);

    return userOrg?.role === 'org_admin';
  }

  /**
   * Check if user has access to the organization (any role)
   */
  private async hasOrgAccess(userId: string, organizationId: string): Promise<boolean> {
    // Site admins have access to all orgs
    if (await this.isSiteAdmin(userId)) {
      return true;
    }

    const [userOrg] = await db.select()
      .from(userOrganizations)
      .where(and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ))
      .limit(1);

    return !!userOrg;
  }

  // ========================================================================
  // CREATE
  // ========================================================================

  /**
   * Create a new custom metric for an organization
   */
  async createCustomOrgMetric(
    organizationId: string,
    data: InsertCustomOrgMetric,
    requestingUserId: string
  ): Promise<CustomOrgMetric> {
    try {
      // Check authorization - only org admins can create metrics
      if (!(await this.isOrgAdmin(requestingUserId, organizationId))) {
        throw new Error("Unauthorized: Only organization administrators can create custom metrics");
      }

      // Generate code from label
      const code = this.generateMetricCode(organizationId, data.label);

      // Check for duplicate code in this org
      const existing = await this.getCustomOrgMetric(organizationId, code, requestingUserId);
      if (existing) {
        throw new Error(`A custom metric with label "${data.label}" already exists in this organization`);
      }

      // Validate derived metric requirements
      if (data.isDerived === true) {
        if (!data.formula || data.formula.trim() === '') {
          throw new Error("Formula is required for derived metrics");
        }

        // Get available metric codes for formula validation
        const availableCodes = await this.getAvailableMetricCodesForFormula(organizationId);

        // Validate formula syntax
        const formulaValidation = validateFormula(data.formula, availableCodes);
        if (!formulaValidation.valid) {
          throw new Error(`Invalid formula: ${formulaValidation.errors.join(', ')}`);
        }

        // Set dependentMetrics from formula validation if not explicitly provided
        if (!data.dependentMetrics || data.dependentMetrics.length === 0) {
          data.dependentMetrics = formulaValidation.referencedMetrics;
        }

        // Validate that all dependent metrics are available to this org
        for (const depCode of data.dependentMetrics || []) {
          if (!availableCodes.includes(depCode)) {
            throw new Error(`Invalid dependency: Metric "${depCode}" is not available to this organization`);
          }
        }
      }

      // Insert the metric
      const [metric] = await db.insert(customOrgMetrics).values({
        organizationId,
        code,
        label: data.label,
        category: data.category,
        unit: data.unit,
        metricType: data.metricType,
        description: data.description,
        validationMin: data.validationMin?.toString(),
        validationMax: data.validationMax?.toString(),
        decimalPrecision: data.decimalPrecision ?? 3,
        sportAssociations: data.sportAssociations,
        isDerived: data.isDerived ?? false,
        formula: data.formula,
        dependentMetrics: data.dependentMetrics,
        calculationConfig: data.calculationConfig,
        displayOrder: data.displayOrder ?? 999,
        color: data.color,
        icon: data.icon,
        isActive: true,
        createdBy: requestingUserId,
        createdAt: new Date(),
      }).returning();

      return metric;
    } catch (error) {
      return this.handleError(error, "CustomOrgMetricService.createCustomOrgMetric");
    }
  }

  // ========================================================================
  // READ
  // ========================================================================

  /**
   * Get all custom metrics for an organization
   */
  async getCustomOrgMetrics(
    organizationId: string,
    requestingUserId: string,
    filters?: CustomOrgMetricFilters
  ): Promise<CustomOrgMetric[]> {
    try {
      // Check authorization - org members can view metrics
      if (!(await this.hasOrgAccess(requestingUserId, organizationId))) {
        throw new Error("Unauthorized: No access to this organization");
      }

      const conditions = [eq(customOrgMetrics.organizationId, organizationId)];

      // Filter by active status unless includeArchived is true
      if (!filters?.includeArchived) {
        conditions.push(eq(customOrgMetrics.isActive, true));
      }

      // Filter by category if specified
      if (filters?.category) {
        conditions.push(eq(customOrgMetrics.category, filters.category));
      }

      const metrics = await db.select()
        .from(customOrgMetrics)
        .where(and(...conditions))
        .orderBy(customOrgMetrics.displayOrder, customOrgMetrics.label);

      return metrics;
    } catch (error) {
      return this.handleError(error, "CustomOrgMetricService.getCustomOrgMetrics");
    }
  }

  /**
   * Get a specific custom metric by code
   */
  async getCustomOrgMetric(
    organizationId: string,
    code: string,
    requestingUserId: string
  ): Promise<CustomOrgMetric | undefined> {
    try {
      // Check authorization
      if (!(await this.hasOrgAccess(requestingUserId, organizationId))) {
        throw new Error("Unauthorized: No access to this organization");
      }

      const [metric] = await db.select()
        .from(customOrgMetrics)
        .where(and(
          eq(customOrgMetrics.organizationId, organizationId),
          eq(customOrgMetrics.code, code)
        ))
        .limit(1);

      return metric;
    } catch (error) {
      return this.handleError(error, "CustomOrgMetricService.getCustomOrgMetric");
    }
  }

  /**
   * Get a custom metric by label (for duplicate checking)
   */
  async getCustomOrgMetricByLabel(
    organizationId: string,
    label: string
  ): Promise<CustomOrgMetric | undefined> {
    const [metric] = await db.select()
      .from(customOrgMetrics)
      .where(and(
        eq(customOrgMetrics.organizationId, organizationId),
        eq(customOrgMetrics.label, label)
      ))
      .limit(1);

    return metric;
  }

  // ========================================================================
  // UPDATE
  // ========================================================================

  /**
   * Update a custom metric
   */
  async updateCustomOrgMetric(
    organizationId: string,
    code: string,
    data: UpdateCustomOrgMetric,
    requestingUserId: string
  ): Promise<CustomOrgMetric> {
    try {
      // Check authorization - only org admins can update
      if (!(await this.isOrgAdmin(requestingUserId, organizationId))) {
        throw new Error("Unauthorized: Only organization administrators can update custom metrics");
      }

      // Get existing metric
      const existing = await this.getCustomOrgMetric(organizationId, code, requestingUserId);
      if (!existing) {
        throw new Error(`Custom metric with code ${code} not found`);
      }

      // If changing metricType, check for existing measurements
      if (data.metricType && data.metricType !== existing.metricType) {
        const measurementCount = await this.getMeasurementCount(organizationId, code);
        if (measurementCount > 0) {
          throw new Error(`Cannot change metric type: ${measurementCount} measurements exist using this metric`);
        }
      }

      // Build update object
      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (data.label !== undefined) updateData.label = data.label;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.unit !== undefined) updateData.unit = data.unit;
      if (data.metricType !== undefined) updateData.metricType = data.metricType;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.validationMin !== undefined) updateData.validationMin = data.validationMin?.toString();
      if (data.validationMax !== undefined) updateData.validationMax = data.validationMax?.toString();
      if (data.decimalPrecision !== undefined) updateData.decimalPrecision = data.decimalPrecision;
      if (data.sportAssociations !== undefined) updateData.sportAssociations = data.sportAssociations;
      if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
      if (data.color !== undefined) updateData.color = data.color;
      if (data.icon !== undefined) updateData.icon = data.icon;

      const [updated] = await db.update(customOrgMetrics)
        .set(updateData)
        .where(and(
          eq(customOrgMetrics.organizationId, organizationId),
          eq(customOrgMetrics.code, code)
        ))
        .returning();

      return updated;
    } catch (error) {
      return this.handleError(error, "CustomOrgMetricService.updateCustomOrgMetric");
    }
  }

  // ========================================================================
  // ARCHIVE (SOFT DELETE)
  // ========================================================================

  /**
   * Archive (soft delete) a custom metric
   */
  async archiveCustomOrgMetric(
    organizationId: string,
    code: string,
    requestingUserId: string
  ): Promise<CustomOrgMetric> {
    try {
      // Check authorization
      if (!(await this.isOrgAdmin(requestingUserId, organizationId))) {
        throw new Error("Unauthorized: Only organization administrators can archive custom metrics");
      }

      const [archived] = await db.update(customOrgMetrics)
        .set({
          isActive: false,
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(customOrgMetrics.organizationId, organizationId),
          eq(customOrgMetrics.code, code)
        ))
        .returning();

      if (!archived) {
        throw new Error(`Custom metric with code ${code} not found`);
      }

      return archived;
    } catch (error) {
      return this.handleError(error, "CustomOrgMetricService.archiveCustomOrgMetric");
    }
  }

  /**
   * Restore an archived custom metric
   */
  async restoreCustomOrgMetric(
    organizationId: string,
    code: string,
    requestingUserId: string
  ): Promise<CustomOrgMetric> {
    try {
      // Check authorization
      if (!(await this.isOrgAdmin(requestingUserId, organizationId))) {
        throw new Error("Unauthorized: Only organization administrators can restore custom metrics");
      }

      const [restored] = await db.update(customOrgMetrics)
        .set({
          isActive: true,
          archivedAt: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(customOrgMetrics.organizationId, organizationId),
          eq(customOrgMetrics.code, code)
        ))
        .returning();

      if (!restored) {
        throw new Error(`Custom metric with code ${code} not found`);
      }

      return restored;
    } catch (error) {
      return this.handleError(error, "CustomOrgMetricService.restoreCustomOrgMetric");
    }
  }

  // ========================================================================
  // MEASUREMENT COUNT
  // ========================================================================

  /**
   * Get count of measurements using a custom metric
   */
  async getMeasurementCount(organizationId: string, metricCode: string): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(measurements)
      .where(and(
        eq(measurements.metric, metricCode),
        eq(measurements.organizationId, organizationId)
      ));

    return result?.count ?? 0;
  }

  // ========================================================================
  // FORMULA HELPERS
  // ========================================================================

  /**
   * Get all metric codes available for formula dependencies in an organization
   * This includes active site metrics + active custom org metrics
   */
  async getAvailableMetricCodesForFormula(organizationId: string): Promise<string[]> {
    // Get active site metrics
    const activeSiteMetrics = await db.select({ code: siteMetrics.code })
      .from(siteMetrics)
      .where(eq(siteMetrics.isActive, true));

    // Get active custom org metrics for this org
    const activeCustomMetrics = await db.select({ code: customOrgMetrics.code })
      .from(customOrgMetrics)
      .where(and(
        eq(customOrgMetrics.organizationId, organizationId),
        eq(customOrgMetrics.isActive, true)
      ));

    return [
      ...activeSiteMetrics.map(m => m.code),
      ...activeCustomMetrics.map(m => m.code),
    ];
  }

  /**
   * Validate a formula for a custom org metric
   */
  async validateCustomFormula(
    organizationId: string,
    formula: string,
    excludeCode?: string
  ): Promise<{ valid: boolean; errors: string[]; referencedMetrics: string[] }> {
    const availableCodes = await this.getAvailableMetricCodesForFormula(organizationId);

    // Exclude the metric being edited (to allow self-reference removal)
    const filteredCodes = excludeCode
      ? availableCodes.filter(c => c !== excludeCode)
      : availableCodes;

    return validateFormula(formula, filteredCodes);
  }
}

// Singleton instance
let customOrgMetricServiceInstance: CustomOrgMetricService | null = null;

export function getCustomOrgMetricService(): CustomOrgMetricService {
  if (!customOrgMetricServiceInstance) {
    customOrgMetricServiceInstance = new CustomOrgMetricService();
  }
  return customOrgMetricServiceInstance;
}
