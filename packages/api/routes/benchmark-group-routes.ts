/**
 * Benchmark group management routes
 * Site-level benchmark groups (site admin only) and organization-level custom groups
 */

import type { Express, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth, requireSiteAdmin, requireOrganizationAccess } from "../middleware";
import {
  insertSiteBenchmarkGroupSchema,
  updateSiteBenchmarkGroupSchema,
  insertCustomBenchmarkGroupSchema,
  updateCustomBenchmarkGroupSchema,
} from "@shared/schema";

function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const isProduction = process.env.NODE_ENV === 'production';
  const safeErrors = ['Unauthorized', 'not found', 'already exists', 'Cannot delete', 'not allowed'];

  if (isProduction) {
    return safeErrors.some(safe => error.message.includes(safe)) ? error.message : fallback;
  }
  return error.message;
}

function handleError(res: Response, error: unknown, operation: string): void {
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
  if (errorMessage.includes('not found')) {
    res.status(404).json({ message: error.message });
    return;
  }

  // 409 - Conflict (duplicate, constraint violation)
  if (errorMessage.includes('already exists') || errorMessage.includes('duplicate') || errorMessage.includes('unique constraint')) {
    res.status(409).json({ message: error.message });
    return;
  }

  // 400 - Validation errors
  if (error.name === 'ZodError' || errorMessage.includes('invalid') || errorMessage.includes('must be') || errorMessage.includes('required')) {
    res.status(400).json({ message: sanitizeError(error, `Failed to ${operation}`) });
    return;
  }

  // 500 - Unexpected errors
  res.status(500).json({ message: sanitizeError(error, `Failed to ${operation}`) });
}

// Rate limiters
const groupCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many group creation attempts" },
  skip: (req): boolean => {
    if (process.env.NODE_ENV === 'production') return false;
    if (process.env.NODE_ENV === 'test') return true;
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req): string => {
    const userId = req.session?.user?.id;
    const ip = ipKeyGenerator(req.ip || 'unknown');
    return userId ? `${ip}-${userId}` : ip;
  },
});

const groupModifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { message: "Too many group modification attempts" },
  skip: (req): boolean => {
    if (process.env.NODE_ENV === 'production') return false;
    if (process.env.NODE_ENV === 'test') return true;
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req): string => {
    const userId = req.session?.user?.id;
    const ip = ipKeyGenerator(req.ip || 'unknown');
    return userId ? `${ip}-${userId}` : ip;
  },
});

