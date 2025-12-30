/**
 * Benchmark management routes
 * Site-level benchmarks (site admin only), organization-level custom benchmarks,
 * and benchmark enablement/evaluation
 */

import type { Express, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { BenchmarkService } from "../services/benchmark-service";
import { peerComparisonService, type PeerFilterCriteria } from "../services/peer-comparison-service";
import { requireAuth, requireSiteAdmin, requireOrganizationAccess, requireAthleteAccess } from "../middleware";
import { validateOrgTypeQuery, type OrganizationTypeRequest } from "../middleware/organization-type-middleware";
import { z } from "zod";
import {
  insertSiteBenchmarkSchema,
  updateSiteBenchmarkSchema,
  insertCustomBenchmarkSchema,
  updateCustomBenchmarkSchema,
  insertTierGroupSchema,
} from "@shared/schema";

const benchmarkService = new BenchmarkService();

// Zod schema for peer filter criteria validation
const peerFilterSchema = z.object({
  ageRange: z.tuple([z.number(), z.number()]).optional(),
  gender: z.enum(['Male', 'Female']).optional(),
  orgTypes: z.array(z.string()).optional(),
  sports: z.array(z.string()).optional(),
  teamIds: z.array(z.string()).optional(),
}).strict();

function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const isProduction = process.env.NODE_ENV === 'production';
  const safeErrors = ['Unauthorized', 'not found', 'already exists', 'Cannot delete', 'not allowed', 'not enabled'];

  if (isProduction) {
    return safeErrors.some(safe => error.message.includes(safe)) ? error.message : fallback;
  }
  return error.message;
}

/**
 * Standardized error handler for benchmark routes
 * Returns appropriate HTTP status codes based on error type:
 * - 400: Validation errors (Zod parse failures)
 * - 403: Permission denied (Unauthorized)
 * - 404: Resource not found
 * - 409: Conflict (duplicate, constraint violation, cannot delete)
 * - 500: Unexpected server errors
 */
function handleBenchmarkError(res: Response, error: unknown, operation: string): void {
  if (!(error instanceof Error)) {
    res.status(500).json({ message: sanitizeError(error, `Failed to ${operation}`) });
    return;
  }

  const errorMessage = error.message.toLowerCase();

  // 403 - Permission denied
  if (errorMessage.includes('unauthorized') || errorMessage.includes('permission denied') || errorMessage.includes('not allowed')) {
    res.status(403).json({ message: error.message });
    return;
  }

  // 404 - Not found
  if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
    res.status(404).json({ message: error.message });
    return;
  }

  // 409 - Conflict (duplicate, cannot delete, constraint violation)
  if (errorMessage.includes('already exists') || errorMessage.includes('cannot delete') || errorMessage.includes('system default')) {
    res.status(409).json({ message: error.message });
    return;
  }

  // 400 - Validation errors (including Zod parse errors)
  if (error.name === 'ZodError' || errorMessage.includes('invalid') || errorMessage.includes('must be')) {
    res.status(400).json({ message: sanitizeError(error, `Failed to ${operation}`) });
    return;
  }

  // 500 - Unexpected errors
  res.status(500).json({ message: sanitizeError(error, `Failed to ${operation}`) });
}

// Rate limiters
const benchmarkCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many benchmark creation attempts" },
  skip: (req): boolean => {
    // Strict production enforcement - no bypass allowed
    if (process.env.NODE_ENV === 'production') return false;
    // Allow bypass in test environment
    if (process.env.NODE_ENV === 'test') return true;
    // Development/staging can bypass with explicit flag
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req): string => {
    const userId = req.session?.user?.id;
    const ip = ipKeyGenerator(req.ip || 'unknown');
    return userId ? `${ip}-${userId}` : ip;
  },
});

const benchmarkModifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { message: "Too many benchmark modification attempts" },
  skip: (req): boolean => {
    // Strict production enforcement - no bypass allowed
    if (process.env.NODE_ENV === 'production') return false;
    // Allow bypass in test environment
    if (process.env.NODE_ENV === 'test') return true;
    // Development/staging can bypass with explicit flag
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req): string => {
    const userId = req.session?.user?.id;
    const ip = ipKeyGenerator(req.ip || 'unknown');
    return userId ? `${ip}-${userId}` : ip;
  },
});

const benchmarkReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: { message: "Too many benchmark requests" },
  skip: (req) => {
    // Strict production enforcement - no bypass allowed
    if (process.env.NODE_ENV === 'production') return false;
    // Allow bypass in test environment
    if (process.env.NODE_ENV === 'test') return true;
    // Development/staging can bypass with explicit flag
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req): string => {
    const userId = req.session?.user?.id;
    const ip = ipKeyGenerator(req.ip || 'unknown');
    return userId ? `${ip}-${userId}` : ip;
  },
});

