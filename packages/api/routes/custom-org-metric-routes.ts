/**
 * Custom Organization Metrics API Routes
 *
 * Endpoints for managing organization-private custom metrics.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizationAccess, AuthenticatedRequest } from "../middleware";
import { getCustomOrgMetricService } from "../services/custom-org-metric-service";
import { rateLimit } from "express-rate-limit";

// Rate limiters for metric operations
const createMetricLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 creates per window
  message: { error: "Too many metric creation requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' ||
                (process.env.NODE_ENV !== 'production' && process.env.BYPASS_CUSTOM_METRIC_RATE_LIMIT === 'true'),
});

const modifyMetricLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many metric modification requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test' ||
                (process.env.NODE_ENV !== 'production' && process.env.BYPASS_CUSTOM_METRIC_RATE_LIMIT === 'true'),
});

// Validation schemas
const createCustomMetricSchema = z.object({
  label: z.string().min(1, "Label is required").max(100),
  category: z.string().max(50).optional(),
  unit: z.string().max(20).optional(),
  metricType: z.enum(['lower_is_better', 'higher_is_better', 'tracking']),
  description: z.string().optional(),
  validationMin: z.number().optional(),
  validationMax: z.number().optional(),
  decimalPrecision: z.number().int().min(0).max(10).optional(),
  sportAssociations: z.array(z.string()).optional(),
  isDerived: z.boolean().optional(),
  formula: z.string().max(1000).optional(),
  dependentMetrics: z.array(z.string()).optional(),
  calculationConfig: z.object({
    dateMatchStrategy: z.enum(['same_date', 'latest_before', 'closest']),
    maxDateDifference: z.number().int().positive().optional(),
    missingSourceBehavior: z.enum(['skip', 'error']),
  }).optional(),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});

const updateCustomMetricSchema = createCustomMetricSchema.partial();

export function registerCustomOrgMetricRoutes(app: Express) {
  const service = getCustomOrgMetricService();

  // ========================================================================
  // LIST CUSTOM METRICS
  // ========================================================================

  /**
   * GET /api/organizations/:organizationId/custom-metrics
   * List all custom metrics for an organization
   */
  app.get(
    "/api/organizations/:organizationId/custom-metrics",
    requireAuth,
    requireOrganizationAccess(),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const includeArchived = req.query.includeArchived === 'true';
        const category = typeof req.query.category === 'string' ? req.query.category : undefined;

        const metrics = await service.getCustomOrgMetrics(
          organizationId,
          userId,
          { includeArchived, category }
        );

        res.json(metrics);
      } catch (error) {
        console.error("Error listing custom metrics:", error);
        if (error instanceof Error && error.message.includes('Unauthorized')) {
          return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to list custom metrics" });
      }
    }
  );

  // ========================================================================
  // GET SINGLE CUSTOM METRIC
  // ========================================================================

  /**
   * GET /api/organizations/:organizationId/custom-metrics/:code
   * Get a specific custom metric by code
   */
  app.get(
    "/api/organizations/:organizationId/custom-metrics/:code",
    requireAuth,
    requireOrganizationAccess(),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, code } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const metric = await service.getCustomOrgMetric(organizationId, code, userId);

        if (!metric) {
          return res.status(404).json({ error: "Custom metric not found" });
        }

        res.json(metric);
      } catch (error) {
        console.error("Error getting custom metric:", error);
        if (error instanceof Error && error.message.includes('Unauthorized')) {
          return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to get custom metric" });
      }
    }
  );

  // ========================================================================
  // CREATE CUSTOM METRIC
  // ========================================================================

  /**
   * POST /api/organizations/:organizationId/custom-metrics
   * Create a new custom metric for an organization
   */
  app.post(
    "/api/organizations/:organizationId/custom-metrics",
    createMetricLimiter,
    requireAuth,
    requireOrganizationAccess("org_admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        // Validate request body
        const parseResult = createCustomMetricSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: parseResult.error.flatten().fieldErrors,
          });
        }

        const metric = await service.createCustomOrgMetric(
          organizationId,
          parseResult.data,
          userId
        );

        res.status(201).json(metric);
      } catch (error) {
        console.error("Error creating custom metric:", error);
        if (error instanceof Error) {
          if (error.message.includes('Unauthorized')) {
            return res.status(403).json({ error: error.message });
          }
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: error.message });
          }
          if (error.message.includes('Invalid formula') || error.message.includes('required')) {
            return res.status(400).json({ error: error.message });
          }
        }
        res.status(500).json({ error: "Failed to create custom metric" });
      }
    }
  );

  // ========================================================================
  // UPDATE CUSTOM METRIC
  // ========================================================================

  /**
   * PATCH /api/organizations/:organizationId/custom-metrics/:code
   * Update an existing custom metric
   */
  app.patch(
    "/api/organizations/:organizationId/custom-metrics/:code",
    modifyMetricLimiter,
    requireAuth,
    requireOrganizationAccess("org_admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, code } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        // Validate request body
        const parseResult = updateCustomMetricSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: parseResult.error.flatten().fieldErrors,
          });
        }

        const metric = await service.updateCustomOrgMetric(
          organizationId,
          code,
          parseResult.data,
          userId
        );

        res.json(metric);
      } catch (error) {
        console.error("Error updating custom metric:", error);
        if (error instanceof Error) {
          if (error.message.includes('Unauthorized')) {
            return res.status(403).json({ error: error.message });
          }
          if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
          }
          if (error.message.includes('measurements exist')) {
            return res.status(409).json({ error: error.message });
          }
        }
        res.status(500).json({ error: "Failed to update custom metric" });
      }
    }
  );

  // ========================================================================
  // ARCHIVE CUSTOM METRIC
  // ========================================================================

  /**
   * POST /api/organizations/:organizationId/custom-metrics/:code/archive
   * Archive (soft delete) a custom metric
   */
  app.post(
    "/api/organizations/:organizationId/custom-metrics/:code/archive",
    modifyMetricLimiter,
    requireAuth,
    requireOrganizationAccess("org_admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, code } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const metric = await service.archiveCustomOrgMetric(organizationId, code, userId);

        res.json(metric);
      } catch (error) {
        console.error("Error archiving custom metric:", error);
        if (error instanceof Error) {
          if (error.message.includes('Unauthorized')) {
            return res.status(403).json({ error: error.message });
          }
          if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
          }
        }
        res.status(500).json({ error: "Failed to archive custom metric" });
      }
    }
  );

  // ========================================================================
  // RESTORE CUSTOM METRIC
  // ========================================================================

  /**
   * POST /api/organizations/:organizationId/custom-metrics/:code/restore
   * Restore an archived custom metric
   */
  app.post(
    "/api/organizations/:organizationId/custom-metrics/:code/restore",
    modifyMetricLimiter,
    requireAuth,
    requireOrganizationAccess("org_admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, code } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const metric = await service.restoreCustomOrgMetric(organizationId, code, userId);

        res.json(metric);
      } catch (error) {
        console.error("Error restoring custom metric:", error);
        if (error instanceof Error) {
          if (error.message.includes('Unauthorized')) {
            return res.status(403).json({ error: error.message });
          }
          if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
          }
        }
        res.status(500).json({ error: "Failed to restore custom metric" });
      }
    }
  );

  // ========================================================================
  // FORMULA VALIDATION
  // ========================================================================

  /**
   * POST /api/organizations/:organizationId/custom-metrics/validate-formula
   * Validate a formula for a derived custom metric
   */
  app.post(
    "/api/organizations/:organizationId/custom-metrics/validate-formula",
    requireAuth,
    requireOrganizationAccess("org_admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const userId = req.session?.user?.id;
        const { formula, excludeCode } = req.body;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        if (!formula || typeof formula !== 'string') {
          return res.status(400).json({ error: "Formula is required" });
        }

        // Check if custom metrics feature is enabled (Critical Issue #1 fix)
        await service.ensureCustomMetricsEnabled(organizationId, userId, false);

        const result = await service.validateCustomFormula(
          organizationId,
          formula,
          excludeCode
        );

        res.json(result);
      } catch (error) {
        console.error("Error validating formula:", error);
        if (error instanceof Error && error.message.includes('not enabled')) {
          return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to validate formula" });
      }
    }
  );

  // ========================================================================
  // FORMULA SOURCES
  // ========================================================================

  /**
   * GET /api/organizations/:organizationId/custom-metrics/formula-sources
   * Get available metrics for use in formulas
   */
  app.get(
    "/api/organizations/:organizationId/custom-metrics/formula-sources",
    requireAuth,
    requireOrganizationAccess("org_admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const userId = req.session?.user?.id;

        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        // Check if custom metrics feature is enabled (Critical Issue #2 fix)
        await service.ensureCustomMetricsEnabled(organizationId, userId, false);

        const codes = await service.getAvailableMetricCodesForFormula(organizationId);

        res.json({ availableMetrics: codes });
      } catch (error) {
        console.error("Error getting formula sources:", error);
        if (error instanceof Error && error.message.includes('not enabled')) {
          return res.status(403).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to get formula sources" });
      }
    }
  );
}