export function registerBenchmarkGroupRoutes(app: Express): void {
  // ========================================================================
  // SITE BENCHMARK GROUPS (Site Admin Only)
  // ========================================================================

  /**
   * GET /api/benchmark-groups
   * List all site benchmark groups
   * Query params: includeInactive, includeMembers
   */
  app.get(
    "/api/benchmark-groups",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const includeInactive = req.query.includeInactive === 'true';
        const includeMembers = req.query.includeMembers === 'true';

        if (includeMembers) {
          const groups = await storage.getSiteBenchmarkGroupsWithMembers({ includeInactive });
          res.json(groups);
        } else {
          const groups = await storage.getSiteBenchmarkGroups({ includeInactive });
          res.json(groups);
        }
      } catch (error) {
        handleError(res, error, "fetch site benchmark groups");
      }
    }
  );

  /**
   * GET /api/benchmark-groups/:id
   * Get a specific site benchmark group
   * Query params: includeMembers
   */
  app.get(
    "/api/benchmark-groups/:id",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const includeMembers = req.query.includeMembers === 'true';

        if (includeMembers) {
          const group = await storage.getSiteBenchmarkGroupWithMembers(id);
          if (!group) {
            res.status(404).json({ message: "Site benchmark group not found" });
            return;
          }
          res.json(group);
        } else {
          const group = await storage.getSiteBenchmarkGroup(id);
          if (!group) {
            res.status(404).json({ message: "Site benchmark group not found" });
            return;
          }
          res.json(group);
        }
      } catch (error) {
        handleError(res, error, "fetch site benchmark group");
      }
    }
  );

  /**
   * POST /api/benchmark-groups
   * Create a new site benchmark group (site admin only)
   */
  app.post(
    "/api/benchmark-groups",
    requireAuth,
    requireSiteAdmin,
    groupCreateLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const userId = req.session.user!.id;

        // Validate input
        const validatedData = insertSiteBenchmarkGroupSchema.parse(req.body);

        // Create group
        const group = await storage.createSiteBenchmarkGroup(validatedData, userId);

        res.status(201).json(group);
      } catch (error) {
        handleError(res, error, "create site benchmark group");
      }
    }
  );

  /**
   * PATCH /api/benchmark-groups/:id
   * Update a site benchmark group
   */
  app.patch(
    "/api/benchmark-groups/:id",
    requireAuth,
    requireSiteAdmin,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;

        // Validate input
        const validatedData = updateSiteBenchmarkGroupSchema.parse(req.body);

        // Update group
        const group = await storage.updateSiteBenchmarkGroup(id, validatedData);

        res.json(group);
      } catch (error) {
        handleError(res, error, "update site benchmark group");
      }
    }
  );

  /**
   * DELETE /api/benchmark-groups/:id
   * Delete a site benchmark group
   */
  app.delete(
    "/api/benchmark-groups/:id",
    requireAuth,
    requireSiteAdmin,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;

        await storage.deleteSiteBenchmarkGroup(id);

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "delete site benchmark group");
      }
    }
  );

  /**
   * POST /api/benchmark-groups/:id/benchmarks/:benchmarkId
   * Add a benchmark to a site benchmark group
   */
  app.post(
    "/api/benchmark-groups/:id/benchmarks/:benchmarkId",
    requireAuth,
    requireSiteAdmin,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id: groupId, benchmarkId } = req.params;
        const { displayOrder } = req.body;

        const member = await storage.addBenchmarkToSiteGroup(
          groupId,
          benchmarkId,
          displayOrder
        );

        res.status(201).json(member);
      } catch (error) {
        handleError(res, error, "add benchmark to site group");
      }
    }
  );

  /**
   * DELETE /api/benchmark-groups/:id/benchmarks/:benchmarkId
   * Remove a benchmark from a site benchmark group
   */
  app.delete(
    "/api/benchmark-groups/:id/benchmarks/:benchmarkId",
    requireAuth,
    requireSiteAdmin,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id: groupId, benchmarkId } = req.params;

        await storage.removeBenchmarkFromSiteGroup(groupId, benchmarkId);

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "remove benchmark from site group");
      }
    }
  );

  // ========================================================================
  // CUSTOM BENCHMARK GROUPS (Organization-specific)
  // ========================================================================

  /**
   * GET /api/organizations/:orgId/benchmark-groups/custom
   * List custom benchmark groups for an organization
   * Query params: includeInactive, includeMembers
   */
  app.get(
    "/api/organizations/:orgId/benchmark-groups/custom",
    requireAuth,
    requireOrganizationAccess,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { orgId } = req.params;
        const includeInactive = req.query.includeInactive === 'true';
        const includeMembers = req.query.includeMembers === 'true';

        if (includeMembers) {
          const groups = await storage.getCustomBenchmarkGroupsWithMembersForOrg(orgId, { includeInactive });
          res.json(groups);
        } else {
          const groups = await storage.getCustomBenchmarkGroupsForOrg(orgId, { includeInactive });
          res.json(groups);
        }
      } catch (error) {
        handleError(res, error, "fetch custom benchmark groups");
      }
    }
  );

  /**
   * GET /api/organizations/:orgId/benchmark-groups/custom/:id
   * Get a specific custom benchmark group
   * Query params: includeMembers
   */
  app.get(
    "/api/organizations/:orgId/benchmark-groups/custom/:id",
    requireAuth,
    requireOrganizationAccess,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id } = req.params;
        const includeMembers = req.query.includeMembers === 'true';

        if (includeMembers) {
          const group = await storage.getCustomBenchmarkGroupWithMembers(id);
          if (!group) {
            res.status(404).json({ message: "Custom benchmark group not found" });
            return;
          }
          res.json(group);
        } else {
          const group = await storage.getCustomBenchmarkGroup(id);
          if (!group) {
            res.status(404).json({ message: "Custom benchmark group not found" });
            return;
          }
          res.json(group);
        }
      } catch (error) {
        handleError(res, error, "fetch custom benchmark group");
      }
    }
  );

  /**
   * POST /api/organizations/:orgId/benchmark-groups/custom
   * Create a new custom benchmark group
   */
  app.post(
    "/api/organizations/:orgId/benchmark-groups/custom",
    requireAuth,
    requireOrganizationAccess,
    groupCreateLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { orgId } = req.params;
        const userId = req.session.user!.id;

        // Validate input
        const validatedData = insertCustomBenchmarkGroupSchema.parse({
          ...req.body,
          organizationId: orgId,
        });

        // Create group
        const group = await storage.createCustomBenchmarkGroup(validatedData, userId);

        res.status(201).json(group);
      } catch (error) {
        handleError(res, error, "create custom benchmark group");
      }
    }
  );

  /**
   * PATCH /api/organizations/:orgId/benchmark-groups/custom/:id
   * Update a custom benchmark group
   */
  app.patch(
    "/api/organizations/:orgId/benchmark-groups/custom/:id",
    requireAuth,
    requireOrganizationAccess,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { orgId, id } = req.params;

        // Validate input
        const validatedData = updateCustomBenchmarkGroupSchema.parse(req.body);

        // Update group
        const group = await storage.updateCustomBenchmarkGroup(orgId, id, validatedData);

        res.json(group);
      } catch (error) {
        handleError(res, error, "update custom benchmark group");
      }
    }
  );

  /**
   * DELETE /api/organizations/:orgId/benchmark-groups/custom/:id
   * Delete a custom benchmark group
   */
  app.delete(
    "/api/organizations/:orgId/benchmark-groups/custom/:id",
    requireAuth,
    requireOrganizationAccess,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { orgId, id } = req.params;

        await storage.deleteCustomBenchmarkGroup(orgId, id);

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "delete custom benchmark group");
      }
    }
  );

  /**
   * POST /api/organizations/:orgId/benchmark-groups/custom/:id/benchmarks/:benchmarkId
   * Add a benchmark to a custom benchmark group
   */
  app.post(
    "/api/organizations/:orgId/benchmark-groups/custom/:id/benchmarks/:benchmarkId",
    requireAuth,
    requireOrganizationAccess,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id: groupId, benchmarkId } = req.params;
        const { displayOrder } = req.body;

        const member = await storage.addBenchmarkToCustomGroup(
          groupId,
          benchmarkId,
          displayOrder
        );

        res.status(201).json(member);
      } catch (error) {
        handleError(res, error, "add benchmark to custom group");
      }
    }
  );

  /**
   * DELETE /api/organizations/:orgId/benchmark-groups/custom/:id/benchmarks/:benchmarkId
   * Remove a benchmark from a custom benchmark group
   */
  app.delete(
    "/api/organizations/:orgId/benchmark-groups/custom/:id/benchmarks/:benchmarkId",
    requireAuth,
    requireOrganizationAccess,
    groupModifyLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { id: groupId, benchmarkId } = req.params;

        await storage.removeBenchmarkFromCustomGroup(groupId, benchmarkId);

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "remove benchmark from custom group");
      }
    }
  );
}
