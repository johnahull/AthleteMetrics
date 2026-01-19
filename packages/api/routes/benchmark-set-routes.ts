/**
 * Benchmark Set management routes
 * Organization-level benchmark sets (named collections of benchmarks)
 */

import type { Express, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db } from "../db";
import {
  benchmarkSets,
  benchmarkSetItems,
  siteBenchmarks,
  customBenchmarks,
  organizationBenchmarkSets,
  insertBenchmarkSetSchema,
  updateBenchmarkSetSchema,
  insertBenchmarkSetItemSchema,
  reorderBenchmarkSetItemsSchema,
} from "@shared/schema";
import { requireAuth, requireOrganizationAccess, requireSiteAdmin } from "../middleware";
import { requireRole } from "../permissions/middleware";
import { eq, and, asc, inArray, isNull } from "drizzle-orm";

// Rate limiters
const setCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: "Too many benchmark set creation attempts" },
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

const setModifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: { message: "Too many benchmark set modification attempts" },
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

const setReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  message: { message: "Too many benchmark set requests" },
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

/**
 * Standardized error handler for benchmark set routes
 */
function handleError(res: Response, error: unknown, operation: string): void {
  console.error(`Benchmark set ${operation} error:`, error);

  if (!(error instanceof Error)) {
    res.status(500).json({ message: `Failed to ${operation}` });
    return;
  }

  const errorMessage = error.message.toLowerCase();

  // 403 - Permission denied
  if (errorMessage.includes('unauthorized') || errorMessage.includes('permission') || errorMessage.includes('not allowed')) {
    res.status(403).json({ message: error.message });
    return;
  }

  // 404 - Not found
  if (errorMessage.includes('not found')) {
    res.status(404).json({ message: error.message });
    return;
  }

  // 409 - Conflict (duplicate)
  if (errorMessage.includes('already exists') || errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
    res.status(409).json({ message: error.message });
    return;
  }

  // 400 - Validation error
  if (error.name === 'ZodError') {
    res.status(400).json({ message: `Validation error: ${error.message}` });
    return;
  }

  res.status(500).json({ message: `Failed to ${operation}` });
}

/**
 * Fetch benchmark details for site-level set items
 * Site sets only contain site benchmarks (no custom benchmarks)
 * @param items - The benchmark set items to enrich
 */
async function enrichSiteSetItems(
  items: typeof benchmarkSetItems.$inferSelect[]
) {
  if (items.length === 0) return [];

  // Site sets only have site benchmarks
  const siteIds = items.map(i => i.benchmarkId);

  const siteBenchmarksMap = new Map<string, any>();
  if (siteIds.length > 0) {
    const siteBenchmarkResults = await db
      .select({
        id: siteBenchmarks.id,
        name: siteBenchmarks.name,
        metricCode: siteBenchmarks.metricCode,
        benchmarkValue: siteBenchmarks.benchmarkValue,
        comparisonOperator: siteBenchmarks.comparisonOperator,
      })
      .from(siteBenchmarks)
      .where(inArray(siteBenchmarks.id, siteIds));
    siteBenchmarkResults.forEach(b => siteBenchmarksMap.set(b.id, b));
  }

  return items.map(item => ({
    ...item,
    benchmark: siteBenchmarksMap.get(item.benchmarkId) || null,
  }));
}

/**
 * Fetch benchmark details for set items
 * Uses batched queries to avoid N+1 performance issues
 * @param items - The benchmark set items to enrich
 * @param organizationId - Organization ID for scoping custom benchmarks
 */
