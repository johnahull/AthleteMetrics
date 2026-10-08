/**
 * Measurement management routes
 * Uses MeasurementService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit, { type Options } from "express-rate-limit";
import { MeasurementService, MediaUrlPermissionError, MovementQualityPermissionError, MeasurementAccessDeniedError } from "../services/measurement-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { insertMeasurementSchema, teams, userTeams, siteMetrics } from "@shared/schema";
import {
  computePairedInputMeasurement,
  PairedInputValidationError,
  type AuxiliaryInputConfig,
} from "../services/paired-input-compute";
import { dateStringSchema } from "@shared/date-utils";
import { MeasurementValueValidationError } from "@shared/measurement-value-validation";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import {
  getOrgRole,
  isMeasurementWriterRole,
  canVerifyMeasurement,
  canUseBatchEndpoint,
  canQueryCrossOrganization,
} from "../permissions/index";
import { hasOrganizationAccess, validateOrganizationAccess } from "../helpers/org-access";
import { getAuthorizationError, AUTH_ERRORS } from "../helpers/auth-errors";
import { z } from "zod";
import { ZodError } from "zod";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { PAGINATION } from "../constants/pagination";
import { storage } from "../storage";
import { clipViewer, omitClipsHiddenFromViewer } from "../utils/measurement-redaction";

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

// Per-organization rate limiting for cross-org queries
// Prevents rapid data extraction across multiple organization combinations
const orgSpecificLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.CROSS_ORG_QUERY,
  keyGenerator: (req) => {
    const orgIds = (req.query.orgIds as string) || '';
    // Use req.ip (Express handles X-Forwarded-For when 'trust proxy' is configured)
    // Fallback to socket address if req.ip is unavailable
    const clientIp = req.ip || req.socket?.remoteAddress || '';
    return `${clientIp}:${orgIds}`; // Rate limit by IP + orgIds combination
  },
  message: { message: "Too many queries for this organization combination. Please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting if no orgIds specified (falls back to general rate limiter)
    return !req.query.orgIds;
  },
  // Disable IPv6 keyGenerator validation - we're intentionally using IP+orgIds composite key
  // The IP is used for rate limiting, not security-critical operations
  validate: { keyGeneratorIpFallback: false },
});

// Shared UUID validation pattern (RFC 4122 format: 8-4-4-4-12 hex pattern)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maximum number of organizations that can be queried in a single request
const MAX_ORG_IDS = 100;

// Query parameter validation schema
const measurementQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  athleteId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  // Accept any metric code - supports derived metrics and custom metrics
  metric: z.string().regex(/^[A-Z0-9_]+$/, "Invalid metric code format").optional(),
  teamIds: z.string().optional().refine(
    (val) => !val || val.split(',').every(id => UUID_PATTERN.test(id.trim())),
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
  // Cross-org measurement query parameters
  filterMode: z.enum(['all', 'personal', 'org']).optional(),
  orgIds: z.string().optional()
    .refine(
      (val) => !val || val.split(',').length <= MAX_ORG_IDS,
      { message: `orgIds cannot exceed ${MAX_ORG_IDS} organizations` }
    )
    .refine(
      (val) => !val || val.split(',').every(id => UUID_PATTERN.test(id.trim())),
      { message: "orgIds must be comma-separated valid UUIDs" }
    ),
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
  filterMode?: 'all' | 'personal' | 'org';
  orgIds?: string;
  personalOwnerId?: string;
}

export function registerMeasurementRoutes(app: Express) {
  const measurementService = new MeasurementService();

  /**
   * Get measurements with optional filters
   *
   * @param {string} [filterMode=org] - Filter mode: 'all' (cross-org), 'personal' (no org), 'org' (single org)
   * @param {string} [orgIds] - Comma-separated org UUIDs for filterMode='all' (max 100 orgs)
   *   Example: "uuid1,uuid2,uuid3" queries measurements from 3 organizations plus personal measurements
   * @param {string} [organizationId] - Single organization ID for filterMode='org'
   * @param {string} [athleteId] - Filter by athlete/user ID
   * @param {string} [metric] - Filter by metric code (e.g., 'FLY10_TIME', 'VERTICAL_JUMP')
   * @param {string} [teamIds] - Comma-separated team UUIDs
   * @param {string} [sport] - Filter by sport name
   * @param {string} [gender] - Filter by gender ('Male', 'Female', 'Not Specified')
   * @param {string} [dateFrom] - Filter measurements from this date (ISO 8601 or YYYY-MM-DD)
   * @param {string} [dateTo] - Filter measurements to this date (ISO 8601 or YYYY-MM-DD)
   * @param {boolean} [includeUnverified=false] - Include unverified measurements
   * @param {number} [birthYearFrom] - Filter by birth year range (1900-2100)
   * @param {number} [birthYearTo] - Filter by birth year range (1900-2100)
   * @param {number} [ageFrom] - Filter by age range (0-120)
   * @param {number} [ageTo] - Filter by age range (0-120)
   * @param {number} [limit] - Maximum results to return (default varies by role)
   * @param {number} [offset] - Pagination offset
   *
   * @rateLimit 200 req/15min (general), 10 req/15min per orgIds combination (cross-org)
   * @security Non-admins can only query organizations they belong to
   * @returns {Measurement[]} Array of measurement objects
   */
  // Two-tier rate limiting strategy:
  // 1. measurementLimiter (200 req/15min) - General protection against high-volume queries
  // 2. orgSpecificLimiter (10 req/15min) - Stricter limit per orgIds combination to prevent cross-org data extraction
  // Order matters: General limiter first provides base protection, stricter limiter second provides targeted security
  app.get("/api/measurements", measurementLimiter, orgSpecificLimiter, requireAuth, async (req, res) => {
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
        ...(validatedParams.filterMode && { filterMode: validatedParams.filterMode }),
        ...(validatedParams.orgIds && { orgIds: validatedParams.orgIds }),
      };

      // SECURITY: Validate orgIds if provided (non-site-admins only)
      // Site admins can query any org, non-admins must belong to all specified orgs
      if (filters.orgIds && !canQueryCrossOrganization(user)) {
        const requestedOrgIds = filters.orgIds.split(',').map(id => id.trim()).filter(id => id !== '');

        if (requestedOrgIds.length > 0) {
          // Get user's organizations
          const userOrgs = await storage.getUserOrganizations(user.id);
          const userOrgIds = new Set(userOrgs.map(o => o.organizationId));

          // Check if all requested orgIds belong to the user
          const unauthorizedOrgs = requestedOrgIds.filter(orgId => !userOrgIds.has(orgId));
          if (unauthorizedOrgs.length > 0) {
            return res.status(403).json({
              message: `Access denied - you are not authorized to access organizations: ${unauthorizedOrgs.join(', ')}`
            });
          }
        }
      }

      // Organization-based filtering (existing logic for non-filterMode queries)
      // SECURITY: Validate organization access and get effective org ID
      if (!filters.filterMode || filters.filterMode === 'org') {
        const orgAccessResult = await validateOrganizationAccess(user, validatedParams.organizationId);

        // For measurements endpoint, users with no org membership get empty results
        if (!orgAccessResult.allowed && orgAccessResult.error === "Access denied - no organization membership") {
          return res.json([]); // Users without an organization have no measurements to view
        }

        if (!orgAccessResult.allowed) {
          return res.status(403).json({
            message: getAuthorizationError(orgAccessResult.error!)
          });
        }

        // Set the organization filter to the effective org ID
        if (orgAccessResult.effectiveOrgId) {
          filters.organizationId = orgAccessResult.effectiveOrgId;
        }
      }

      // Site admins can query across organizations, non-admins cannot
      const allowCrossOrganization = canQueryCrossOrganization(user);
      // SECURITY: personal (no-org) rows returned by filterMode queries are the requester's own
      if (filters.filterMode && !allowCrossOrganization) {
        filters.personalOwnerId = user.id;
      }
      const result = await measurementService.getMeasurements(filters, allowCrossOrganization);
      // Clips only for coaches / org admins of the row's org, the owning athlete and site admins
      const viewer = clipViewer(user, allowCrossOrganization ? [] : await storage.getUserOrganizations(user.id));
      // Return just the measurements array for backwards compatibility
      res.json(omitClipsHiddenFromViewer(result.measurements, viewer));
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
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.MEASUREMENT_ACCESS_DENIED) });
        }
      } else if (measurement.userId !== user.id && !canQueryCrossOrganization(user)) {
        // A personal (no-org) measurement belongs to its athlete only
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.MEASUREMENT_ACCESS_DENIED) });
      }

      // Clips only for coaches / org admins of the row's org, the owning athlete and site admins
      const viewer = clipViewer(user, isSiteAdmin(user) ? [] : await storage.getUserOrganizations(user.id));
      res.json(omitClipsHiddenFromViewer([measurement], viewer)[0]);
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

      // SECURITY (issue #515): parent, guest and any other role cannot create measurements. Checked BEFORE the
      // body is validated so such a session gets a 403 whatever it sends. A user with no organization
      // membership has a session role of 'athlete' or 'parent' (there is no first organization to take it from).
      if (!isSiteAdmin(user)) {
        const memberships = (await storage.getUserOrganizations(user.id)) ?? [];
        const mayWrite = memberships.length === 0
          ? user.role === 'athlete'
          : memberships.some(m => ['athlete', 'coach', 'org_admin'].includes(m.role));
        if (!mayWrite) {
          return res.status(403).json({ message: "Your role cannot create measurements" });
        }
      }

      // Validate request body using Zod schema
      const validatedData = insertMeasurementSchema.parse(req.body);

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

      // SECURITY (issues #514, #515): what the caller may do is decided by their role in the organization the
      // measurement will belong to, NOT by session.user.role (their role in their first organization).
      // writerRole is passed to the service for the Movement Quality / clip rules and auto-verification.
      let writerRole: string;
      // The organization the write is authorized against; the service re-checks it inside its transaction.
      // undefined: no restriction (site admin); null: a personal row.
      let expectedOrganizationId: string | null | undefined;

      if (isSiteAdmin(user)) {
        writerRole = 'site_admin';
      } else {
        const isSelf = validatedData.userId === user.id;
        const hasTeam = !!validatedData.teamId && validatedData.teamId.trim() !== '';

        if (isSelf && !hasTeam) {
          // Personal self-entry: no team, no organization, the athlete's own row
          writerRole = 'athlete';
          expectedOrganizationId = null;
        } else {
          if (!isSelf) {
            // The athlete must currently be on an active team (the same check coaches always had)
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

            const target = await measurementService.resolveMeasurementOrganization(validatedData);
            if (!target.organizationId) {
              return res.status(400).json({
                message: target.ambiguous
                  ? "This athlete is on several teams: choose a team (teamId) for this measurement"
                  : "This athlete had no team on that date: choose a team (teamId) for this measurement",
              });
            }
            // SECURITY: the athlete must belong to the organization the row will be attributed to,
            // otherwise a coach could attribute a row to their own team for any user
            if (!targetUserTeams.some(t => t.organizationId === target.organizationId)) {
              return res.status(403).json({
                message: "Cannot create measurements for users in different organizations"
              });
            }
            expectedOrganizationId = target.organizationId;
          } else {
            // Self-entry on a chosen team: the team's organization
            expectedOrganizationId = (await measurementService.resolveMeasurementOrganization(validatedData)).organizationId;
          }

          const orgRole = await getOrgRole(user, expectedOrganizationId);
          if (orgRole === 'athlete' && isSelf) {
            writerRole = 'athlete';
          } else if (orgRole === 'athlete') {
            return res.status(403).json({ message: "Athletes can only create measurements for themselves" });
          } else if (isMeasurementWriterRole(orgRole)) {
            writerRole = orgRole!;
          } else {
            return res.status(403).json({ message: "Your role cannot create measurements in this organization" });
          }
        }
      }

      const measurement = await measurementService.createMeasurement(
        validatedData,
        user.id,
        writerRole,
        undefined,
        { expectedOrganizationId }
      );
      res.status(201).json(measurement);
    } catch (error) {
      console.error("Create measurement error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      if (
        error instanceof MovementQualityPermissionError ||
        error instanceof MediaUrlPermissionError ||
        error instanceof MeasurementAccessDeniedError
      ) {
        return res.status(403).json({ message: error.message });
      }
      if (error instanceof PairedInputValidationError || error instanceof MeasurementValueValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
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

      // Permission check: only coaches and admins can use batch endpoint
      const batchPermission = canUseBatchEndpoint(user);
      if (!batchPermission.allowed) {
        return res.status(403).json({ message: batchPermission.reason });
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

      // Call batch service method with cross-org permission check
      const result = await measurementService.createMeasurementsBatch(
        measurements,
        user,
        canQueryCrossOrganization(user)
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

      // SECURITY (issue #514): the role that counts is the caller's role in the measurement's own organization,
      // not session.user.role (their role in their first organization). The owner of a personal row (no
      // organization) is treated as an athlete.
      const rowRole = await getOrgRole(user, existingMeasurement.organizationId);
      const effectiveRole = rowRole ?? (existingMeasurement.userId === user.id ? 'athlete' : undefined);

      // SECURITY: Consolidated athlete authorization checks to prevent IDOR
      // All athlete-specific checks are performed together to prevent bypass
      if (effectiveRole === 'athlete') {
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

      // SECURITY: coach / org_admin of the measurement's organization (role in THAT organization)
      const isSubmitter = existingMeasurement.submittedBy === user.id;
      const isOrgAdminOrCoach = effectiveRole === 'coach' || effectiveRole === 'org_admin';

      if (!isSiteAdmin(user) && !isSubmitter && !isOrgAdminOrCoach) {
        return res.status(403).json({ message: "Access denied - you can only update measurements you submitted or measurements in your organization" });
      }

      // Validate request body using partial schema (for updates)
      const updateSchema = insertMeasurementSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      // Defense-in-depth: the service re-checks that the row is in the organization we authorized against
      const expectedOrganizationId = isSiteAdmin(user) ? undefined : (existingMeasurement.organizationId ?? undefined);
      const updatedMeasurement = await measurementService.updateMeasurement(
        measurementId,
        validatedData,
        expectedOrganizationId,
        effectiveRole
      );
      res.json(updatedMeasurement);
    } catch (error) {
      console.error("Update measurement error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      if (error instanceof MovementQualityPermissionError || error instanceof MediaUrlPermissionError) {
        return res.status(403).json({ message: error.message });
      }
      if (error instanceof PairedInputValidationError || error instanceof MeasurementValueValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
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

      // SECURITY (issue #514): the role that counts is the caller's role in the measurement's own organization,
      // not session.user.role. The owner of a personal row (no organization) is treated as an athlete.
      const rowRole = await getOrgRole(user, existingMeasurement.organizationId);
      const effectiveRole = rowRole ?? (existingMeasurement.userId === user.id ? 'athlete' : undefined);

      // SECURITY: Athletes cannot delete verified measurements (only coaches/admins can)
      if (effectiveRole === 'athlete' && existingMeasurement.isVerified) {
        return res.status(403).json({
          message: "Cannot delete verified measurements. Contact your coach to make changes."
        });
      }

      // SECURITY: coach / org_admin of the measurement's organization (role in THAT organization)
      const isSubmitter = existingMeasurement.submittedBy === user.id;
      const isOrgAdminOrCoach = effectiveRole === 'coach' || effectiveRole === 'org_admin';

      if (!isSiteAdmin(user) && !isSubmitter && !isOrgAdminOrCoach) {
        return res.status(403).json({ message: "Access denied - you can only delete measurements you submitted or measurements in your organization" });
      }

      // Defense-in-depth: the service re-checks that the row is in the organization we authorized against
      const expectedOrganizationId = isSiteAdmin(user) ? undefined : (existingMeasurement.organizationId ?? undefined);
      const { warnings } = await measurementService.deleteMeasurement(measurementId, expectedOrganizationId);
      res.json({
        message: "Measurement deleted successfully",
        // Additive (#526): present only when a derived total may be stale
        ...(warnings.length > 0 ? { warnings } : {}),
      });
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

      const measurementId = req.params.id;

      // Get existing measurement
      const existingMeasurement = await measurementService.getMeasurement(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      // Permission check: verify access using unified permission helper
      const verifyPermission = await canVerifyMeasurement(user, existingMeasurement);
      if (!verifyPermission.allowed) {
        return res.status(403).json({ message: verifyPermission.reason });
      }

      // Defense-in-depth IDOR protection: the row's own organization (canVerifyMeasurement already
      // required a coach / org_admin role in it)
      const expectedOrganizationId = isSiteAdmin(user) ? undefined : (existingMeasurement.organizationId ?? undefined);

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

  /**
   * Bulk delete measurements (site admins, org admins, coaches)
   *
   * Athletes and guests are blocked at this endpoint — they must use single-row
   * delete which applies stricter ownership/verified checks. Org admins/coaches
   * are scoped to their first organization membership; cross-org IDs land in
   * errors[] (207).
   */
  app.post("/api/measurements/bulk-delete", measurementBatchLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const permission = canUseBatchEndpoint(user);
      if (!permission.allowed) {
        return res.status(403).json({
          message: permission.reason ?? "Insufficient permissions to bulk delete measurements"
        });
      }

      const bodySchema = z.object({
        measurementIds: z.array(z.string().uuid()).min(1).max(100)
      });

      const { measurementIds } = bodySchema.parse(req.body);

      let expectedOrganizationId: string | undefined = undefined;
      if (!isSiteAdmin(user)) {
        const userOrgs = await storage.getUserOrganizations(user.id);
        expectedOrganizationId = userOrgs[0]?.organizationId;
        if (!expectedOrganizationId) {
          return res.status(403).json({
            message: "Bulk delete requires an organization membership. " +
              "Your account is not a member of any organization — ask a site admin to add you to one.",
          });
        }
      }

      const result = await measurementService.bulkDelete(
        measurementIds,
        expectedOrganizationId
      );

      // Rewrite cross-org rejections so multi-org admins/coaches understand
      // why a row they expected to be in scope ended up in errors[]. The
      // service emits a generic message that is shared with single-row delete
      // and bulkVerify; we enrich it here without touching the shared layer.
      if (expectedOrganizationId) {
        for (const err of result.errors) {
          if (err.message === 'Access denied - measurement belongs to different organization') {
            err.message =
              'Measurement belongs to a different organization than your bulk-delete scope. ' +
              'Bulk delete is scoped to your primary organization; switch organizations to delete the others.';
          }
        }
      }

      // Audit-log writes must not propagate to the client: a failure here
      // would otherwise turn a successful delete into a 5xx that prompts
      // clients to retry, which would then 404 on the already-deleted rows.
      try {
        await storage.createAuditLog({
          userId: user.id,
          action: 'measurements_bulk_delete',
          resourceType: 'measurement',
          resourceId: `bulk:${result.deleted}/${measurementIds.length}`,
          details: JSON.stringify({
            totalRequested: measurementIds.length,
            deleted: result.deleted,
            failed: result.failed,
            errors: result.errors.length > 0 ? result.errors : undefined,
            scopedOrganizationId: expectedOrganizationId,
            timestamp: new Date().toISOString()
          }),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        });
      } catch (auditErr) {
        console.error('Audit log failed after bulk delete', {
          userId: user.id,
          deleted: result.deleted,
          failed: result.failed,
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      const statusCode = result.failed === 0 ? 200 : 207;

      res.status(statusCode).json({
        deleted: result.deleted,
        failed: result.failed,
        errors: result.errors,
        message: result.failed === 0
          ? `All ${result.deleted} measurement(s) deleted successfully`
          : result.deleted === 0
          ? `All measurements failed deletion`
          : `${result.deleted} measurement(s) deleted, ${result.failed} failed`,
        // Additive (#526): present only when a derived total may be stale
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      });
    } catch (error) {
      // Log the full error server-side, but never echo it back to the client:
      // raw error.message can leak DB constraint names, table names, and
      // other internal structure.
      console.error("Bulk delete measurements error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      // Non-Zod errors here are server-side (unexpected service throws,
      // unhandled DB errors, etc.); 500 is the correct semantics rather
      // than 400, which would tell the client the request was malformed.
      res.status(500).json({ message: "Failed to bulk delete measurements" });
    }
  });

  /**
   * Get calculation preview for derived metrics
   */
  app.get("/api/measurements/calculate-preview", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate query parameters
      const querySchema = z.object({
        athleteId: z.string().uuid(),
        metricCode: z.string(),
        date: dateStringSchema,
      });

      const { athleteId, metricCode, date } = querySchema.parse(req.query);

      // SECURITY: Validate user has access to athlete's organization
      const targetUserTeams = await db
        .select({ organizationId: teams.organizationId })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(and(
          eq(userTeams.userId, athleteId),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false)
        ));

      if (targetUserTeams.length === 0) {
        return res.status(404).json({ message: "Athlete not found or not on any team" });
      }

      // Validate user has access to at least one of the athlete's organizations
      if (!isSiteAdmin(user)) {
        const userOrgs = await storage.getUserOrganizations(user.id);
        const userOrgIds = new Set(userOrgs.map(o => o.organizationId));
        const hasOrgAccess = targetUserTeams.some(t => userOrgIds.has(t.organizationId));
        if (!hasOrgAccess) {
          return res.status(403).json({
            message: "Cannot access athletes in different organizations"
          });
        }
      }

      // Get the metric definition
      const [metric] = await db
        .select()
        .from(siteMetrics)
        .where(eq(siteMetrics.code, metricCode));

      if (!metric) {
        return res.status(404).json({ message: "Metric not found" });
      }

      if (!metric.isDerived || !metric.formula || !metric.dependentMetrics) {
        return res.json({
          calculatedValue: null,
          sourceMetrics: [],
          formula: null
        });
      }

      // Find source measurements using calculator
      const { DerivedMetricCalculator } = await import("../services/derived-metric-calculator");
      const calculator = new DerivedMetricCalculator(db);

      const sourceMeasurementsMap = await calculator.findSourceMeasurementsPublic(
        athleteId,
        metric.dependentMetrics,
        date,
        metric.calculationConfig || {
          dateMatchStrategy: 'same_date',
          missingSourceBehavior: 'skip',
          maxDateDifference: undefined,
        }
      );

      if (!sourceMeasurementsMap) {
        return res.json({
          calculatedValue: null,
          sourceMetrics: [],
          missingMetrics: metric.dependentMetrics,
          formula: metric.formula
        });
      }

      // Build source values and metadata
      const sourceValues: Record<string, number> = {};
      const sourceMetrics: Array<{ code: string; label: string; value: number; unit: string; measurementId: string }> = [];
      const sourceMeasurementIds: string[] = [];

      for (const [code, measurement] of sourceMeasurementsMap.entries()) {
        sourceValues[code.toLowerCase()] = parseFloat(measurement.value);
        sourceMeasurementIds.push(measurement.id);

        // Get label and unit from siteMetrics
        const [sourceMetric] = await db
          .select()
          .from(siteMetrics)
          .where(eq(siteMetrics.code, code));

        sourceMetrics.push({
          code,
          label: sourceMetric?.label || code,
          value: parseFloat(measurement.value),
          unit: measurement.units || sourceMetric?.unit || '',
          measurementId: measurement.id
        });
      }

      // Evaluate formula
      const { evaluateFormula } = await import("../services/formula-service");
      const calculatedValue = evaluateFormula(metric.formula, sourceValues);

      return res.json({
        calculatedValue,
        sourceMetrics,
        sourceMeasurementIds,
        formula: metric.formula
      });
    } catch (error) {
      console.error("Calculate preview error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      const message = error instanceof Error ? error.message : "Failed to calculate preview";
      res.status(500).json({ message });
    }
  });

  /**
   * Live preview for paired-input metrics (e.g., 1RM estimate from load + reps).
   *
   * Distinct from /calculate-preview, which queries cross-row source measurements
   * by date. This endpoint takes the user's current form inputs and computes the
   * derived value via the metric's auxiliaryInputConfig formula. No DB writes,
   * no per-athlete data — purely a stateless calculator the form polls on input.
   */
  app.post("/api/measurements/calculate-lift-preview", measurementLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const bodySchema = z.object({
        metricCode: z.string().min(1).regex(/^[A-Z0-9_]+$/),
        primary: z.number(),
        auxiliary: z.number().nullable().optional(),
      });

      const { metricCode, primary, auxiliary } = bodySchema.parse(req.body);

      const [metric] = await db
        .select({
          code: siteMetrics.code,
          unit: siteMetrics.unit,
          auxiliaryInputConfig: siteMetrics.auxiliaryInputConfig,
        })
        .from(siteMetrics)
        .where(eq(siteMetrics.code, metricCode));

      if (!metric) {
        return res.status(404).json({ message: "Metric not found" });
      }

      if (!metric.auxiliaryInputConfig) {
        return res.status(400).json({
          message: "Metric does not support paired-input preview",
          field: "metricCode",
        });
      }

      const config = metric.auxiliaryInputConfig as AuxiliaryInputConfig;
      if (typeof config.computeFormula !== 'string' || !config.computeFormula) {
        return res.status(400).json({
          message: "Metric has invalid auxiliary input configuration",
          field: "metricCode",
        });
      }

      const result = computePairedInputMeasurement(
        config,
        metricCode,
        primary,
        auxiliary ?? null
      );

      return res.json({
        computedValue: result.value,
        formula: config.computeFormula,
        primaryUnit: result.units,
        auxiliaryLabel: config.label,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid input data", errors: error.errors });
      }
      if (error instanceof PairedInputValidationError) {
        return res.status(400).json({ message: error.message, field: error.field });
      }
      console.error("Calculate lift preview error:", error);
      const message = error instanceof Error ? error.message : "Failed to calculate lift preview";
      res.status(500).json({ message });
    }
  });
}
