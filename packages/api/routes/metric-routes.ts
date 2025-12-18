/**
 * Metric management routes
 * Site-level metrics (site admin only) and organization-level metric enablement
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { MetricService } from "../services/metric-service";
import { requireAuth, requireSiteAdmin, requireOrganizationAccess } from "../middleware";
import { validateOrgTypeQuery } from "../middleware/organization-type-middleware";
import { insertSiteMetricSchema, updateSiteMetricSchema, updateOrganizationMetricSchema, siteSports, siteMetrics } from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { validateFormula, detectCircularDependencies } from "../services/formula-service";

const metricService = new MetricService();

/**
 * Validate sport associations against active sports in site_sports table
 * @param sportCodes - Array of sport codes to validate
 * @throws Error if any sport code is invalid or inactive
 *
 * Semantics:
 * - null/undefined: "Available to all sports" (no validation needed)
 * - []: Empty array treated as "available to all sports" (stored as NULL in DB)
 * - [...codes]: Specific sports (validates each code exists and is active)
 */
async function validateSportAssociations(sportCodes: string[] | null | undefined): Promise<void> {
  // Null, undefined, or empty array all mean "available to all sports"
  // Empty arrays are converted to null by the form before submission
  if (!sportCodes || sportCodes.length === 0) {
    return;
  }

  // Fetch all active sports from database
  const validSports = await db.select({ code: siteSports.code })
    .from(siteSports)
    .where(eq(siteSports.isActive, true));

  const validCodes = new Set(validSports.map(s => s.code));
  const invalidCodes = sportCodes.filter(code => !validCodes.has(code));

  if (invalidCodes.length > 0) {
    throw new Error(`Invalid sport codes: ${invalidCodes.join(', ')}. Sport must exist and be active.`);
  }
}

function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const isProduction = process.env.NODE_ENV === 'production';
  const safeErrors = ['Unauthorized', 'not found', 'already exists', 'Cannot delete', 'Cannot disable', 'not active', 'Invalid sport codes'];

  if (isProduction) {
    return safeErrors.some(safe => error.message.includes(safe)) ? error.message : fallback;
  }
  return error.message;
}

// Rate limiters
const metricCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many metric creation attempts" },
});

const metricModifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { message: "Too many metric modification attempts" },
});

