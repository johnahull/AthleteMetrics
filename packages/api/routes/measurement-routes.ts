/**
 * Measurement management routes
 * Uses MeasurementService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { MeasurementService } from "../services/measurement-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertMeasurementSchema, teams, userTeams } from "@shared/schema";
import { dateStringSchema } from "@shared/date-utils";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { hasOrganizationAccess } from "../helpers/org-access";
import { z } from "zod";
import { ZodError } from "zod";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { PAGINATION } from "../constants/pagination";
import { storage } from "../storage";

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

// Batch operation rate limiting (stricter due to high measurement count per request)
const measurementBatchLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.BATCH,
  message: { message: "Too many batch operations, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Query parameter validation schema
const measurementQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  athleteId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  metric: z.enum(['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI', 'TOP_SPEED']).optional(),
  teamIds: z.string().optional().refine(
    (val) => !val || val.split(',').every(id => {
      const trimmedId = id.trim();
      // UUID format validation (8-4-4-4-12 hex pattern)
      // Accepts all RFC 4122 UUIDs including nil UUID (00000000-0000-0000-0000-000000000000)
      // Security: Database foreign key validation is the primary security boundary
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidPattern.test(trimmedId);
    }),
    { message: "teamIds must be comma-separated valid UUIDs" }
  ), // Comma-separated UUIDs
  sport: z.string().min(1).max(100).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  // Accept both date (YYYY-MM-DD) and datetime (ISO 8601) formats for flexibility
  // Using shared date validation schema
  dateFrom: dateStringSchema.optional(),
  dateTo: dateStringSchema.optional(),
  includeUnverified: z.enum(['true', 'false']).optional(),
  includeUnknownBirthYear: z
    .string()
    .transform(val => val === 'true')
    .pipe(z.boolean())
    .optional(),
  birthYearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
  birthYearTo: z.coerce.number().int().min(1900).max(2100).optional(),
  ageFrom: z.coerce.number().int().min(0).max(120).optional(),
  ageTo: z.coerce.number().int().min(0).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).max(PAGINATION.MAX_OFFSET).optional(),
}).refine(
  (data) => {
    if (data.birthYearFrom !== undefined && data.birthYearTo !== undefined) {
      return data.birthYearFrom <= data.birthYearTo;
    }
    return true;
  },
  {
    message: "birthYearFrom must be less than or equal to birthYearTo",
    path: ["birthYearFrom"],
  }
);

interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  metric?: string;
  teamIds?: string[];
  sport?: string;
  gender?: string;
  dateFrom?: string;
  dateTo?: string;
  includeUnverified?: boolean;
  includeUnknownBirthYear?: boolean;
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

      // Build filters from validated query parameters with proper type safety
      const filters: MeasurementFilters = {
        ...(validatedParams.userId && { userId: validatedParams.userId }),
        ...(validatedParams.athleteId && { athleteId: validatedParams.athleteId }),
        ...(validatedParams.metric && { metric: validatedParams.metric }),
        ...(validatedParams.teamIds && { teamIds: validatedParams.teamIds.split(',').map(id => id.trim()) }),
        ...(validatedParams.sport && { sport: validatedParams.sport }),
        ...(validatedParams.gender && { gender: validatedParams.gender }),
        ...(validatedParams.dateFrom && { dateFrom: validatedParams.dateFrom }),
        ...(validatedParams.dateTo && { dateTo: validatedParams.dateTo }),
        includeUnverified: validatedParams.includeUnverified === 'true',
        ...(validatedParams.includeUnknownBirthYear !== undefined && { includeUnknownBirthYear: validatedParams.includeUnknownBirthYear }),
        ...(validatedParams.birthYearFrom !== undefined && { birthYearFrom: validatedParams.birthYearFrom }),
        ...(validatedParams.birthYearTo !== undefined && { birthYearTo: validatedParams.birthYearTo }),
        ...(validatedParams.ageFrom !== undefined && { ageFrom: validatedParams.ageFrom }),
        ...(validatedParams.ageTo !== undefined && { ageTo: validatedParams.ageTo }),
        ...(validatedParams.limit !== undefined && { limit: validatedParams.limit }),
        ...(validatedParams.offset !== undefined && { offset: validatedParams.offset }),
      };

      // Organization-based filtering
      // SECURITY: Validate user has access to requested organization
      if (validatedParams.organizationId) {
        if (!isSiteAdmin(user)) {
          const userOrgs = await storage.getUserOrganizations(user.id);
          const hasAccess = userOrgs.some(org => org.organizationId === validatedParams.organizationId);
          if (!hasAccess) {
            return res.status(403).json({
              message: "Access denied - you don't have permission to access this organization"
            });
          }
        }
        filters.organizationId = validatedParams.organizationId;
      } else if (!isSiteAdmin(user)) {
        // SECURITY: For non-admin users, ALWAYS require org context from actual membership
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.json([]); // Users without an organization have no measurements to view
        }
        // Use their primary org from actual membership, not session
        filters.organizationId = userOrgs[0].organizationId;
      }

      // Site admins can query across organizations, non-admins cannot
      const allowCrossOrganization = isSiteAdmin(user);
      const result = await measurementService.getMeasurements(filters, allowCrossOrganization);
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

      // SECURITY: Validate user has access to measurement's organization via database membership
      if (measurement.organizationId) {
        const hasAccess = await hasOrganizationAccess(user, measurement.organizationId);
        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied - measurement belongs to different organization" });
        }
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

      // SECURITY: Validate teamId exists (applies to all users)
      if (validatedData.teamId) {
        const [team] = await db
          .select({ organizationId: teams.organizationId })
          .from(teams)
          .where(eq(teams.id, validatedData.teamId));

        if (!team) {
          return res.status(404).json({ message: "Team not found" });
        }

        // SECURITY: Validate user has access to team's organization via database membership
        const hasTeamAccess = await hasOrganizationAccess(user, team.organizationId);
        if (!hasTeamAccess) {
          return res.status(403).json({
            message: "Cannot assign measurements to teams in different organizations"
          });
        }
      }

      // SECURITY: Verify coaches/org admins can only create measurements for users in their organization
      if (!isSiteAdmin(user) && (user.role === 'coach' || user.role === 'org_admin')) {
        const targetUserTeams = await db
          .select({ organizationId: teams.organizationId })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .where(and(
            eq(userTeams.userId, validatedData.userId),
            eq(userTeams.isActive, true),      // SECURITY: Only current team memberships
            eq(teams.isArchived, false)        // SECURITY: Only active teams
          ));

        if (targetUserTeams.length === 0) {
          return res.status(404).json({ message: "User not found or not on any team" });
        }

        // SECURITY: Validate user has access to at least one of the target user's organizations
        const userOrgs = await storage.getUserOrganizations(user.id);
        const userOrgIds = new Set(userOrgs.map(o => o.organizationId));
        const hasOrgAccess = targetUserTeams.some(t => userOrgIds.has(t.organizationId));
        if (!hasOrgAccess) {
          return res.status(403).json({
            message: "Cannot create measurements for users in different organizations"
          });
        }
      }

      const measurement = await measurementService.createMeasurement(validatedData, user.id, user.role);
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
   * Batch create measurements (org admins and coaches)
   * Creates multiple measurements in a single transaction
   */
  app.post("/api/measurements/batch", measurementBatchLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot use batch endpoint
      if (user.role === 'athlete') {
        return res.status(403).json({ message: "Athletes cannot use batch measurement entry" });
      }

      // Validate batch request structure
      // Backend limit: 100 measurements per API request (DoS protection)
      // Frontend wizard limit: 500 total grid rows (UX/browser performance limit)
      // These limits serve different purposes and are enforced at different layers
      const batchSchema = z.object({
        measurements: z.array(insertMeasurementSchema).min(1).max(100)
      });

      const validatedBatch = batchSchema.parse(req.body);
      const measurements = validatedBatch.measurements;

      // Call batch service method with site admin check
      const result = await measurementService.createMeasurementsBatch(
        measurements,
        user,
        isSiteAdmin(user)
      );

      // Return appropriate HTTP status code
      // 201: All measurements created successfully
      // 207: Partial success (some measurements failed)
      // 400: All measurements failed (validation errors)
      const statusCode =
        result.failed === 0 ? 201 :
        result.created === 0 ? 400 :
        207; // RFC 4918 Multi-Status for partial success

      res.status(statusCode).json({
        created: result.created,
        failed: result.failed,
        errors: result.errors,
        message: result.failed === 0
          ? `All ${result.created} measurements created successfully`
          : result.created === 0
          ? `All measurements failed validation`
          : `${result.created} measurements created successfully, ${result.failed} failed`
      });
    } catch (error) {
      console.error("Batch create measurements error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid batch data", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to create measurements batch";
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

      // SECURITY: Consolidated athlete authorization checks to prevent IDOR
      // All athlete-specific checks are performed together to prevent bypass
      if (user.role === 'athlete') {
        // Athletes cannot modify verified measurements (only coaches/admins can)
        if (existingMeasurement.isVerified) {
          return res.status(403).json({
            message: "Cannot modify verified measurements. Contact your coach to make changes."
          });
        }

        // Athletes can only update their own measurements
        // Prevents IDOR vulnerability where Athlete A updates Athlete B's measurement
        if (existingMeasurement.userId !== user.id) {
          return res.status(403).json({
            message: "Access denied - athletes can only update their own measurements"
          });
        }

        // Athletes cannot modify measurements submitted by coaches
        // Prevents athletes from changing coach-submitted data (e.g., official testing results)
        if (existingMeasurement.submittedBy !== user.id) {
          return res.status(403).json({
            message: "Athletes cannot modify coach-submitted measurements"
          });
        }
      }

      // SECURITY: Validate user has access to measurement's organization via database membership
      const isSubmitter = existingMeasurement.submittedBy === user.id;
      let isOrgAdminOrCoach = false;
      let userOrgIds: Set<string> = new Set();

      if (!isSiteAdmin(user) && (user.role === 'org_admin' || user.role === 'coach')) {
        const userOrgs = await storage.getUserOrganizations(user.id);
        userOrgIds = new Set(userOrgs.map(o => o.organizationId));
        isOrgAdminOrCoach = existingMeasurement.organizationId
          ? userOrgIds.has(existingMeasurement.organizationId)
          : false;
      }

      if (!isSiteAdmin(user) && !isSubmitter && !isOrgAdminOrCoach) {
        return res.status(403).json({ message: "Access denied - you can only update measurements you submitted or measurements in your organization" });
      }

      // Validate request body using partial schema (for updates)
      const updateSchema = insertMeasurementSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      // Pass organizationId for defense-in-depth validation (non-site-admins only)
      // Use first org from actual membership, not session
      let expectedOrganizationId: string | undefined = undefined;
      if (!isSiteAdmin(user)) {
        if (userOrgIds.size === 0) {
          const userOrgs = await storage.getUserOrganizations(user.id);
          expectedOrganizationId = userOrgs[0]?.organizationId;
        } else {
          expectedOrganizationId = Array.from(userOrgIds)[0];
        }
      }
      const updatedMeasurement = await measurementService.updateMeasurement(
        measurementId,
        validatedData,
        expectedOrganizationId
      );
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

      // SECURITY: Athletes cannot delete verified measurements (only coaches/admins can)
      if (user.role === 'athlete' && existingMeasurement.isVerified) {
        return res.status(403).json({
          message: "Cannot delete verified measurements. Contact your coach to make changes."
        });
      }

      // SECURITY: Validate user has access to measurement's organization via database membership
      const isSubmitter = existingMeasurement.submittedBy === user.id;
      let isOrgAdminOrCoach = false;
      let userOrgIds: Set<string> = new Set();

      if (!isSiteAdmin(user) && (user.role === 'org_admin' || user.role === 'coach')) {
        const userOrgs = await storage.getUserOrganizations(user.id);
        userOrgIds = new Set(userOrgs.map(o => o.organizationId));
        isOrgAdminOrCoach = existingMeasurement.organizationId
          ? userOrgIds.has(existingMeasurement.organizationId)
          : false;
      }

      if (!isSiteAdmin(user) && !isSubmitter && !isOrgAdminOrCoach) {
        return res.status(403).json({ message: "Access denied - you can only delete measurements you submitted or measurements in your organization" });
      }

      // Pass organizationId for defense-in-depth validation (non-site-admins only)
      // Use first org from actual membership, not session
      let expectedOrganizationId: string | undefined = undefined;
      if (!isSiteAdmin(user)) {
        if (userOrgIds.size === 0) {
          const userOrgs = await storage.getUserOrganizations(user.id);
          expectedOrganizationId = userOrgs[0]?.organizationId;
        } else {
          expectedOrganizationId = Array.from(userOrgIds)[0];
        }
      }
      await measurementService.deleteMeasurement(measurementId, expectedOrganizationId);
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

      // SECURITY: Validate user has access to measurement's organization via database membership
      let expectedOrganizationId: string | undefined = undefined;
      if (!isSiteAdmin(user)) {
        if (existingMeasurement.organizationId) {
          const hasAccess = await hasOrganizationAccess(user, existingMeasurement.organizationId);
          if (!hasAccess) {
            return res.status(403).json({ message: "Access denied - measurement belongs to different organization" });
          }
        }
        const userOrgs = await storage.getUserOrganizations(user.id);
        expectedOrganizationId = userOrgs[0]?.organizationId;
      }

      // SECURITY FIX: Pass expectedOrganizationId for defense-in-depth IDOR protection
      const verifiedMeasurement = await measurementService.verifyMeasurement(
        measurementId,
        user.id,
        expectedOrganizationId
      );
      res.json(verifiedMeasurement);
    } catch (error) {
      console.error("Verify measurement error:", error);
      const message = error instanceof Error ? error.message : "Failed to verify measurement";
      const statusCode = error instanceof Error && error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Bulk verify measurements (site admins only)
   */
  app.post("/api/measurements/bulk-verify", measurementBatchLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body
      const bodySchema = z.object({
        measurementIds: z.array(z.string().uuid()).min(1).max(100)
      });

      const validatedBody = bodySchema.parse(req.body);
      const { measurementIds } = validatedBody;

      // Call bulk verify service method
      // Site admins can verify across organizations, so pass undefined for expectedOrganizationId
      const result = await measurementService.bulkVerify(
        measurementIds,
        user.id,
        undefined // Site admins bypass org restriction
      );

      // Create audit log for bulk verify operation
      if (result.success > 0 || result.failed > 0) {
        await storage.createAuditLog({
          userId: user.id,
          action: 'measurements_bulk_verify',
          resourceType: 'measurement',
          resourceId: `bulk:${result.success}/${measurementIds.length}`,
          details: JSON.stringify({
            totalRequested: measurementIds.length,
            succeeded: result.success,
            failed: result.failed,
            errors: result.errors.length > 0 ? result.errors : undefined,
            timestamp: new Date().toISOString()
          }),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        });
      }

      // Return appropriate status code
      const statusCode = result.failed === 0 ? 200 : 207; // 207 Multi-Status for partial success

      res.status(statusCode).json({
        verified: result.success,
        failed: result.failed,
        errors: result.errors,
        message: result.failed === 0
          ? `All ${result.success} measurement(s) verified successfully`
          : result.success === 0
          ? `All measurements failed verification`
          : `${result.success} measurement(s) verified, ${result.failed} failed`
      });
    } catch (error) {
      console.error("Bulk verify measurements error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to bulk verify measurements";
      res.status(400).json({ message });
    }
  });

  /**
   * Bulk unverify measurements (site admins only)
   */
  app.post("/api/measurements/bulk-unverify", measurementBatchLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body
      const bodySchema = z.object({
        measurementIds: z.array(z.string().uuid()).min(1).max(100)
      });

      const validatedBody = bodySchema.parse(req.body);
      const { measurementIds } = validatedBody;

      // Call bulk unverify service method
      // Site admins can unverify across organizations, so pass undefined for expectedOrganizationId
      const result = await measurementService.bulkUnverify(
        measurementIds,
        undefined // Site admins bypass org restriction
      );

      // Create audit log for bulk unverify operation
      if (result.success > 0 || result.failed > 0) {
        await storage.createAuditLog({
          userId: user.id,
          action: 'measurements_bulk_unverify',
          resourceType: 'measurement',
          resourceId: `bulk:${result.success}/${measurementIds.length}`,
          details: JSON.stringify({
            totalRequested: measurementIds.length,
            succeeded: result.success,
            failed: result.failed,
            errors: result.errors.length > 0 ? result.errors : undefined,
            timestamp: new Date().toISOString()
          }),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        });
      }

      // Return appropriate status code
      const statusCode = result.failed === 0 ? 200 : 207; // 207 Multi-Status for partial success

      res.status(statusCode).json({
        unverified: result.success,
        failed: result.failed,
        errors: result.errors,
        message: result.failed === 0
          ? `All ${result.success} measurement(s) unverified successfully`
          : result.success === 0
          ? `All measurements failed unverification`
          : `${result.success} measurement(s) unverified, ${result.failed} failed`
      });
    } catch (error) {
      console.error("Bulk unverify measurements error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to bulk unverify measurements";
      res.status(400).json({ message });
    }
  });
}