export function registerBenchmarkRoutes(app: Express) {
  // ========================================================================
  // SITE BENCHMARKS (Site Admin Only)
  // ========================================================================

  // Get site benchmarks with organization type filtering (site admin)
  app.get("/api/site-benchmarks",
    benchmarkReadLimiter,
    requireSiteAdmin,
    validateOrgTypeQuery('orgType', false), // Validate orgType query param if provided
    async (req, res) => {
      try {
        const userId = req.session.user!.id;
        const includeInactive = req.query.includeInactive === 'true';
        const orgType = (req as OrganizationTypeRequest).organizationType ?? undefined; // Get validated org type from middleware

        const benchmarks = await benchmarkService.getSiteBenchmarks(userId, { includeInactive, orgType });
        res.json(benchmarks);
      } catch (error) {
        console.error("GET /api/site-benchmarks error:", error);
        handleBenchmarkError(res, error, "fetch site benchmarks");
      }
    }
  );

  // Get tier groups for site benchmarks (site admin only)
  app.get("/api/site-benchmarks/tier-groups",
    benchmarkReadLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req, res) => {
      try {
        const metricCode = req.query.metricCode as string | undefined;
        const tierGroups = await benchmarkService.getSiteTierGroups(metricCode);
        res.json(tierGroups);
      } catch (error) {
        console.error("GET /api/site-benchmarks/tier-groups error:", error);
        handleBenchmarkError(res, error, "fetch tier groups");
      }
    }
  );

  // Create a tier group (batch creation of benchmarks) (site admin only)
  app.post("/api/site-benchmarks/tier-group",
    benchmarkCreateLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req, res) => {
      try {
        const userId = req.session.user!.id;
        const validatedData = insertTierGroupSchema.parse(req.body);

        const context = {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        };

        const result = await benchmarkService.createTierGroup(validatedData, userId, context);
        res.status(201).json(result);
      } catch (error) {
        console.error("POST /api/site-benchmarks/tier-group error:", error);
        handleBenchmarkError(res, error, "create tier group");
      }
    }
  );

  // Get all site benchmarks (with organization context)
  app.get("/api/benchmarks", benchmarkReadLimiter, requireAuth, async (req, res) => {
    try {
      const userId = req.session.user!.id;
      const includeInactive = req.query.includeInactive === 'true';
      const organizationId = req.headers['x-organization-id'] as string;

      // If organization ID is provided, filter by that organization's type
      if (organizationId) {
        const benchmarks = await benchmarkService.getSiteBenchmarksForOrganization(
          organizationId, 
          userId, 
          { includeInactive }
        );
        return res.json(benchmarks);
      }

      // If no organization context, require organization context
      return res.status(400).json({ message: "Organization context required" });
    } catch (error) {
      console.error("GET /api/benchmarks error:", error);
      handleBenchmarkError(res, error, "fetch benchmarks");
    }
  });

  // Get specific site benchmark
  app.get("/api/benchmarks/:id", benchmarkReadLimiter, requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.user!.id;

      // Security: Fetch both in parallel to prevent timing attacks
      const startTime = Date.now();
      const [isSiteAdmin, benchmark] = await Promise.all([
        benchmarkService.isSiteAdmin(userId),
        benchmarkService.getSiteBenchmark(id)
      ]);

      // Timing-safe visibility check using constant-time arithmetic operations
      // to prevent revealing information through execution time
      const benchmarkExists = benchmark ? 1 : 0;
      const benchmarkActive = (benchmark?.isActive ?? false) ? 1 : 0;
      const adminAccess = isSiteAdmin ? 1 : 0;
      const canView = (benchmarkExists & (benchmarkActive | adminAccess)) === 1;

      // Normalize response time to prevent timing analysis
      // 100ms provides stronger protection against timing attacks while remaining responsive
      const minResponseTimeMs = 100;
      const elapsed = Date.now() - startTime;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, minResponseTimeMs - elapsed)));

      if (!canView) {
        return res.status(404).json({ message: "Benchmark not found" });
      }

      res.json(benchmark);
    } catch (error) {
      console.error("GET /api/benchmarks/:id error:", error);
      handleBenchmarkError(res, error, "fetch benchmark");
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
      handleBenchmarkError(res, error, "create benchmark");
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
      handleBenchmarkError(res, error, "update benchmark");
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
      handleBenchmarkError(res, error, "toggle benchmark status");
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
      handleBenchmarkError(res, error, "delete benchmark");
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
      handleBenchmarkError(res, error, "fetch custom benchmarks");
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
        handleBenchmarkError(res, error, "create custom benchmark");
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
        handleBenchmarkError(res, error, "update custom benchmark");
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
        handleBenchmarkError(res, error, "delete custom benchmark");
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
      handleBenchmarkError(res, error, "fetch organization benchmarks");
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
        handleBenchmarkError(res, error, "enable benchmark");
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
        const { benchmarkType } = req.body;
        const userId = req.session.user!.id;

        if (!benchmarkType || !['site', 'custom'].includes(benchmarkType)) {
          return res.status(400).json({ message: "benchmarkType must be 'site' or 'custom'" });
        }

        const context = {
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        };

        const disabled = await benchmarkService.disableBenchmarkForOrg(
          organizationId,
          id,
          benchmarkType,
          userId,
          context
        );

        res.json(disabled);
      } catch (error) {
        console.error("POST /api/organizations/:id/benchmarks/:id/disable error:", error);
        handleBenchmarkError(res, error, "disable benchmark");
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
        handleBenchmarkError(res, error, "fetch athlete benchmark status");
      }
    }
  );

  // ========================================================================
  // PEER COMPARISON (Phase 2.3)
  // ========================================================================

  /**
   * Get athlete's peer percentile rankings
   * Requires athlete to have opted into peer comparisons
   *
   * Query params:
   * - metrics: comma-separated list of metric codes (e.g., "FLY10_TIME,VERTICAL_JUMP")
   * - filters: JSON string of filter criteria (optional)
   */
  app.get("/api/athletes/:athleteId/peer-percentiles",
    benchmarkReadLimiter,
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { athleteId } = req.params;
        const userId = req.session.user!.id;

        // Security: Athletes can only view their own percentiles (or site admin can view any)
        const isSiteAdmin = await benchmarkService.isSiteAdmin(userId);
        if (athleteId !== userId && !isSiteAdmin) {
          return res.status(403).json({ message: "Can only view your own peer percentiles" });
        }

        // Parse metrics from query param
        const metricsParam = req.query.metrics as string;
        if (!metricsParam) {
          return res.status(400).json({ message: "metrics query parameter is required" });
        }
        const metrics = metricsParam.split(',').map(m => m.trim()).filter(m => m);

        // Parse and validate optional filters
        let filters: PeerFilterCriteria = {};
        if (req.query.filters) {
          try {
            const parsed = JSON.parse(req.query.filters as string);
            filters = peerFilterSchema.parse(parsed);
          } catch (parseError) {
            if (parseError instanceof z.ZodError) {
              return res.status(400).json({ message: "Invalid filters format", errors: parseError.errors });
            }
            return res.status(400).json({ message: "Invalid filters JSON" });
          }
        }

        const percentiles = await peerComparisonService.getAthletePercentiles(
          athleteId,
          metrics,
          filters
        );

        res.json({
          athleteId,
          percentiles,
        });
      } catch (error) {
        console.error("GET /api/athletes/:athleteId/peer-percentiles error:", error);
        handleBenchmarkError(res, error, "fetch peer percentiles");
      }
    }
  );

  /**
   * Get anonymous peer distribution for a metric
   * Returns aggregate statistics without individual data
   *
   * Query params:
   * - filters: JSON string of filter criteria (optional)
   */
  app.get("/api/peer-distributions/:metric",
    benchmarkReadLimiter,
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { metric } = req.params;

        // Parse and validate optional filters
        let filters: PeerFilterCriteria = {};
        if (req.query.filters) {
          try {
            const parsed = JSON.parse(req.query.filters as string);
            filters = peerFilterSchema.parse(parsed);
          } catch (parseError) {
            if (parseError instanceof z.ZodError) {
              return res.status(400).json({ message: "Invalid filters format", errors: parseError.errors });
            }
            return res.status(400).json({ message: "Invalid filters JSON" });
          }
        }

        const distribution = await peerComparisonService.getDistribution(metric, filters);

        res.json({
          metric,
          sampleSize: distribution.sampleSize,
          p10: distribution.p10,
          p25: distribution.p25,
          p50: distribution.p50,
          p75: distribution.p75,
          p90: distribution.p90,
          mean: distribution.mean,
        });
      } catch (error) {
        console.error("GET /api/peer-distributions/:metric error:", error);
        handleBenchmarkError(res, error, "fetch peer distribution");
      }
    }
  );

  /**
   * Get user's peer comparison opt-in status
   */
  app.get("/api/users/:userId/peer-comparison-status",
    benchmarkReadLimiter,
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const requestingUserId = req.session.user!.id;

        // Security: Users can only view their own status (or site admin can view any)
        const isSiteAdmin = await benchmarkService.isSiteAdmin(requestingUserId);
        if (userId !== requestingUserId && !isSiteAdmin) {
          return res.status(403).json({ message: "Can only view your own peer comparison status" });
        }

        const status = await peerComparisonService.getPeerComparisonOptInStatus(userId);

        res.json(status);
      } catch (error) {
        console.error("GET /api/users/:userId/peer-comparison-status error:", error);
        handleBenchmarkError(res, error, "fetch peer comparison status");
      }
    }
  );

  /**
   * Update user's peer comparison opt-in preference
   */
  app.patch("/api/users/:userId/peer-comparison-status",
    benchmarkModifyLimiter,
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const { optIn } = req.body;
        const requestingUserId = req.session.user!.id;

        if (typeof optIn !== 'boolean') {
          return res.status(400).json({ message: "optIn must be a boolean" });
        }

        await peerComparisonService.updatePeerComparisonOptIn(userId, optIn, requestingUserId);

        const status = await peerComparisonService.getPeerComparisonOptInStatus(userId);

        res.json(status);
      } catch (error) {
        console.error("PATCH /api/users/:userId/peer-comparison-status error:", error);
        handleBenchmarkError(res, error, "update peer comparison status");
      }
    }
  );
}