async function enrichSetItems(
  items: typeof benchmarkSetItems.$inferSelect[],
  organizationId: string
) {
  if (items.length === 0) return [];

  // Separate IDs by benchmark type
  const siteIds = items.filter(i => i.benchmarkType === 'site').map(i => i.benchmarkId);
  const customIds = items.filter(i => i.benchmarkType === 'custom').map(i => i.benchmarkId);

  // Batch fetch site benchmarks
  const siteBenchmarksMap = new Map<string, any>();
  if (siteIds.length > 0) {
    const siteBenchmarkResults = await db
      .select({
        id: siteBenchmarks.id,
        name: siteBenchmarks.name,
        metricCode: siteBenchmarks.metricCode,
        benchmarkValue: siteBenchmarks.benchmarkValue,
        comparisonOperator: siteBenchmarks.comparisonOperator,
      })
      .from(siteBenchmarks)
      .where(inArray(siteBenchmarks.id, siteIds));
    siteBenchmarkResults.forEach(b => siteBenchmarksMap.set(b.id, b));
  }

  // Batch fetch custom benchmarks (scoped to organization)
  const customBenchmarksMap = new Map<string, any>();
  if (customIds.length > 0) {
    const customBenchmarkResults = await db
      .select({
        id: customBenchmarks.id,
        name: customBenchmarks.name,
        metricCode: customBenchmarks.metricCode,
        benchmarkValue: customBenchmarks.benchmarkValue,
        comparisonOperator: customBenchmarks.comparisonOperator,
      })
      .from(customBenchmarks)
      .where(and(
        inArray(customBenchmarks.id, customIds),
        eq(customBenchmarks.organizationId, organizationId)
      ));
    customBenchmarkResults.forEach(b => customBenchmarksMap.set(b.id, b));
  }

  // Map items to enriched items
  return items.map(item => ({
    ...item,
    benchmark: item.benchmarkType === 'site'
      ? siteBenchmarksMap.get(item.benchmarkId) || null
      : customBenchmarksMap.get(item.benchmarkId) || null,
  }));
}

