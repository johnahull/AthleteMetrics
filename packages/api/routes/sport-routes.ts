/**
 * Sports and Positions Management Routes
 *
 * Provides endpoints for managing sports and their positions:
 * - Site admins can CRUD sports and positions
 * - Authenticated users can read active sports and positions
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  requireAuth,
  requireSiteAdmin,
} from "../middleware";
import {
  siteSports,
  sitePositions,
  insertSiteSportSchema,
  updateSiteSportSchema,
  insertSitePositionSchema,
  updateSitePositionSchema,
  users,
  teams,
  siteMetrics,
} from "@shared/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { getPgErrorCode, PG_UNIQUE_VIOLATION } from "../lib/pg-error";

// Validation regex patterns
const SPORT_CODE_REGEX = /^[A-Za-z0-9_]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgreSQL error codes
const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: PG_UNIQUE_VIOLATION,
  FOREIGN_KEY_VIOLATION: '23503',
} as const;

/**
 * Register sports management routes
 */
export function registerSportsRoutes(app: Express) {
  // ============================================================================
  // SPORTS ROUTES
  // ============================================================================

  /**
   * GET /api/sports
   * Get all active sports with their positions
   * Access: Authenticated users
   */
  app.get(
    "/api/sports",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const sports = await db
          .select()
          .from(siteSports)
          .where(eq(siteSports.isActive, true))
          .orderBy(asc(siteSports.displayOrder), asc(siteSports.name));

        res.json(sports);
      } catch (error: any) {
        console.error("❌ Failed to fetch sports:", error);
        res.status(500).json({
          message: "Failed to fetch sports",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * GET /api/site-sports
   * Get all sports including inactive (for admin management)
   * Access: Site Admin only
   */
  app.get(
    "/api/site-sports",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const sports = await db
          .select()
          .from(siteSports)
          .orderBy(asc(siteSports.displayOrder), asc(siteSports.name));

        res.json(sports);
      } catch (error: any) {
        console.error("❌ Failed to fetch all sports:", error);
        res.status(500).json({
          message: "Failed to fetch sports",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * GET /api/sports/:code
   * Get sport details by code with positions
   * Access: Authenticated users
   */
  app.get(
    "/api/sports/:code",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;

        const [sport] = await db
          .select()
          .from(siteSports)
          .where(eq(siteSports.code, code));

        if (!sport) {
          return res.status(404).json({ message: "Sport not found" });
        }

        // Get positions for this sport
        const positions = await db
          .select()
          .from(sitePositions)
          .where(
            and(
              eq(sitePositions.sportId, sport.id),
              eq(sitePositions.isActive, true)
            )
          )
          .orderBy(asc(sitePositions.displayOrder), asc(sitePositions.name));

        res.json({ ...sport, positions });
      } catch (error: any) {
        console.error("❌ Failed to fetch sport:", error);
        res.status(500).json({
          message: "Failed to fetch sport",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * GET /api/sports/:code/usage
   * Get usage statistics for a sport
   * Access: Site Admin only
   */
  app.get(
    "/api/sports/:code/usage",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;

        // SECURITY: Validate code format to prevent SQL injection
        // Sport codes should only contain uppercase letters, numbers, and underscores
        if (!code || !SPORT_CODE_REGEX.test(code)) {
          return res.status(400).json({ message: "Invalid sport code format" });
        }

        // Verify sport exists
        const [sport] = await db
          .select()
          .from(siteSports)
          .where(eq(siteSports.code, code));

        if (!sport) {
          return res.status(404).json({ message: "Sport not found" });
        }

        // Count athletes using this sport
        // Use parameterized query with sql.raw for the column reference
        const athleteResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(sql`${sql.param(code)} = ANY(${users.sports})`);
        const athleteCount = Number(athleteResult[0]?.count || 0);

        // Count teams using this sport
        const teamResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(teams)
          .where(eq(teams.sport, code));
        const teamCount = Number(teamResult[0]?.count || 0);

        // Count metrics associated with this sport
        const metricResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(siteMetrics)
          .where(sql`${sql.param(code)} = ANY(${siteMetrics.sportAssociations})`);
        const metricCount = Number(metricResult[0]?.count || 0);

        res.json({
          athleteCount,
          teamCount,
          metricCount,
        });
      } catch (error: any) {
        console.error("❌ Failed to fetch sport usage:", error);
        res.status(500).json({
          message: "Failed to fetch sport usage",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/sports
   * Create a new sport
   * Access: Site Admin only
   */
  app.post(
    "/api/sports",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const validation = insertSiteSportSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid sport data",
            errors: validation.error.flatten().fieldErrors,
          });
        }

        const { code, name, description, icon, color, displayOrder, isActive } = validation.data;

        // Create the sport - database constraint handles uniqueness
        try {
          const [newSport] = await db
            .insert(siteSports)
            .values({
              code,
              name,
              description,
              icon,
              color,
              displayOrder,
              isActive: isActive ?? true,
              isSystemDefault: false,
              createdBy: req.user?.id,
            })
            .returning();

          res.status(201).json(newSport);
        } catch (insertError: any) {
          // Handle unique constraint violation
          if (getPgErrorCode(insertError) === PG_ERROR_CODES.UNIQUE_VIOLATION) {
            return res.status(409).json({
              message: `Sport with code '${code}' already exists`,
            });
          }
          throw insertError;
        }
      } catch (error: any) {
        console.error("❌ Failed to create sport:", error);
        res.status(500).json({
          message: "Failed to create sport",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * PATCH /api/sports/:code
   * Update a sport
   * Access: Site Admin only
   */
  app.patch(
    "/api/sports/:code",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;

        const validation = updateSiteSportSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid sport data",
            errors: validation.error.flatten().fieldErrors,
          });
        }

        // Verify sport exists
        const [existingSport] = await db
          .select()
          .from(siteSports)
          .where(eq(siteSports.code, code));

        if (!existingSport) {
          return res.status(404).json({ message: "Sport not found" });
        }

        // Update the sport (code is immutable, so we don't update it)
        const [updatedSport] = await db
          .update(siteSports)
          .set({
            ...validation.data,
            updatedAt: new Date(),
          })
          .where(eq(siteSports.code, code))
          .returning();

        res.json(updatedSport);
      } catch (error: any) {
        console.error("❌ Failed to update sport:", error);
        res.status(500).json({
          message: "Failed to update sport",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * DELETE /api/sports/:code
   * Delete a sport
   * Access: Site Admin only
   */
  app.delete(
    "/api/sports/:code",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;

        // Verify sport exists
        const [existingSport] = await db
          .select()
          .from(siteSports)
          .where(eq(siteSports.code, code));

        if (!existingSport) {
          return res.status(404).json({ message: "Sport not found" });
        }

        // Check if it's a system default
        if (existingSport.isSystemDefault) {
          return res.status(403).json({
            message: "Cannot delete system default sports. Use 'Disable' instead to hide it from new entries.",
          });
        }

        // Delete the sport (positions will cascade delete)
        await db.delete(siteSports).where(eq(siteSports.code, code));

        res.json({ success: true });
      } catch (error: any) {
        console.error("❌ Failed to delete sport:", error);
        res.status(500).json({
          message: "Failed to delete sport",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  // ============================================================================
  // POSITIONS ROUTES
  // ============================================================================

  /**
   * GET /api/sports/:sportCode/positions
   * Get all positions for a sport
   * Access: Authenticated users
   */
  app.get(
    "/api/sports/:sportCode/positions",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { sportCode } = req.params;

        // Verify sport exists
        const [sport] = await db
          .select()
          .from(siteSports)
          .where(eq(siteSports.code, sportCode));

        if (!sport) {
          return res.status(404).json({ message: "Sport not found" });
        }

        const positions = await db
          .select()
          .from(sitePositions)
          .where(
            and(
              eq(sitePositions.sportId, sport.id),
              eq(sitePositions.isActive, true)
            )
          )
          .orderBy(asc(sitePositions.displayOrder), asc(sitePositions.name));

        res.json(positions);
      } catch (error: any) {
        console.error("❌ Failed to fetch positions:", error);
        res.status(500).json({
          message: "Failed to fetch positions",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/sports/:sportCode/positions
   * Create a new position for a sport
   * Access: Site Admin only
   */
  app.post(
    "/api/sports/:sportCode/positions",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { sportCode } = req.params;

        // Verify sport exists
        const [sport] = await db
          .select()
          .from(siteSports)
          .where(eq(siteSports.code, sportCode));

        if (!sport) {
          return res.status(404).json({ message: "Sport not found" });
        }

        // Validate input (override sportId from URL)
        const validation = insertSitePositionSchema.safeParse({
          ...req.body,
          sportId: sport.id,
        });

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid position data",
            errors: validation.error.flatten().fieldErrors,
          });
        }

        const { code, name, shortName, description, displayOrder, color, isActive } = validation.data;

        // Create the position - database constraint handles uniqueness
        try {
          const [newPosition] = await db
            .insert(sitePositions)
            .values({
              sportId: sport.id,
              code,
              name,
              shortName,
              description,
              displayOrder,
              color,
              isActive: isActive ?? true,
              isSystemDefault: false,
              createdBy: req.user?.id,
            })
            .returning();

          res.status(201).json(newPosition);
        } catch (insertError: any) {
          // Handle unique constraint violation
          if (getPgErrorCode(insertError) === PG_ERROR_CODES.UNIQUE_VIOLATION) {
            return res.status(409).json({
              message: `Position with code '${code}' already exists for this sport`,
            });
          }
          throw insertError;
        }
      } catch (error: any) {
        console.error("❌ Failed to create position:", error);
        res.status(500).json({
          message: "Failed to create position",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * PATCH /api/positions/:id
   * Update a position
   * Access: Site Admin only
   */
  app.patch(
    "/api/positions/:id",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const validation = updateSitePositionSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid position data",
            errors: validation.error.flatten().fieldErrors,
          });
        }

        // Verify position exists
        const [existingPosition] = await db
          .select()
          .from(sitePositions)
          .where(eq(sitePositions.id, id));

        if (!existingPosition) {
          return res.status(404).json({ message: "Position not found" });
        }

        // Update the position
        const [updatedPosition] = await db
          .update(sitePositions)
          .set({
            ...validation.data,
            updatedAt: new Date(),
          })
          .where(eq(sitePositions.id, id))
          .returning();

        res.json(updatedPosition);
      } catch (error: any) {
        console.error("❌ Failed to update position:", error);
        res.status(500).json({
          message: "Failed to update position",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * DELETE /api/positions/:id
   * Delete a position
   * Access: Site Admin only
   */
  app.delete(
    "/api/positions/:id",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        // Verify position exists
        const [existingPosition] = await db
          .select()
          .from(sitePositions)
          .where(eq(sitePositions.id, id));

        if (!existingPosition) {
          return res.status(404).json({ message: "Position not found" });
        }

        // Check if it's a system default
        if (existingPosition.isSystemDefault) {
          return res.status(403).json({
            message: "Cannot delete system default positions. Use 'Disable' instead to hide it from new entries.",
          });
        }

        // Delete the position
        await db.delete(sitePositions).where(eq(sitePositions.id, id));

        res.json({ success: true });
      } catch (error: any) {
        console.error("❌ Failed to delete position:", error);
        res.status(500).json({
          message: "Failed to delete position",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * GET /api/positions/:id/usage
   * Get usage statistics for a position
   * Access: Site Admin only
   */
  app.get(
    "/api/positions/:id/usage",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        // SECURITY: Validate UUID format for position ID
        if (!id || !UUID_REGEX.test(id)) {
          return res.status(400).json({ message: "Invalid position ID format" });
        }

        // Verify position exists
        const [position] = await db
          .select()
          .from(sitePositions)
          .where(eq(sitePositions.id, id));

        if (!position) {
          return res.status(404).json({ message: "Position not found" });
        }

        // Count athletes using this position
        // Use parameterized query for safety even though position.code comes from DB
        const athleteResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(sql`${sql.param(position.code)} = ANY(${users.positions})`);
        const athleteCount = Number(athleteResult[0]?.count || 0);

        res.json({ athleteCount });
      } catch (error: any) {
        console.error("❌ Failed to fetch position usage:", error);
        res.status(500).json({
          message: "Failed to fetch position usage",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      }
    }
  );
}
