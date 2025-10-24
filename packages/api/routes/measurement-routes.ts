/**
 * Measurement management routes
 * Uses MeasurementService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { MeasurementService } from "../services/measurement-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertMeasurementSchema, teams, userTeams } from "@shared/schema";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { z } from "zod";
import { ZodError } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Rate limiting for measurement endpoints
const measurementLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.HIGH_VOLUME,
  message: { message: "Too many measurement requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for delete operations
const measurementDeleteLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.DELETE,
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Query parameter validation schema
const measurementQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  athleteId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  metric: z.enum(['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  includeUnverified: z.enum(['true', 'false']).optional(),
  birthYearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
  birthYearTo: z.coerce.number().int().min(1900).max(2100).optional(),
  ageFrom: z.coerce.number().int().min(0).max(120).optional(),
  ageTo: z.coerce.number().int().min(0).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(20000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  metric?: string;
  dateFrom?: string;
  dateTo?: string;
  includeUnverified?: boolean;
  birthYearFrom?: number;
  birthYearTo?: number;
  ageFrom?: number;
  ageTo?: number;
  organizationId?: string;
  limit?: number;
  offset?: number;
}

export function registerMeasurementRoutes(app: Express) {
  const measurementService = new MeasurementService();

  /**
   * Get measurements with optional filters
   */
  app.get("/api/measurements", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate query parameters
      const validatedParams = measurementQuerySchema.parse(req.query);

      // Build filters from validated query parameters
      const filters: MeasurementFilters = {
        userId: validatedParams.userId,
        athleteId: validatedParams.athleteId,
        metric: validatedParams.metric,
        dateFrom: validatedParams.dateFrom,
        dateTo: validatedParams.dateTo,
        includeUnverified: validatedParams.includeUnverified === 'true',
        birthYearFrom: validatedParams.birthYearFrom,
        birthYearTo: validatedParams.birthYearTo,
        ageFrom: validatedParams.ageFrom,
        ageTo: validatedParams.ageTo,
        limit: validatedParams.limit,
        offset: validatedParams.offset,
      };

      // Organization-based filtering
      if (validatedParams.organizationId) {
        // If organizationId is provided, use it (with permission check below)
        filters.organizationId = validatedParams.organizationId;

        // Security: Non-admin users can only query their own organization
        if (!isSiteAdmin(user) && filters.organizationId !== user.primaryOrganizationId) {
          return res.status(403).json({
            message: "Access denied - cannot query measurements from different organization"
          });
        }
      } else if (!isSiteAdmin(user) && user.primaryOrganizationId) {
        // Non-admin users without explicit organizationId should see their organization
        filters.organizationId = user.primaryOrganizationId;
      }

      const result = await measurementService.getMeasurements(filters);
      // Return just the measurements array for backwards compatibility
      res.json(result.measurements);
    } catch (error) {
      console.error("Get measurements error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid query parameters",
          errors: error.errors
        });
      }
      const message = error instanceof Error ? error.message : "Failed to fetch measurements";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get measurement by ID
   */
  app.get("/api/measurements/:id", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const measurementId = req.params.id;
      const measurement = await measurementService.getMeasurement(measurementId);

      if (!measurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Permission check: non-admin users can only view measurements in their organization
      if (!isSiteAdmin(user) && measurement.organizationId && user.primaryOrganizationId !== measurement.organizationId) {
        return res.status(403).json({ message: "Access denied - measurement belongs to different organization" });
      }

      res.json(measurement);
    } catch (error) {
      console.error("Get measurement error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch measurement";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Create measurement (org admins, coaches, and athletes for their own data)
   */
  app.post("/api/measurements", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body using Zod schema
      const validatedData = insertMeasurementSchema.parse(req.body);

      // Permission check: athletes can only create measurements for themselves
      // Use user.id as the athlete's userId (not user.athleteId which could be undefined)
      if (user.role === 'athlete' && validatedData.userId !== user.id) {
        return res.status(403).json({ message: "Athletes can only create measurements for themselves" });
      }

      // SECURITY: Verify coaches/org admins can only create measurements for users in their organization
      if (!isSiteAdmin(user) && (user.role === 'coach' || user.role === 'org_admin')) {
        const targetUserTeams = await db
          .select({ organizationId: teams.organizationId })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .where(eq(userTeams.userId, validatedData.userId));

        if (targetUserTeams.length === 0) {
          return res.status(404).json({ message: "User not found or not on any team" });
        }

        const hasOrgAccess = targetUserTeams.some(t => t.organizationId === user.primaryOrganizationId);
        if (!hasOrgAccess) {
          return res.status(403).json({
            message: "Cannot create measurements for users in different organizations"
          });
        }

        // SECURITY: If teamId provided, verify it belongs to the user's organization
        if (validatedData.teamId) {
          const [team] = await db
            .select({ organizationId: teams.organizationId })
            .from(teams)
            .where(eq(teams.id, validatedData.teamId));

          if (!team) {
            return res.status(404).json({ message: "Team not found" });
          }

          if (team.organizationId !== user.primaryOrganizationId) {
            return res.status(403).json({
              message: "Cannot assign measurements to teams in different organizations"
            });
          }
        }
      }

      const measurement = await measurementService.createMeasurement(validatedData, user.id);
      res.status(201).json(measurement);
    } catch (error) {
      console.error("Create measurement error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to create measurement";
      res.status(400).json({ message });
    }
  });

  /**
   * Update measurement (submitter, org admins, and coaches)
   */
  app.put("/api/measurements/:id", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const measurementId = req.params.id;

      // Get existing measurement for permission check
      const existingMeasurement = await measurementService.getMeasurement(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Permission check: submitter, org admins/coaches in same org, or site admins can update
      const isSubmitter = existingMeasurement.submittedBy === user.id;
      const isOrgAdminOrCoach = !isSiteAdmin(user) &&
        (user.role === 'org_admin' || user.role === 'coach') &&
        existingMeasurement.organizationId === user.primaryOrganizationId;

      // SECURITY: Athletes can only update their own measurements
      // Prevents IDOR vulnerability where Athlete A updates Athlete B's measurement
      if (user.role === 'athlete' && existingMeasurement.userId !== user.id) {
        return res.status(403).json({ message: "Access denied - athletes can only update their own measurements" });
      }

      if (!isSiteAdmin(user) && !isSubmitter && !isOrgAdminOrCoach) {
        return res.status(403).json({ message: "Access denied - you can only update measurements you submitted or measurements in your organization" });
      }

      // Validate request body using partial schema (for updates)
      const updateSchema = insertMeasurementSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      const updatedMeasurement = await measurementService.updateMeasurement(measurementId, validatedData);
      res.json(updatedMeasurement);
    } catch (error) {
      console.error("Update measurement error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to update measurement";
      res.status(400).json({ message });
    }
  });

  /**
   * Delete measurement (submitter, org admins, and coaches)
   */
  app.delete("/api/measurements/:id", measurementDeleteLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const measurementId = req.params.id;

      // Get existing measurement for permission check
      const existingMeasurement = await measurementService.getMeasurement(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Permission check: submitter, org admins/coaches in same org, or site admins can delete
      const isSubmitter = existingMeasurement.submittedBy === user.id;
      const isOrgAdminOrCoach = !isSiteAdmin(user) &&
        (user.role === 'org_admin' || user.role === 'coach') &&
        existingMeasurement.organizationId === user.primaryOrganizationId;

      if (!isSiteAdmin(user) && !isSubmitter && !isOrgAdminOrCoach) {
        return res.status(403).json({ message: "Access denied - you can only delete measurements you submitted or measurements in your organization" });
      }

      await measurementService.deleteMeasurement(measurementId);
      res.json({ message: "Measurement deleted successfully" });
    } catch (error) {
      console.error("Delete measurement error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete measurement";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Verify measurement (org admins and coaches only)
   */
  app.post("/api/measurements/:id/verify", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Permission check: only org admins, coaches, and site admins can verify
      if (user.role === 'athlete') {
        return res.status(403).json({ message: "Athletes cannot verify measurements" });
      }

      const measurementId = req.params.id;

      // Get existing measurement
      const existingMeasurement = await measurementService.getMeasurement(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Permission check: org admins/coaches can only verify measurements in their organization
      if (!isSiteAdmin(user) && existingMeasurement.organizationId !== user.primaryOrganizationId) {
        return res.status(403).json({ message: "Access denied - measurement belongs to different organization" });
      }

      const verifiedMeasurement = await measurementService.verifyMeasurement(measurementId, user.id);
      res.json(verifiedMeasurement);
    } catch (error) {
      console.error("Verify measurement error:", error);
      const message = error instanceof Error ? error.message : "Failed to verify measurement";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });
}