export function registerBenchmarkSetRoutes(app: Express) {
  // ========================================================================
  // BENCHMARK SETS CRUD
  // ========================================================================

  // List benchmark sets for organization
  // Also includes active site-level sets (read-only for orgs) unless disabled by org admin
  app.get("/api/organizations/:organizationId/benchmark-sets",
    setReadLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.params;
        const includeInactive = req.query.includeInactive === 'true';
        const includeHiddenSiteSets = req.query.includeHiddenSiteSets === 'true';

        // Fetch org-level sets
        const orgSets = await db
          .select()
          .from(benchmarkSets)
          .where(eq(benchmarkSets.organizationId, organizationId))
          .orderBy(asc(benchmarkSets.name));

        // Filter inactive org sets if needed
        const filteredOrgSets = includeInactive
          ? orgSets
          : orgSets.filter(s => s.isActive);

        // Fetch active site-level sets (always active only, read-only for orgs)
        const siteSets = await db
          .select()
          .from(benchmarkSets)
          .where(
            and(
              isNull(benchmarkSets.organizationId),
              eq(benchmarkSets.isActive, true)
            )
          )
          .orderBy(asc(benchmarkSets.name));

        // Fetch disabled site set IDs for this org
        const disabledSetsResults = await db
          .select({ siteSetId: organizationBenchmarkSets.siteSetId })
          .from(organizationBenchmarkSets)
          .where(and(
            eq(organizationBenchmarkSets.organizationId, organizationId),
            eq(organizationBenchmarkSets.isEnabled, false)
          ));
        const disabledSetIds = new Set(disabledSetsResults.map(d => d.siteSetId));

        // Filter site sets based on org visibility preferences
        // If includeHiddenSiteSets is true, mark hidden sets but still include them
        const visibleSiteSets = includeHiddenSiteSets
          ? siteSets.map(s => ({ ...s, isHiddenForOrg: disabledSetIds.has(s.id) }))
          : siteSets.filter(s => !disabledSetIds.has(s.id));

        // Return site sets first (templates), then org sets
        res.json([...visibleSiteSets, ...filteredOrgSets]);
      } catch (error) {
        handleError(res, error, "list benchmark sets");
      }
    }
  );

  // Get single benchmark set with items
  // Also supports fetching active site-level sets (read-only for orgs)
  app.get("/api/organizations/:organizationId/benchmark-sets/:setId",
    setReadLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, setId } = req.params;

        // First, try to get an org-level set
        let [set] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            eq(benchmarkSets.organizationId, organizationId)
          ));

        // If not found, check for active site-level set
        if (!set) {
          [set] = await db
            .select()
            .from(benchmarkSets)
            .where(and(
              eq(benchmarkSets.id, setId),
              isNull(benchmarkSets.organizationId),
              eq(benchmarkSets.isActive, true)
            ));
        }

        if (!set) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Get items
        const items = await db
          .select()
          .from(benchmarkSetItems)
          .where(eq(benchmarkSetItems.setId, setId))
          .orderBy(asc(benchmarkSetItems.displayOrder));

        // Enrich with benchmark details
        // Use site enrichment for site sets (no custom benchmarks)
        const enrichedItems = set.organizationId === null
          ? await enrichSiteSetItems(items)
          : await enrichSetItems(items, organizationId);

        res.json({
          ...set,
          items: enrichedItems,
        });
      } catch (error) {
        handleError(res, error, "get benchmark set");
      }
    }
  );

  // Create benchmark set
  app.post("/api/organizations/:organizationId/benchmark-sets",
    setCreateLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireRole('coach'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.params;
        const userId = req.session.user!.id;

        const validatedData = insertBenchmarkSetSchema.parse(req.body);

        // Check for duplicate name
        const [existing] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.organizationId, organizationId),
            eq(benchmarkSets.name, validatedData.name)
          ));

        if (existing) {
          return res.status(409).json({
            message: `A benchmark set named "${validatedData.name}" already exists in this organization`
          });
        }

        const [newSet] = await db
          .insert(benchmarkSets)
          .values({
            ...validatedData,
            organizationId,
            createdBy: userId,
          })
          .returning();

        res.status(201).json(newSet);
      } catch (error) {
        handleError(res, error, "create benchmark set");
      }
    }
  );

  // Update benchmark set
  app.patch("/api/organizations/:organizationId/benchmark-sets/:setId",
    setModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireRole('coach'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, setId } = req.params;

        const validatedData = updateBenchmarkSetSchema.parse(req.body);

        // Check set exists and belongs to org
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            eq(benchmarkSets.organizationId, organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Check for duplicate name if name is being changed
        if (validatedData.name && validatedData.name !== existingSet.name) {
          const [duplicate] = await db
            .select()
            .from(benchmarkSets)
            .where(and(
              eq(benchmarkSets.organizationId, organizationId),
              eq(benchmarkSets.name, validatedData.name)
            ));

          if (duplicate) {
            return res.status(409).json({
              message: `A benchmark set named "${validatedData.name}" already exists in this organization`
            });
          }
        }

        const [updated] = await db
          .update(benchmarkSets)
          .set({
            ...validatedData,
            updatedAt: new Date(),
          })
          .where(eq(benchmarkSets.id, setId))
          .returning();

        res.json(updated);
      } catch (error) {
        handleError(res, error, "update benchmark set");
      }
    }
  );

  // Delete benchmark set
  app.delete("/api/organizations/:organizationId/benchmark-sets/:setId",
    setModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireRole('coach'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, setId } = req.params;

        // Check set exists and belongs to org
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            eq(benchmarkSets.organizationId, organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Delete (cascade will delete items)
        await db
          .delete(benchmarkSets)
          .where(eq(benchmarkSets.id, setId));

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "delete benchmark set");
      }
    }
  );

  // ========================================================================
  // BENCHMARK SET ITEMS
  // ========================================================================

  // Add benchmark to set
  app.post("/api/organizations/:organizationId/benchmark-sets/:setId/items",
    setModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireRole('coach'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, setId } = req.params;

        const validatedData = insertBenchmarkSetItemSchema.parse(req.body);

        // Check set exists and belongs to org
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            eq(benchmarkSets.organizationId, organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Verify the benchmark exists
        if (validatedData.benchmarkType === 'site') {
          const [benchmark] = await db
            .select()
            .from(siteBenchmarks)
            .where(eq(siteBenchmarks.id, validatedData.benchmarkId));
          if (!benchmark) {
            return res.status(404).json({ message: "Site benchmark not found" });
          }
        } else {
          const [benchmark] = await db
            .select()
            .from(customBenchmarks)
            .where(and(
              eq(customBenchmarks.id, validatedData.benchmarkId),
              eq(customBenchmarks.organizationId, organizationId)
            ));
          if (!benchmark) {
            return res.status(404).json({ message: "Custom benchmark not found" });
          }
        }

        // Check for duplicate
        const [existing] = await db
          .select()
          .from(benchmarkSetItems)
          .where(and(
            eq(benchmarkSetItems.setId, setId),
            eq(benchmarkSetItems.benchmarkId, validatedData.benchmarkId),
            eq(benchmarkSetItems.benchmarkType, validatedData.benchmarkType)
          ));

        if (existing) {
          return res.status(409).json({
            message: "This benchmark is already in the set"
          });
        }

        // Get max display order
        const items = await db
          .select({ displayOrder: benchmarkSetItems.displayOrder })
          .from(benchmarkSetItems)
          .where(eq(benchmarkSetItems.setId, setId));

        const maxOrder = items.length > 0
          ? Math.max(...items.map(i => i.displayOrder))
          : -1;

        const [newItem] = await db
          .insert(benchmarkSetItems)
          .values({
            setId,
            benchmarkId: validatedData.benchmarkId,
            benchmarkType: validatedData.benchmarkType,
            displayOrder: validatedData.displayOrder ?? maxOrder + 1,
            customLabel: validatedData.customLabel,
          })
          .returning();

        // Return enriched item
        const enrichedItems = await enrichSetItems([newItem], organizationId);
        res.status(201).json(enrichedItems[0]);
      } catch (error) {
        handleError(res, error, "add benchmark to set");
      }
    }
  );

  // Remove benchmark from set
  app.delete("/api/organizations/:organizationId/benchmark-sets/:setId/items/:itemId",
    setModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireRole('coach'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, setId, itemId } = req.params;

        // Check set exists and belongs to org
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            eq(benchmarkSets.organizationId, organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Check item exists in set
        const [existingItem] = await db
          .select()
          .from(benchmarkSetItems)
          .where(and(
            eq(benchmarkSetItems.id, itemId),
            eq(benchmarkSetItems.setId, setId)
          ));

        if (!existingItem) {
          return res.status(404).json({ message: "Item not found in set" });
        }

        await db
          .delete(benchmarkSetItems)
          .where(eq(benchmarkSetItems.id, itemId));

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "remove benchmark from set");
      }
    }
  );

  // Reorder items in set
  app.patch("/api/organizations/:organizationId/benchmark-sets/:setId/items/reorder",
    setModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireRole('coach'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, setId } = req.params;

        const validatedData = reorderBenchmarkSetItemsSchema.parse(req.body);

        // Check set exists and belongs to org
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            eq(benchmarkSets.organizationId, organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Update each item's display order
        for (const item of validatedData.items) {
          await db
            .update(benchmarkSetItems)
            .set({ displayOrder: item.displayOrder })
            .where(and(
              eq(benchmarkSetItems.id, item.id),
              eq(benchmarkSetItems.setId, setId)
            ));
        }

        // Return updated items
        const items = await db
          .select()
          .from(benchmarkSetItems)
          .where(eq(benchmarkSetItems.setId, setId))
          .orderBy(asc(benchmarkSetItems.displayOrder));

        const enrichedItems = await enrichSetItems(items, organizationId);

        res.json({ items: enrichedItems });
      } catch (error) {
        handleError(res, error, "reorder benchmark set items");
      }
    }
  );

  // ========================================================================
  // BENCHMARK MEMBERSHIPS
  // Returns which sets each benchmark belongs to (for showing set badges)
  // ========================================================================

  // Get benchmark set memberships for an organization
  app.get("/api/organizations/:organizationId/benchmark-memberships",
    setReadLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.params;

        // Join benchmarkSetItems with benchmarkSets to get set names
        const items = await db
          .select({
            benchmarkId: benchmarkSetItems.benchmarkId,
            benchmarkType: benchmarkSetItems.benchmarkType,
            setId: benchmarkSets.id,
            setName: benchmarkSets.name,
          })
          .from(benchmarkSetItems)
          .innerJoin(benchmarkSets, eq(benchmarkSetItems.setId, benchmarkSets.id))
          .where(and(
            eq(benchmarkSets.organizationId, organizationId),
            eq(benchmarkSets.isActive, true)
          ));

        // Group by benchmarkId
        const memberships: Record<string, Array<{setId: string, setName: string}>> = {};
        for (const item of items) {
          if (!memberships[item.benchmarkId]) {
            memberships[item.benchmarkId] = [];
          }
          memberships[item.benchmarkId].push({
            setId: item.setId,
            setName: item.setName,
          });
        }

        res.json(memberships);
      } catch (error) {
        handleError(res, error, "get benchmark memberships");
      }
    }
  );

  // ========================================================================
  // SITE BENCHMARK SET VISIBILITY (Org Admin Only)
  // Allows org admins to hide/show site-level benchmark sets for their org
  // ========================================================================

  // Toggle site benchmark set visibility for organization
  app.patch("/api/organizations/:organizationId/site-benchmark-sets/:setId/visibility",
    setModifyLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireRole('org_admin'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId, setId } = req.params;
        const { isEnabled } = req.body;

        if (typeof isEnabled !== 'boolean') {
          return res.status(400).json({ message: "isEnabled must be a boolean" });
        }

        // Verify the site benchmark set exists
        const [siteSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            isNull(benchmarkSets.organizationId)
          ));

        if (!siteSet) {
          return res.status(404).json({ message: "Site benchmark set not found" });
        }

        // Check if there's already an entry for this org/set combination
        const [existing] = await db
          .select()
          .from(organizationBenchmarkSets)
          .where(and(
            eq(organizationBenchmarkSets.organizationId, organizationId),
            eq(organizationBenchmarkSets.siteSetId, setId)
          ));

        if (existing) {
          // Update existing entry
          const [updated] = await db
            .update(organizationBenchmarkSets)
            .set({
              isEnabled,
              updatedAt: new Date(),
            })
            .where(eq(organizationBenchmarkSets.id, existing.id))
            .returning();

          return res.json(updated);
        } else {
          // Create new entry
          const [created] = await db
            .insert(organizationBenchmarkSets)
            .values({
              organizationId,
              siteSetId: setId,
              isEnabled,
            })
            .returning();

          return res.status(201).json(created);
        }
      } catch (error) {
        handleError(res, error, "toggle site benchmark set visibility");
      }
    }
  );

  // Get visibility status of site benchmark sets for organization
  app.get("/api/organizations/:organizationId/site-benchmark-sets/visibility",
    setReadLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.params;

        // Get all visibility overrides for this org
        const overrides = await db
          .select()
          .from(organizationBenchmarkSets)
          .where(eq(organizationBenchmarkSets.organizationId, organizationId));

        // Create a map of setId -> isEnabled
        const visibilityMap: Record<string, boolean> = {};
        for (const override of overrides) {
          visibilityMap[override.siteSetId] = override.isEnabled;
        }

        res.json(visibilityMap);
      } catch (error) {
        handleError(res, error, "get site benchmark set visibility");
      }
    }
  );

  // ========================================================================
  // SITE-LEVEL BENCHMARK SETS (Site Admin Only)
  // These endpoints manage benchmark sets at the site level (organizationId = NULL)
  // Only site admins can access these endpoints
  // ========================================================================

  // List site-level benchmark sets
  app.get("/api/site-benchmark-sets",
    setReadLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const includeInactive = req.query.includeInactive === 'true';

        const sets = await db
          .select()
          .from(benchmarkSets)
          .where(isNull(benchmarkSets.organizationId))
          .orderBy(asc(benchmarkSets.name));

        const filteredSets = includeInactive
          ? sets
          : sets.filter(s => s.isActive);

        res.json(filteredSets);
      } catch (error) {
        handleError(res, error, "list site benchmark sets");
      }
    }
  );

  // Get single site-level benchmark set with items
  app.get("/api/site-benchmark-sets/:setId",
    setReadLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { setId } = req.params;

        // Get the set (must be site-level - organizationId IS NULL)
        const [set] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            isNull(benchmarkSets.organizationId)
          ));

        if (!set) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Get items
        const items = await db
          .select()
          .from(benchmarkSetItems)
          .where(eq(benchmarkSetItems.setId, setId))
          .orderBy(asc(benchmarkSetItems.displayOrder));

        // Enrich with benchmark details (site benchmarks only)
        const enrichedItems = await enrichSiteSetItems(items);

        res.json({
          ...set,
          items: enrichedItems,
        });
      } catch (error) {
        handleError(res, error, "get site benchmark set");
      }
    }
  );

  // Create site-level benchmark set
  app.post("/api/site-benchmark-sets",
    setCreateLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.user!.id;

        const validatedData = insertBenchmarkSetSchema.parse(req.body);

        // Check for duplicate name among site-level sets
        const [existing] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            isNull(benchmarkSets.organizationId),
            eq(benchmarkSets.name, validatedData.name)
          ));

        if (existing) {
          return res.status(409).json({
            message: `A site-level benchmark set named "${validatedData.name}" already exists`
          });
        }

        const [newSet] = await db
          .insert(benchmarkSets)
          .values({
            ...validatedData,
            organizationId: null, // Site-level
            createdBy: userId,
          })
          .returning();

        res.status(201).json(newSet);
      } catch (error) {
        handleError(res, error, "create site benchmark set");
      }
    }
  );

  // Update site-level benchmark set
  app.patch("/api/site-benchmark-sets/:setId",
    setModifyLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { setId } = req.params;

        const validatedData = updateBenchmarkSetSchema.parse(req.body);

        // Check set exists and is site-level
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            isNull(benchmarkSets.organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Check for duplicate name if name is being changed
        if (validatedData.name && validatedData.name !== existingSet.name) {
          const [duplicate] = await db
            .select()
            .from(benchmarkSets)
            .where(and(
              isNull(benchmarkSets.organizationId),
              eq(benchmarkSets.name, validatedData.name)
            ));

          if (duplicate) {
            return res.status(409).json({
              message: `A site-level benchmark set named "${validatedData.name}" already exists`
            });
          }
        }

        const [updated] = await db
          .update(benchmarkSets)
          .set({
            ...validatedData,
            updatedAt: new Date(),
          })
          .where(eq(benchmarkSets.id, setId))
          .returning();

        res.json(updated);
      } catch (error) {
        handleError(res, error, "update site benchmark set");
      }
    }
  );

  // Delete site-level benchmark set
  app.delete("/api/site-benchmark-sets/:setId",
    setModifyLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { setId } = req.params;

        // Check set exists and is site-level
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            isNull(benchmarkSets.organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Delete (cascade will delete items)
        await db
          .delete(benchmarkSets)
          .where(eq(benchmarkSets.id, setId));

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "delete site benchmark set");
      }
    }
  );

  // ========================================================================
  // SITE-LEVEL BENCHMARK SET ITEMS
  // ========================================================================

  // Add benchmark to site-level set
  app.post("/api/site-benchmark-sets/:setId/items",
    setModifyLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { setId } = req.params;

        const validatedData = insertBenchmarkSetItemSchema.parse(req.body);

        // Check set exists and is site-level
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            isNull(benchmarkSets.organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Site sets can ONLY contain site benchmarks
        if (validatedData.benchmarkType !== 'site') {
          return res.status(400).json({
            message: "Site-level benchmark sets can only contain site benchmarks"
          });
        }

        // Verify the site benchmark exists
        const [benchmark] = await db
          .select()
          .from(siteBenchmarks)
          .where(eq(siteBenchmarks.id, validatedData.benchmarkId));

        if (!benchmark) {
          return res.status(404).json({ message: "Site benchmark not found" });
        }

        // Check for duplicate
        const [existing] = await db
          .select()
          .from(benchmarkSetItems)
          .where(and(
            eq(benchmarkSetItems.setId, setId),
            eq(benchmarkSetItems.benchmarkId, validatedData.benchmarkId),
            eq(benchmarkSetItems.benchmarkType, validatedData.benchmarkType)
          ));

        if (existing) {
          return res.status(409).json({
            message: "This benchmark is already in the set"
          });
        }

        // Get max display order
        const items = await db
          .select({ displayOrder: benchmarkSetItems.displayOrder })
          .from(benchmarkSetItems)
          .where(eq(benchmarkSetItems.setId, setId));

        const maxOrder = items.length > 0
          ? Math.max(...items.map(i => i.displayOrder))
          : -1;

        const [newItem] = await db
          .insert(benchmarkSetItems)
          .values({
            setId,
            benchmarkId: validatedData.benchmarkId,
            benchmarkType: validatedData.benchmarkType,
            displayOrder: validatedData.displayOrder ?? maxOrder + 1,
            customLabel: validatedData.customLabel,
          })
          .returning();

        // Return enriched item
        const enrichedItems = await enrichSiteSetItems([newItem]);
        res.status(201).json(enrichedItems[0]);
      } catch (error) {
        handleError(res, error, "add benchmark to site set");
      }
    }
  );

  // Remove benchmark from site-level set
  app.delete("/api/site-benchmark-sets/:setId/items/:itemId",
    setModifyLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { setId, itemId } = req.params;

        // Check set exists and is site-level
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            isNull(benchmarkSets.organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Check item exists in set
        const [existingItem] = await db
          .select()
          .from(benchmarkSetItems)
          .where(and(
            eq(benchmarkSetItems.id, itemId),
            eq(benchmarkSetItems.setId, setId)
          ));

        if (!existingItem) {
          return res.status(404).json({ message: "Item not found in set" });
        }

        await db
          .delete(benchmarkSetItems)
          .where(eq(benchmarkSetItems.id, itemId));

        res.status(204).send();
      } catch (error) {
        handleError(res, error, "remove benchmark from site set");
      }
    }
  );

  // Reorder items in site-level set
  app.patch("/api/site-benchmark-sets/:setId/items/reorder",
    setModifyLimiter,
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { setId } = req.params;

        const validatedData = reorderBenchmarkSetItemsSchema.parse(req.body);

        // Check set exists and is site-level
        const [existingSet] = await db
          .select()
          .from(benchmarkSets)
          .where(and(
            eq(benchmarkSets.id, setId),
            isNull(benchmarkSets.organizationId)
          ));

        if (!existingSet) {
          return res.status(404).json({ message: "Benchmark set not found" });
        }

        // Update each item's display order
        for (const item of validatedData.items) {
          await db
            .update(benchmarkSetItems)
            .set({ displayOrder: item.displayOrder })
            .where(and(
              eq(benchmarkSetItems.id, item.id),
              eq(benchmarkSetItems.setId, setId)
            ));
        }

        // Return updated items
        const items = await db
          .select()
          .from(benchmarkSetItems)
          .where(eq(benchmarkSetItems.setId, setId))
          .orderBy(asc(benchmarkSetItems.displayOrder));

        const enrichedItems = await enrichSiteSetItems(items);

        res.json({ items: enrichedItems });
      } catch (error) {
        handleError(res, error, "reorder site benchmark set items");
      }
    }
  );
}
