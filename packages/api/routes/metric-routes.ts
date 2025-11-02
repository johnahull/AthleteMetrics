/**
 * Metric management routes
 * Site-level metrics (site admin only) and organization-level metric enablement
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { MetricService } from "../services/metric-service";
import { requireAuth, requireSiteAdmin, requireOrganizationAccess } from "../middleware";
import { insertSiteMetricSchema, updateSiteMetricSchema, updateOrganizationMetricSchema } from "@shared/schema";

const metricService = new MetricService();

function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const isProduction = process.env.NODE_ENV === 'production';
  const safeErrors = ['Unauthorized', 'not found', 'already exists', 'Cannot delete', 'Cannot disable', 'not active'];

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

  // Get all site metrics
  app.get("/api/metrics", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const includeInactive = req.query.includeInactive === 'true';

      const metrics = await metricService.getSiteMetrics(userId, { includeInactive });
      res.json(metrics);
    } catch (error) {
      console.error("GET /api/metrics error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch metrics") });
    }
  });

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

        if (!Array.isArray(metricCodes)) {
          return res.status(400).json({ message: "metricCodes must be an array" });
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
}