export function registerMetricRoutes(app: Express) {
  // ========================================================================
  // SITE METRICS (Site Admin Only)
  // ========================================================================

  // Get site metrics with organization type filtering (site admin)
  app.get("/api/site-metrics",
    requireSiteAdmin,
    validateOrgTypeQuery('orgType', false), // Validate orgType query param if provided
    async (req, res) => {
      try {
        const userId = req.session.user!.id;
        const includeInactive = req.query.includeInactive === 'true';
        const orgType = (req as any).organizationType as string | undefined; // Get validated org type from middleware

        const metrics = await metricService.getSiteMetrics(userId, { includeInactive, orgType });
        res.json(metrics);
      } catch (error) {
        console.error("GET /api/site-metrics error:", error);
        res.status(500).json({ message: sanitizeError(error, "Failed to fetch site metrics") });
      }
    }
  );

  // Get all site metrics
  app.get("/api/metrics",
    requireAuth,
    validateOrgTypeQuery('orgType', false), // Validate orgType query param if provided
    async (req, res) => {
      try {
        const userId = req.session.user!.id;
        const includeInactive = req.query.includeInactive === 'true';
        const orgType = (req as any).organizationType as string | undefined; // Get validated org type from middleware
        const organizationId = req.headers['x-organization-id'] as string;

        // If organization ID is provided, filter by that organization's type
        if (organizationId) {
          const metrics = await metricService.getSiteMetricsForOrganization(
            organizationId,
            userId,
            { includeInactive }
          );
          return res.json(metrics);
        }

        // If no organization context and user requested org-filtered metrics, require it
        if (!organizationId && req.path === '/api/metrics' && !orgType) {
          // For regular /api/metrics without orgType, require organization context
          return res.status(400).json({ message: "Organization context required" });
        }

        const metrics = await metricService.getSiteMetrics(userId, { includeInactive, orgType });
        res.json(metrics);
      } catch (error) {
        console.error("GET /api/metrics error:", error);
        res.status(500).json({ message: sanitizeError(error, "Failed to fetch metrics") });
      }
    }
  );

  // Get specific site metric
  app.get("/api/metrics/:code", requireAuth, async (req, res) => {
    try {
      const { code } = req.params;
      const metric = await metricService.getSiteMetric(code);

      if (!metric) {
        return res.status(404).json({ message: "Metric not found" });
      }

      res.json(metric);
    } catch (error) {
      console.error("GET /api/metrics/:code error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch metric") });
    }
  });

  // Create new site metric (site admin only)
  app.post("/api/metrics", metricCreateLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const validatedData = insertSiteMetricSchema.parse(req.body);

      // Validate sport associations against active sports in database
      await validateSportAssociations(validatedData.sportAssociations);

      const metric = await metricService.createSiteMetric(validatedData, userId);
      res.status(201).json(metric);
    } catch (error) {
      console.error("POST /api/metrics error:", error);

      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }

      res.status(400).json({ message: sanitizeError(error, "Failed to create metric") });
    }
  });

  // Update site metric (site admin only)
  app.patch("/api/metrics/:code", metricModifyLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const { code } = req.params;
      const userId = req.session.user!.id;
      const validatedData = updateSiteMetricSchema.parse(req.body);

      // Validate sport associations against active sports in database
      // Note: null explicitly clears the field, undefined means "don't update"
      if (validatedData.sportAssociations !== undefined) {
        await validateSportAssociations(validatedData.sportAssociations);
      }

      const metric = await metricService.updateSiteMetric(code, validatedData, userId);
      res.json(metric);
    } catch (error) {
      console.error("PATCH /api/metrics/:code error:", error);

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }

      res.status(400).json({ message: sanitizeError(error, "Failed to update metric") });
    }
  });

  // Toggle metric active status (site admin only)
  app.patch("/api/metrics/:code/status", metricModifyLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const { code } = req.params;
      const { isActive } = req.body;
      const userId = req.session.user!.id;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      const metric = await metricService.toggleSiteMetricStatus(code, isActive, userId);
      res.json(metric);
    } catch (error) {
      console.error("PATCH /api/metrics/:code/status error:", error);

      if (error instanceof Error && error.message.includes('Cannot disable')) {
        return res.status(403).json({ message: error.message });
      }

      res.status(400).json({ message: sanitizeError(error, "Failed to toggle metric status") });
    }
  });

  // Delete site metric (site admin only)
  app.delete("/api/metrics/:code", metricModifyLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const { code } = req.params;
      const userId = req.session.user!.id;

      await metricService.deleteSiteMetric(code, userId);
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/metrics/:code error:", error);

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('Cannot delete')) {
          return res.status(409).json({ message: error.message });
        }
      }

      res.status(400).json({ message: sanitizeError(error, "Failed to delete metric") });
    }
  });

  // ========================================================================
  // ORGANIZATION METRICS (Org Admin + Site Admin)
  // ========================================================================

  // Get metrics for organization
  app.get("/api/organizations/:organizationId/metrics", requireAuth, async (req, res) => {
    try {
      const { organizationId } = req.params;
      const userId = req.session.user!.id;
      const enabledOnly = req.query.enabledOnly === 'true';

      const metrics = await metricService.getOrganizationMetrics(
        organizationId,
        userId,
        { enabledOnly }
      );

      res.json(metrics);
    } catch (error) {
      console.error("GET /api/organizations/:id/metrics error:", error);

      if (error instanceof Error && error.message.includes('Unauthorized')) {
        return res.status(403).json({ message: error.message });
      }

      res.status(500).json({ message: sanitizeError(error, "Failed to fetch organization metrics") });
    }
  });

  // Enable metric for organization
  app.post("/api/organizations/:organizationId/metrics/:code/enable",
    metricModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, code } = req.params;
        const userId = req.session.user!.id;

        // Validate organizationId format (UUID)
        if (!organizationId.match(/^[a-f0-9-]{36}$/i)) {
          return res.status(400).json({ message: "Invalid organization ID format" });
        }

        // Validate metric code format (uppercase alphanumeric + underscores)
        if (!code.match(/^[A-Z0-9_]+$/)) {
          return res.status(400).json({ message: "Invalid metric code format" });
        }

        const metric = await metricService.enableMetricForOrganization(organizationId, code, userId);
        res.json(metric);
      } catch (error) {
        console.error("POST /api/organizations/:id/metrics/:code/enable error:", error);

        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
          }
          if (error.message.includes('not active')) {
            return res.status(400).json({ message: error.message });
          }
        }

        res.status(400).json({ message: sanitizeError(error, "Failed to enable metric") });
      }
    }
  );

  // Disable metric for organization
  app.post("/api/organizations/:organizationId/metrics/:code/disable",
    metricModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, code } = req.params;
        const userId = req.session.user!.id;

        // Validate organizationId format (UUID)
        if (!organizationId.match(/^[a-f0-9-]{36}$/i)) {
          return res.status(400).json({ message: "Invalid organization ID format" });
        }

        // Validate metric code format (uppercase alphanumeric + underscores)
        if (!code.match(/^[A-Z0-9_]+$/)) {
          return res.status(400).json({ message: "Invalid metric code format" });
        }

        const metric = await metricService.disableMetricForOrganization(organizationId, code, userId);
        res.json(metric);
      } catch (error) {
        console.error("POST /api/organizations/:id/metrics/:code/disable error:", error);
        res.status(400).json({ message: sanitizeError(error, "Failed to disable metric") });
      }
    }
  );

  // Update organization metric settings
  app.patch("/api/organizations/:organizationId/metrics/:code",
    metricModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, code } = req.params;
        const userId = req.session.user!.id;

        // Validate organizationId format (UUID)
        if (!organizationId.match(/^[a-f0-9-]{36}$/i)) {
          return res.status(400).json({ message: "Invalid organization ID format" });
        }

        // Validate metric code format (uppercase alphanumeric + underscores)
        if (!code.match(/^[A-Z0-9_]+$/)) {
          return res.status(400).json({ message: "Invalid metric code format" });
        }

        const validatedData = updateOrganizationMetricSchema.parse(req.body);

        const metric = await metricService.updateOrganizationMetric(
          organizationId,
          code,
          validatedData,
          userId
        );

        res.json(metric);
      } catch (error) {
        console.error("PATCH /api/organizations/:id/metrics/:code error:", error);
        res.status(400).json({ message: sanitizeError(error, "Failed to update organization metric") });
      }
    }
  );

  // Bulk enable metrics for organization
  app.post("/api/organizations/:organizationId/metrics/bulk-enable",
    metricModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.params;
        const { metricCodes } = req.body;
        const userId = req.session.user!.id;

        // Validate organizationId format (UUID)
        if (!organizationId.match(/^[a-f0-9-]{36}$/i)) {
          return res.status(400).json({ message: "Invalid organization ID format" });
        }

        if (!Array.isArray(metricCodes)) {
          return res.status(400).json({ message: "metricCodes must be an array" });
        }

        // Validate each metric code format
        for (const code of metricCodes) {
          if (typeof code !== 'string' || !code.match(/^[A-Z0-9_]+$/)) {
            return res.status(400).json({
              message: `Invalid metric code format: ${code}`
            });
          }
        }

        const metrics = await metricService.bulkEnableMetricsForOrganization(
          organizationId,
          metricCodes,
          userId
        );

        res.json(metrics);
      } catch (error) {
        console.error("POST /api/organizations/:id/metrics/bulk-enable error:", error);
        res.status(400).json({ message: sanitizeError(error, "Failed to bulk enable metrics") });
      }
    }
  );

  // ========================================================================
  // DERIVED METRIC ENDPOINTS (Site Admin Only)
  // ========================================================================

  // Validate formula before saving a derived metric
  app.post("/api/metrics/validate-formula", requireAuth, requireSiteAdmin, async (req, res) => {
    try {
      const { formula, excludeMetricCode } = req.body;

      if (!formula || typeof formula !== 'string') {
        return res.status(400).json({ message: "Formula is required" });
      }

      // Get all available metric codes
      const metrics = await db.select({ code: siteMetrics.code }).from(siteMetrics);
      const availableCodes = metrics
        .map(m => m.code)
        .filter(code => code !== excludeMetricCode);

      const result = validateFormula(formula, availableCodes);
      return res.json(result);
    } catch (error) {
      console.error("POST /api/metrics/validate-formula error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to validate formula") });
    }
  });

  // Get dependency graph for a metric
  app.get("/api/metrics/:code/dependencies", requireAuth, requireSiteAdmin, async (req, res) => {
    try {
      const { code } = req.params;

      // Validate metric code format to prevent SQL injection
      if (!code.match(/^[A-Z0-9_]+$/)) {
        return res.status(400).json({ message: "Invalid metric code format" });
      }

      // Find what this metric depends on (if it's derived)
      const metric = await db.query.siteMetrics.findFirst({
        where: eq(siteMetrics.code, code)
      });

      // SECURITY FIX: Use parameterized query to prevent SQL injection
      // Find metrics that depend on this one using array containment operator
      const dependents = await db.select().from(siteMetrics)
        .where(sql`${siteMetrics.dependentMetrics} @> ARRAY[${sql.raw(`'${code.replace(/'/g, "''")}'`)}]::text[]`);

      return res.json({
        metric: metric?.code || null,
        dependsOn: metric?.dependentMetrics || [],
        dependedOnBy: dependents.map(m => m.code)
      });
    } catch (error) {
      console.error("GET /api/metrics/:code/dependencies error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch dependencies") });
    }
  });

  // Extend PATCH /api/metrics/:code to handle derived metric validation
  // Note: This is already handled by the existing PATCH route above,
  // but we need to add validation logic to the MetricService.
  // The validation logic should be added in the service layer to:
  // 1. Check if isDerived is true, formula is required
  // 2. Validate formula syntax and referenced metrics
  // 3. Check for circular dependencies before saving
}
