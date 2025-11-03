/**
 * Benchmark management routes
 * Site-level benchmarks (site admin only), organization-level custom benchmarks,
 * and benchmark enablement/evaluation
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { BenchmarkService } from "../services/benchmark-service";
import { requireAuth, requireSiteAdmin, requireOrganizationAccess, requireAthleteAccess } from "../middleware";
import {
  insertSiteBenchmarkSchema,
  updateSiteBenchmarkSchema,
  insertCustomBenchmarkSchema,
  updateCustomBenchmarkSchema,
} from "@shared/schema";

const benchmarkService = new BenchmarkService();

function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const isProduction = process.env.NODE_ENV === 'production';
  const safeErrors = ['Unauthorized', 'not found', 'already exists', 'Cannot delete', 'not allowed', 'not enabled'];

  if (isProduction) {
    return safeErrors.some(safe => error.message.includes(safe)) ? error.message : fallback;
  }
  return error.message;
}

// Rate limiters
const benchmarkCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many benchmark creation attempts" },
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Force enable in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req) => {
    const userId = req.session?.user?.id;
    const ip = req.ip || 'unknown';
    return userId ? `${ip}-${userId}` : ip;
  },
});

const benchmarkModifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { message: "Too many benchmark modification attempts" },
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Force enable in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req) => {
    const userId = req.session?.user?.id;
    const ip = req.ip || 'unknown';
    return userId ? `${ip}-${userId}` : ip;
  },
});

const benchmarkReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: { message: "Too many benchmark requests" },
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Force enable in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req) => {
    const userId = req.session?.user?.id;
    const ip = req.ip || 'unknown';
    return userId ? `${ip}-${userId}` : ip;
  },
});

export function registerBenchmarkRoutes(app: Express) {
  // ========================================================================
  // SITE BENCHMARKS (Site Admin Only)
  // ========================================================================

  // Get all site benchmarks
  app.get("/api/benchmarks", benchmarkReadLimiter, requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const includeInactive = req.query.includeInactive === 'true';

      const benchmarks = await benchmarkService.getSiteBenchmarks(userId, { includeInactive });
      res.json(benchmarks);
    } catch (error) {
      console.error("GET /api/benchmarks error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch benchmarks") });
    }
  });

  // Get specific site benchmark
  app.get("/api/benchmarks/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.user!.id;

      // Security: Check admin status first to prevent timing attacks
      const isSiteAdmin = await benchmarkService.isSiteAdmin(userId);
      const benchmark = await benchmarkService.getSiteBenchmark(id);

      // Non-site-admins can only view active benchmarks
      if (!benchmark || (!benchmark.isActive && !isSiteAdmin)) {
        return res.status(404).json({ message: "Benchmark not found" });
      }

      res.json(benchmark);
    } catch (error) {
      console.error("GET /api/benchmarks/:id error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch benchmark") });
    }
  });

  // Create new site benchmark (site admin only)
  app.post("/api/benchmarks", benchmarkCreateLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const validatedData = insertSiteBenchmarkSchema.parse(req.body);

      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      const benchmark = await benchmarkService.createSiteBenchmark(validatedData, userId, context);
      res.status(201).json(benchmark);
    } catch (error) {
      console.error("POST /api/benchmarks error:", error);

      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }

      res.status(400).json({ message: sanitizeError(error, "Failed to create benchmark") });
    }
  });

  // Update site benchmark (site admin only)
  app.patch("/api/benchmarks/:id", benchmarkModifyLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.user!.id;
      const validatedData = updateSiteBenchmarkSchema.parse(req.body);

      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      const benchmark = await benchmarkService.updateSiteBenchmark(id, validatedData, userId, context);
      res.json(benchmark);
    } catch (error) {
      console.error("PATCH /api/benchmarks/:id error:", error);

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }

      res.status(400).json({ message: sanitizeError(error, "Failed to update benchmark") });
    }
  });

  // Toggle benchmark active status (site admin only)
  app.patch("/api/benchmarks/:id/status", benchmarkModifyLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const userId = req.session.user!.id;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      const benchmark = await benchmarkService.toggleSiteBenchmarkStatus(id, isActive, userId, context);
      res.json(benchmark);
    } catch (error) {
      console.error("PATCH /api/benchmarks/:id/status error:", error);
      res.status(400).json({ message: sanitizeError(error, "Failed to toggle benchmark status") });
    }
  });

  // Delete site benchmark (site admin only)
  app.delete("/api/benchmarks/:id", benchmarkModifyLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.user!.id;

      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      await benchmarkService.deleteSiteBenchmark(id, userId, context);
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/benchmarks/:id error:", error);

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('Cannot delete') || error.message.includes('system default')) {
          return res.status(409).json({ message: error.message });
        }
      }

      res.status(400).json({ message: sanitizeError(error, "Failed to delete benchmark") });
    }
  });

  // ========================================================================
  // CUSTOM BENCHMARKS (Org Admin + Site Admin)
  // ========================================================================

  // Get custom benchmarks for organization
  app.get("/api/organizations/:organizationId/benchmarks/custom",
    benchmarkReadLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req, res) => {
    try {
      const { organizationId } = req.params;
      const userId = req.session.user!.id;
      const includeInactive = req.query.includeInactive === 'true';

      const benchmarks = await benchmarkService.getCustomBenchmarksForOrg(
        organizationId,
        userId,
        { includeInactive }
      );

      res.json(benchmarks);
    } catch (error) {
      console.error("GET /api/organizations/:id/benchmarks/custom error:", error);

      if (error instanceof Error && error.message.includes('Unauthorized')) {
        return res.status(403).json({ message: error.message });
      }

      res.status(500).json({ message: sanitizeError(error, "Failed to fetch custom benchmarks") });
    }
  });

  // Create custom benchmark for organization
  app.post("/api/organizations/:organizationId/benchmarks/custom",
    benchmarkCreateLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.params;
        const userId = req.session.user!.id;

        // Security: Extract organizationId from body and discard it, use only URL param
        const { organizationId: _bodyOrgId, ...bodyData } = req.body;
        const validatedData = insertCustomBenchmarkSchema.parse({
          ...bodyData,
          organizationId, // Only use URL param organizationId
        });

        const context = {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        };

        const benchmark = await benchmarkService.createCustomBenchmark(validatedData, userId, context);
        res.status(201).json(benchmark);
      } catch (error) {
        console.error("POST /api/organizations/:id/benchmarks/custom error:", error);

        if (error instanceof Error && error.message.includes('not allowed')) {
          return res.status(403).json({ message: error.message });
        }

        res.status(400).json({ message: sanitizeError(error, "Failed to create custom benchmark") });
      }
    }
  );

  // Update custom benchmark
  app.patch("/api/organizations/:organizationId/benchmarks/custom/:id",
    benchmarkModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, id } = req.params;
        const userId = req.session.user!.id;
        const validatedData = updateCustomBenchmarkSchema.parse(req.body);

        const context = {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        };

        const benchmark = await benchmarkService.updateCustomBenchmark(
          organizationId,
          id,
          validatedData,
          userId,
          context
        );
        res.json(benchmark);
      } catch (error) {
        console.error("PATCH /api/organizations/:id/benchmarks/custom/:id error:", error);

        if (error instanceof Error && error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }

        res.status(400).json({ message: sanitizeError(error, "Failed to update custom benchmark") });
      }
    }
  );

  // Delete custom benchmark
  app.delete("/api/organizations/:organizationId/benchmarks/custom/:id",
    benchmarkModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, id } = req.params;
        const userId = req.session.user!.id;

        const context = {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        };

        await benchmarkService.deleteCustomBenchmark(organizationId, id, userId, context);
        res.status(204).send();
      } catch (error) {
        console.error("DELETE /api/organizations/:id/benchmarks/custom/:id error:", error);

        if (error instanceof Error && error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }

        res.status(400).json({ message: sanitizeError(error, "Failed to delete custom benchmark") });
      }
    }
  );

  // ========================================================================
  // BENCHMARK ENABLEMENT (Org Admin + Site Admin)
  // ========================================================================

  // Get enabled benchmarks for organization
  app.get("/api/organizations/:organizationId/benchmarks",
    benchmarkReadLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req, res) => {
    try {
      const { organizationId } = req.params;
      const userId = req.session.user!.id;
      const includeInactive = req.query.includeInactive === 'true';

      const benchmarks = await benchmarkService.getOrganizationBenchmarks(
        organizationId,
        userId,
        { includeInactive }
      );

      res.json(benchmarks);
    } catch (error) {
      console.error("GET /api/organizations/:id/benchmarks error:", error);

      if (error instanceof Error && error.message.includes('Unauthorized')) {
        return res.status(403).json({ message: error.message });
      }

      res.status(500).json({ message: sanitizeError(error, "Failed to fetch organization benchmarks") });
    }
  });

  // Enable benchmark for organization
  app.post("/api/organizations/:organizationId/benchmarks/:id/enable",
    benchmarkModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, id } = req.params;
        const { benchmarkType } = req.body;
        const userId = req.session.user!.id;

        if (!benchmarkType || !['site', 'custom'].includes(benchmarkType)) {
          return res.status(400).json({ message: "benchmarkType must be 'site' or 'custom'" });
        }

        const context = {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        };

        const enabled = await benchmarkService.enableBenchmarkForOrg(
          organizationId,
          id,
          benchmarkType,
          userId,
          context
        );

        res.status(201).json(enabled);
      } catch (error) {
        console.error("POST /api/organizations/:id/benchmarks/:id/enable error:", error);

        if (error instanceof Error && error.message.includes('not enabled')) {
          return res.status(403).json({ message: error.message });
        }

        res.status(400).json({ message: sanitizeError(error, "Failed to enable benchmark") });
      }
    }
  );

  // Disable benchmark for organization
  app.post("/api/organizations/:organizationId/benchmarks/:id/disable",
    benchmarkModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, id } = req.params;
        const userId = req.session.user!.id;

        const context = {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        };

        const disabled = await benchmarkService.disableBenchmarkForOrg(
          organizationId,
          id,
          userId,
          context
        );

        res.json(disabled);
      } catch (error) {
        console.error("POST /api/organizations/:id/benchmarks/:id/disable error:", error);
        res.status(400).json({ message: sanitizeError(error, "Failed to disable benchmark") });
      }
    }
  );

  // ========================================================================
  // EVALUATION & STATUS
  // ========================================================================

  // Get athlete benchmark status
  app.get("/api/organizations/:organizationId/athletes/:athleteId/benchmark-status",
    benchmarkReadLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireAthleteAccess('read'),
    async (req, res) => {
      try {
        const { organizationId, athleteId } = req.params;

        const status = await benchmarkService.getAthleteBenchmarkStatus(athleteId, organizationId);
        res.json(status);
      } catch (error) {
        console.error("GET /api/organizations/:id/athletes/:id/benchmark-status error:", error);

        if (error instanceof Error && error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }

        res.status(500).json({ message: sanitizeError(error, "Failed to fetch athlete benchmark status") });
      }
    }
  );
}
