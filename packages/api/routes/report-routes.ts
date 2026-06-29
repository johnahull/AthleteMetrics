/**
 * Report routes for coach and individual reports
 * Includes report CRUD, generation, snapshots, and PDF export
 */

import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import { ReportService } from "../services/report-service";
import { requireAuth, requireAIEnabled, type AuthenticatedRequest } from "../middleware";
import { storage } from "../storage";
import {
  insertReportSchema,
  reports,
  reportSnapshots,
  reportBenchmarks,
  reportShares,
  insertReportBenchmarkSchema,
  insertReportSnapshotSchema,
  users,
  organizations,
  teams,
  auditLogs,
  userOrganizations,
  siteMetrics,
  MAX_INSIGHTS_LENGTH,
  type Report,
} from "@shared/schema";
import { ZodError, z } from "zod";
import { db } from "../db";
import { eq, and, desc, asc, sql, inArray, isNull, type SQL } from "drizzle-orm";
import { isSiteAdmin } from "../utils/auth-helpers";
import { coppaService } from "../services/coppa-service";
import { parentalConsents, parentAthleteLinks } from "@shared/schema/tables/coppa";
import { COPPA_ACTIONS } from "@shared/coppa-utils";
import type { MetricExplanation } from "@shared/metric-explanations";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from "../utils/report-utils";
import { getPgErrorCode, PG_UNIQUE_VIOLATION } from "../lib/pg-error";
import { calculateTierDistributions } from "@shared/benchmark-utils";
import { requireRole } from "../permissions/middleware";
import { emailService } from "../services/email-service";
import { getPushNotificationService, type NotificationPayload } from "../services/push-notification-service";
import { notificationPreferences } from "@shared/schema";
import { hexToRgb, isSafeLogoUrl, fetchLogoBase64 } from "./report-branding-utils";

/** Organization branding fields used for PDF generation */
type ReportOrg = Pick<
  typeof organizations.$inferSelect,
  'name' | 'brandLogoUrl' | 'brandPrimaryColor' | 'brandSecondaryColor' | 'brandTagline'
>;

// Type guards for report configs
interface IndividualReportConfig {
  athleteId?: string;
  athleteIds?: string[];
  timeframe: {
    type: 'preset' | 'custom';
    preset?: 'season' | 'year' | 'all_time';
    customStart?: string;
    customEnd?: string;
  };
  metrics: string[];
  audience?: 'coach' | 'athlete' | 'parent';
  benchmarks?: {
    site?: string[];
    custom?: string[];
    userDefined?: Array<{
      metricCode: string;
      value: number;
      label: string;
    }>;
  };
}

interface TeamReportConfig {
  timeframe: {
    type: 'preset' | 'custom';
    preset?: 'season' | 'year' | 'all_time';
    customStart?: string;
    customEnd?: string;
  };
  metrics: string[];
  filters?: {
    teamIds?: string[];
    gender?: string;
    positions?: string[];
  };
  includeCompositeIndex?: boolean;
  benchmarks?: {
    site?: string[];
    custom?: string[];
    userDefined?: Array<{
      metricCode: string;
      value: number;
      label: string;
    }>;
  };
  compositeIndex?: {
    enabled: boolean;
    weights?: Record<string, number>;
  };
}

function isIndividualReportConfig(config: unknown): config is IndividualReportConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    ('athleteId' in config || 'athleteIds' in config)
  );
}

function isTeamReportConfig(config: unknown): config is TeamReportConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    'timeframe' in config &&
    !('athleteId' in config) &&
    !('athleteIds' in config)
  );
}

// Zod validation schemas for report sharing
const shareReportSchema = z.object({
  athleteId: z.string().uuid(),
  message: z.string().max(1000, "Message cannot exceed 1000 characters").optional(),
});

const bulkShareReportSchema = z.object({
  athleteIds: z.array(z.string().uuid()).optional(),
  message: z.string().max(1000, "Message cannot exceed 1000 characters").optional(),
});

// Schema for bulk distributing individual reports to their respective athletes
const bulkDistributeReportsSchema = z.object({
  reportIds: z.array(z.string().uuid()).min(1, "At least one report ID is required").max(100, "Cannot distribute more than 100 reports at once"),
  message: z.string().max(1000, "Message cannot exceed 1000 characters").optional(),
});

// Maximum athletes that can be shared with in a single bulk request
const MAX_BULK_SHARE = 100;

// Maximum reports that can be distributed in a single bulk request
const MAX_BULK_DISTRIBUTE = 100;


// PDF Generation Constants
const PDF_LIMITS = {
  MAX_ATHLETES_PER_METRIC: 50,
  MAX_COMPOSITE_RANKINGS: 20,
  PAGE_BREAK_THRESHOLD: 200, // y-position threshold for adding new page
} as const;

// Rate limiting for report endpoints
const reportLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many report requests, please try again later." },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for report endpoints - IP: ${req.ip}, User: ${req.session.user?.id || 'unauthenticated'}`);
    res.status(429).json({ message: "Too many report requests, please try again later." });
  },
});

// Stricter rate limiting for report generation and PDF export (expensive operations)
const reportGenerationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: 20, // Lower limit for expensive operations
  message: {
    message: "Too many report generation requests, please try again later.",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Very strict rate limiting for public endpoints (prevents token enumeration)
const publicSnapshotLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: 10, // Very low limit for unauthenticated public access
  message: {
    message: "Too many public snapshot requests, please try again later.",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Dedicated rate limiting for AI endpoints (very expensive API calls)
const aiGenerationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: 10, // Very low limit for expensive AI API calls
  message: {
    message: "Too many AI insight generation requests, please try again later.",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Stricter rate limiting for bulk operations (sharing/distributing to many athletes)
const bulkOperationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: 15, // Stricter limit to prevent notification spam and resource exhaustion
  message: {
    message: "Too many bulk operation requests, please try again later.",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for bulk operations - IP: ${req.ip}, User: ${req.session.user?.id || 'unauthenticated'}`);
    res.status(429).json({ message: "Too many bulk operation requests, please try again later." });
  },
});

export function registerReportRoutes(app: Express) {
  const reportService = new ReportService();

  /**
   * Create a new report
   * POST /api/reports
   *
   * For individual reports with multiple athleteIds, creates one report per athlete
   */
  app.post("/api/reports", reportLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body
      const { createdBy, id, createdAt, updatedAt, ...bodyData } = req.body;

      const validatedData = insertReportSchema.parse({
        ...bodyData,
        createdBy: user.id,
      });

      // Validate organization access
      const hasAccess = await reportService["validateOrganizationAccess"](
        user.id,
        validatedData.organizationId
      );
      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this organization" });
      }

      // Handle batch creation for individual reports with multiple athletes
      if (
        validatedData.reportType === "individual" &&
        validatedData.config &&
        isIndividualReportConfig(validatedData.config) &&
        validatedData.config.athleteIds &&
        Array.isArray(validatedData.config.athleteIds) &&
        validatedData.config.athleteIds.length > 0
      ) {
        const athleteIds = validatedData.config.athleteIds;

        // Fetch athlete names for better report titles
        const athletes = await db
          .select({
            id: users.id,
            fullName: users.fullName,
          })
          .from(users)
          .where(inArray(users.id, athleteIds));

        // Validate all athletes exist
        if (athletes.length !== athleteIds.length) {
          const foundIds = new Set(athletes.map((a) => a.id));
          const missingIds = athleteIds.filter((id) => !foundIds.has(id));
          return res.status(400).json({
            message: "Some athlete IDs are invalid",
            missingIds,
          });
        }

        const athleteMap = new Map(athletes.map((a) => [a.id, a.fullName]));

        // Create one report per athlete
        const createdReports = [];

        try {
          for (const athleteId of athleteIds) {
            const athleteName = athleteMap.get(athleteId) || "Unknown Athlete";

            // Create individual report config with single athleteId
            const reportConfig: IndividualReportConfig = {
              ...validatedData.config,
              athleteId, // Set single athleteId for this report
            };

            // Remove athleteIds array from config
            delete reportConfig.athleteIds;

            const [report] = await db
              .insert(reports)
              .values({
                name: `${validatedData.name} - ${athleteName}`,
                organizationId: validatedData.organizationId,
                reportType: validatedData.reportType,
                config: reportConfig,
                description: validatedData.description,
                isTemplate: validatedData.isTemplate || false,
                createdBy: user.id,
              })
              .returning();

            createdReports.push({
              ...report,
              athleteId,
              athleteName,
            });
          }

          return res.status(201).json({ reports: createdReports });
        } catch (batchError) {
          // If batch creation fails, attempt to clean up created reports
          if (createdReports.length > 0) {
            const createdIds = createdReports.map((r) => r.id);
            await db.delete(reports).where(inArray(reports.id, createdIds));
          }
          throw batchError;
        }
      }

      // Single report creation (for coach reports or edge cases)
      // For individual reports, normalize athleteIds array to single athleteId
      let finalConfig = validatedData.config;

      if (validatedData.reportType === "individual" && isIndividualReportConfig(validatedData.config)) {
        const athleteIds = validatedData.config.athleteIds;

        // Validate that individual reports have an athlete
        if (!athleteIds || !Array.isArray(athleteIds) || athleteIds.length === 0) {
          return res.status(400).json({
            message: "Individual reports require at least one athlete",
          });
        }

        // If single athlete in array, normalize to athleteId (singular)
        if (athleteIds.length === 1) {
          const { athleteIds: _, ...configWithoutAthleteIds } = validatedData.config;
          finalConfig = {
            ...configWithoutAthleteIds,
            athleteId: athleteIds[0],
          };
        } else {
          // Multiple athletes should have been handled by batch creation above
          return res.status(400).json({
            message: "Multiple athletes detected but batch creation was not triggered",
          });
        }
      }

      const [report] = await db
        .insert(reports)
        .values({
          name: validatedData.name,
          organizationId: validatedData.organizationId,
          reportType: validatedData.reportType,
          config: finalConfig,
          description: validatedData.description,
          isTemplate: validatedData.isTemplate || false,
          createdBy: user.id,
        })
        .returning();

      res.status(201).json(report);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }
      console.error("Error creating report:", error);
      res.status(500).json({ message: "Failed to create report" });
    }
  });

  /**
   * Get all reports for user's organizations with filtering, sorting, and pagination
   * GET /api/reports
   *
   * Query Parameters:
   * - organizationId: Filter by organization
   * - search: Search in name and description
   * - reportType: Filter by 'team' or 'individual'
   * - dateFrom: Filter by creation date (ISO string)
   * - dateTo: Filter by creation date (ISO string)
   * - metrics: Comma-separated metric codes to filter by
   * - teamIds: Comma-separated team IDs to filter by
   * - pinned: Filter by pinned status (true/false)
   * - sortBy: Field to sort by (name, createdAt, reportType)
   * - sortOrder: Sort order (asc/desc), default: desc
   * - limit: Number of results to return (default: 25, max: 100)
   * - offset: Number of results to skip (default: 0)
   */
  app.get("/api/reports", reportLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Parse query parameters
      const {
        organizationId,
        search,
        reportType,
        dateFrom,
        dateTo,
        metrics,
        teamIds,
        pinned,
        includeArchived, // New: set to 'true' to include archived reports
        sortBy = 'createdAt',
        sortOrder = 'desc',
        limit: limitParam = '25',
        offset: offsetParam = '0',
      } = req.query;

      const limit = Math.min(parseInt(limitParam as string) || 25, 100);
      const offset = parseInt(offsetParam as string) || 0;

      // Get user's organizations
      const userOrgs = await reportService["getUserOrganizations"](user.id);
      const orgIds = userOrgs.map((org) => org.organizationId);

      // Build WHERE conditions
      const conditions: SQL<unknown>[] = [];

      // Organization filter (access control)
      if (isSiteAdmin(user)) {
        if (organizationId) {
          conditions.push(eq(reports.organizationId, organizationId as string));
        }
        // Site admins can see all if no org specified
      } else {
        if (organizationId) {
          // Verify user has access to this organization
          if (!orgIds.includes(organizationId as string)) {
            return res
              .status(403)
              .json({ message: "Access denied to this organization" });
          }
          conditions.push(eq(reports.organizationId, organizationId as string));
        } else {
          // Get reports for all user's organizations
          conditions.push(inArray(reports.organizationId, orgIds));
        }
      }

      // Search filter (name or description)
      if (search && typeof search === 'string' && search.trim()) {
        // Escape LIKE special characters (%, _) to prevent SQL injection
        const escapedSearch = search.trim().replace(/[%_]/g, '\\$&');
        conditions.push(
          sql`(${reports.name} ILIKE ${`%${escapedSearch}%`} OR ${reports.description} ILIKE ${`%${escapedSearch}%`})`
        );
      }

      // Report type filter
      if (reportType === 'team' || reportType === 'individual') {
        conditions.push(eq(reports.reportType, reportType));
      }

      // Date range filters
      if (dateFrom && typeof dateFrom === 'string') {
        conditions.push(sql`${reports.createdAt} >= ${dateFrom}`);
      }
      if (dateTo && typeof dateTo === 'string') {
        conditions.push(sql`${reports.createdAt} <= ${dateTo}`);
      }

      // Metrics filter (check if config.metrics contains any of the specified metrics)
      if (metrics && typeof metrics === 'string') {
        // Regex validation for metrics to prevent SQL injection while allowing any valid metric code
        // Valid metric codes are uppercase letters, numbers, and underscores (e.g., FLY10_TIME, TOP_SPEED_CALC)
        const metricCodePattern = /^[A-Z0-9_]+$/;
        const metricCodes = metrics.split(',')
          .map(m => m.trim())
          .filter(m => metricCodePattern.test(m));
        if (metricCodes.length > 0) {
          conditions.push(
            sql`${reports.config}::jsonb->'metrics' ?| array[${sql.join(metricCodes.map(m => sql`${m}`), sql`, `)}]`
          );
        }
      }

      // Team filter (check if config.filters.teamIds contains any of the specified teams)
      if (teamIds && typeof teamIds === 'string') {
        // UUID format validation to prevent SQL injection
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const teamIdList = teamIds.split(',')
          .map(t => t.trim())
          .filter(t => uuidRegex.test(t));
        if (teamIdList.length > 0) {
          conditions.push(
            sql`${reports.config}::jsonb->'filters'->'teamIds' ?| array[${sql.join(teamIdList.map(t => sql`${t}`), sql`, `)}]`
          );
        }
      }

      // Pinned filter
      if (pinned === 'true') {
        conditions.push(eq(reports.isPinned, true));
      } else if (pinned === 'false') {
        conditions.push(eq(reports.isPinned, false));
      }

      // Archived filter: exclude archived reports by default
      // Only include archived reports when explicitly requested with includeArchived=true
      if (includeArchived !== 'true') {
        conditions.push(isNull(reports.archivedAt));
      }

      // Build the WHERE clause
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Determine sort column and order
      let orderByClause;
      const sortDirection = sortOrder === 'asc' ? asc : desc;

      switch (sortBy) {
        case 'name':
          orderByClause = sortDirection(reports.name);
          break;
        case 'reportType':
          orderByClause = sortDirection(reports.reportType);
          break;
        case 'createdAt':
        default:
          orderByClause = sortDirection(reports.createdAt);
          break;
      }

      // Execute query with pagination
      const reportsList = await db
        .select()
        .from(reports)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);

      // Get total count for pagination
      const totalCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(reports)
        .where(whereClause);

      const totalCount = Number(totalCountResult[0]?.count || 0);

      // For individual reports, add sentToAthlete status and targetAthlete name
      // This tells the UI which reports have already been sent to their target athlete
      // OPTIMIZATION: Batch query all shares and athlete names in bulk instead of N+1

      // Step 1: Collect all individual report IDs and their target athlete IDs
      const individualReportIds: string[] = [];
      const reportAthleteMap = new Map<string, string>(); // reportId -> athleteId
      const allAthleteIds = new Set<string>(); // All unique athlete IDs

      for (const report of reportsList) {
        if (report.reportType === 'individual') {
          const config = report.config as IndividualReportConfig;
          if (config?.athleteId) {
            individualReportIds.push(report.id);
            reportAthleteMap.set(report.id, config.athleteId);
            allAthleteIds.add(config.athleteId);
          }
        }
      }

      // Step 2: Batch query all athlete names for individual reports
      const athleteNameMap = new Map<string, string>(); // athleteId -> fullName

      if (allAthleteIds.size > 0) {
        const athleteRecords = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(users)
          .where(inArray(users.id, [...allAthleteIds]));

        for (const athlete of athleteRecords) {
          athleteNameMap.set(athlete.id, `${athlete.firstName} ${athlete.lastName}`);
        }
      }

      // Step 3: Batch query all shares for these reports
      const sharesMap = new Map<string, { sentAt: Date; athleteName: string }>();

      if (individualReportIds.length > 0) {
        const shareRecords = await db
          .select({
            reportId: reportShares.reportId,
            athleteId: reportShares.athleteId,
            sentAt: reportShares.createdAt,
          })
          .from(reportShares)
          .where(inArray(reportShares.reportId, individualReportIds));

        // Build a map of reportId -> share info (only if athleteId matches config)
        for (const share of shareRecords) {
          const expectedAthleteId = reportAthleteMap.get(share.reportId);
          if (expectedAthleteId === share.athleteId) {
            const athleteName = athleteNameMap.get(share.athleteId) || 'Unknown Athlete';
            sharesMap.set(share.reportId, {
              sentAt: share.sentAt,
              athleteName,
            });
          }
        }
      }

      // Step 4: Enrich reports with sentToAthlete status and targetAthlete name
      const reportsWithSentStatus = reportsList.map((report) => {
        if (report.reportType !== 'individual') {
          return report;
        }

        const config = report.config as IndividualReportConfig;
        const athleteId = config?.athleteId;
        const targetAthleteName = athleteId ? athleteNameMap.get(athleteId) : undefined;
        const shareInfo = sharesMap.get(report.id);

        return {
          ...report,
          targetAthleteName: targetAthleteName || undefined,
          sentToAthlete: shareInfo || null,
        };
      });

      res.json({
        reports: reportsWithSentStatus,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + reportsList.length < totalCount,
        },
      });
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  /**
   * Get a specific report
   * GET /api/reports/:id
   */
  app.get("/api/reports/:id", reportLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const reportId = req.params.id;

      const report = await db
        .select()
        .from(reports)
        .where(eq(reports.id, reportId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Validate organization access
      const hasAccess = await reportService["validateOrganizationAccess"](
        user.id,
        report.organizationId
      );
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this report" });
      }

      res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  /**
   * Update a report
   * PUT /api/reports/:id
   */
  app.put("/api/reports/:id", reportLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const reportId = req.params.id;

      const report = await db
        .select()
        .from(reports)
        .where(eq(reports.id, reportId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Validate organization access
      const hasAccess = await reportService["validateOrganizationAccess"](
        user.id,
        report.organizationId
      );
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this report" });
      }

      // Validate request body with Zod schema (partial for updates)
      const validatedData = insertReportSchema.partial().parse(req.body);

      // Update report
      const [updated] = await db
        .update(reports)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(reports.id, reportId))
        .returning();

      res.json(updated);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }
      console.error("Error updating report:", error);
      res.status(500).json({ message: "Failed to update report" });
    }
  });

  /**
   * Delete a report
   * DELETE /api/reports/:id
   */
  app.delete(
    "/api/reports/:id",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Delete report (cascades to snapshots and benchmarks)
        await db.delete(reports).where(eq(reports.id, reportId));

        res.json({ message: "Report deleted successfully" });
      } catch (error) {
        console.error("Error deleting report:", error);
        res.status(500).json({ message: "Failed to delete report" });
      }
    }
  );

  /**
   * Pin a report for quick access
   * PATCH /api/reports/:id/pin
   */
  app.patch(
    "/api/reports/:id/pin",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Check if report exists and user has access
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Check pinned reports count (limit to 10)
        const pinnedCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(reports)
          .where(
            and(
              eq(reports.organizationId, report.organizationId),
              eq(reports.isPinned, true)
            )
          )
          .then((rows) => Number(rows[0]?.count || 0));

        if (pinnedCount >= 10 && !report.isPinned) {
          return res.status(400).json({
            message: "Maximum of 10 pinned reports reached. Unpin another report first.",
          });
        }

        // Pin the report
        await db
          .update(reports)
          .set({ isPinned: true })
          .where(eq(reports.id, reportId));

        res.json({ message: "Report pinned successfully", isPinned: true });
      } catch (error) {
        console.error("Error pinning report:", error);
        res.status(500).json({ message: "Failed to pin report" });
      }
    }
  );

  /**
   * Unpin a report
   * PATCH /api/reports/:id/unpin
   */
  app.patch(
    "/api/reports/:id/unpin",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Check if report exists and user has access
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Unpin the report
        await db
          .update(reports)
          .set({ isPinned: false })
          .where(eq(reports.id, reportId));

        res.json({ message: "Report unpinned successfully", isPinned: false });
      } catch (error) {
        console.error("Error unpinning report:", error);
        res.status(500).json({ message: "Failed to unpin report" });
      }
    }
  );

  /**
   * Archive a report (soft-hide from coach view, athletes still see shared reports)
   * PATCH /api/reports/:id/archive
   */
  app.patch(
    "/api/reports/:id/archive",
    reportLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Check if report exists and user has access
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Archive the report
        await db
          .update(reports)
          .set({ archivedAt: new Date() })
          .where(eq(reports.id, reportId));

        res.json({ message: "Report archived successfully", archivedAt: new Date() });
      } catch (error) {
        console.error("Error archiving report:", error);
        res.status(500).json({ message: "Failed to archive report" });
      }
    }
  );

  /**
   * Unarchive a report (restore to active view)
   * PATCH /api/reports/:id/unarchive
   */
  app.patch(
    "/api/reports/:id/unarchive",
    reportLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Check if report exists and user has access
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Unarchive the report
        await db
          .update(reports)
          .set({ archivedAt: null })
          .where(eq(reports.id, reportId));

        res.json({ message: "Report unarchived successfully", archivedAt: null });
      } catch (error) {
        console.error("Error unarchiving report:", error);
        res.status(500).json({ message: "Failed to unarchive report" });
      }
    }
  );

  /**
   * Generate report with live data
   * POST /api/reports/:id/generate
   */
  app.post(
    "/api/reports/:id/generate",
    reportGenerationLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;
        const athleteId = req.body.athleteId; // For individual reports

        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Generate report based on type
        let reportData;
        if (report.reportType === 'team') {
          reportData = await reportService.generateTeamReport(reportId, user.id);
        } else if (report.reportType === "individual") {
          if (!athleteId) {
            return res
              .status(400)
              .json({ message: "Athlete ID required for individual reports" });
          }
          reportData = await reportService.generateIndividualReport(
            reportId,
            user.id,
            athleteId
          );
        } else {
          return res.status(400).json({ message: "Invalid report type" });
        }

        res.json(reportData);
      } catch (error) {
        console.error("Error generating report:", error);
        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to generate report",
        });
      }
    }
  );

  /**
   * Create a public snapshot
   * POST /api/reports/:id/snapshots
   */
  app.post(
    "/api/reports/:id/snapshots",
    reportGenerationLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;
        const expirationDays = req.body.expirationDays || 30;

        const snapshot = await reportService.createSnapshot(
          reportId,
          user.id,
          expirationDays
        );

        res.status(201).json(snapshot);
      } catch (error) {
        console.error("Error creating snapshot:", error);
        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to create snapshot",
        });
      }
    }
  );

  /**
   * Get all snapshots for a report
   * GET /api/reports/:id/snapshots
   */
  app.get(
    "/api/reports/:id/snapshots",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Validate report access
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Get snapshots
        const snapshots = await db
          .select()
          .from(reportSnapshots)
          .where(eq(reportSnapshots.reportId, reportId))
          .orderBy(desc(reportSnapshots.createdAt));

        res.json(snapshots);
      } catch (error) {
        console.error("Error fetching snapshots:", error);
        res.status(500).json({ message: "Failed to fetch snapshots" });
      }
    }
  );

  /**
   * Revoke a snapshot
   * DELETE /api/reports/:id/snapshots/:snapshotId
   */
  app.delete(
    "/api/reports/:id/snapshots/:snapshotId",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const snapshotId = req.params.snapshotId;

        await reportService.revokeSnapshot(snapshotId, user.id);

        res.json({ message: "Snapshot revoked successfully" });
      } catch (error) {
        console.error("Error revoking snapshot:", error);
        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to revoke snapshot",
        });
      }
    }
  );

  /**
   * Get public snapshot (NO AUTH REQUIRED)
   * GET /api/public/reports/:token
   */
  app.get("/api/public/reports/:token", publicSnapshotLimiter, async (req, res) => {
    try {
      const token = req.params.token;

      const snapshot = await reportService.getPublicSnapshot(token);

      if (!snapshot) {
        return res.status(404).json({ message: "Snapshot not found" });
      }

      // COPPA: if the snapshot is flagged publicAccessRestricted (contains minor
      // data from a COPPA-enabled org), enforce the shared access gate. Same
      // helper guards the public PDF-export routes so they cannot diverge.
      if (!(await enforcePublicSnapshotAccess(req, res, snapshot))) return;

      res.json(snapshot);
    } catch (error) {
      console.error("Error fetching public snapshot:", error);
      res.status(500).json({
        message:
          error instanceof Error ? error.message : "Failed to fetch snapshot",
      });
    }
  });

  /**
   * Generate PDF for a report
   * GET /api/reports/:id/pdf
   */
  app.get(
    "/api/reports/:id/pdf",
    reportGenerationLimiter,
    requireAuth,
    async (req, res) => {
      const reportId = req.params.id;
      const athleteId = req.query.athleteId as string | undefined;
      const format = (req.query.format as string) || 'simplified';
      let report: Report | undefined;

      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Generate report data
        let reportData: unknown;
        if (report.reportType === 'team') {
          reportData = await reportService.generateTeamReport(reportId, user.id);
        } else {
          if (!athleteId) {
            return res
              .status(400)
              .json({ message: "Athlete ID required for individual reports" });
          }
          reportData = await reportService.generateIndividualReport(
            reportId,
            user.id,
            athleteId
          );
        }

        // Fetch organization branding
        const org = await fetchOrgForBranding(report.organizationId);

        // Generate PDF
        const pdf = await generatePDF(report, reportData, format as 'visual' | 'simplified', org);

        // Send PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${sanitizeFilename(report.name)}.pdf"`
        );
        res.send(Buffer.from(pdf.output("arraybuffer")));
      } catch (error) {
        console.error("Error generating PDF:", {
          reportId,
          reportType: report?.reportType || 'unknown',
          athleteId,
          format,
          error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to generate PDF",
        });
      }
    }
  );

  /**
   * Generate PDF for public snapshot (NO AUTH REQUIRED)
   * GET /api/public/reports/:token/pdf
   */
  app.get(
    "/api/public/reports/:token/pdf",
    publicSnapshotLimiter,
    async (req, res) => {
      try {
        const token = req.params.token;
        const format = (req.query.format as string) || 'simplified';

        const snapshot = await reportService.getPublicSnapshot(token);

        if (!snapshot) {
          return res.status(404).json({ message: "Snapshot not found" });
        }

        // COPPA: PDF export must honor the same restriction as the snapshot
        // route — a token alone cannot unlock minor data via the PDF path.
        if (!(await enforcePublicSnapshotAccess(req, res, snapshot))) return;

        // Get report details
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, snapshot.reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Fetch organization branding
        const org = await fetchOrgForBranding(report.organizationId);

        // Generate PDF from snapshot data
        const pdf = await generatePDF(report, snapshot.snapshotData, format as 'visual' | 'simplified', org);

        // Send PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${sanitizeFilename(report.name)}.pdf"`
        );
        res.send(Buffer.from(pdf.output("arraybuffer")));
      } catch (error) {
        console.error("Error generating public PDF:", error);
        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to generate PDF",
        });
      }
    }
  );

  /**
   * Generate PDF for a report with client-captured trend charts
   * POST /api/reports/:id/pdf
   */
  app.post(
    "/api/reports/:id/pdf",
    // Rate-limit and authenticate BEFORE parsing the (up to 15 MB) body, so an
    // unauthenticated or over-quota caller is rejected on headers alone and the
    // large chart-image payload is never buffered into memory.
    reportGenerationLimiter,
    requireAuth,
    express.json({ limit: '15mb' }),
    async (req, res) => {
      const reportId = req.params.id;
      const { athleteId, format = 'simplified' } = req.body || {};
      const chartImages = normalizeChartImages(req.body?.chartImages);
      let report: Report | undefined;

      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Generate report data
        let reportData: unknown;
        if (report.reportType === 'team') {
          reportData = await reportService.generateTeamReport(reportId, user.id);
        } else {
          if (!athleteId) {
            return res
              .status(400)
              .json({ message: "Athlete ID required for individual reports" });
          }
          reportData = await reportService.generateIndividualReport(
            reportId,
            user.id,
            athleteId
          );
        }

        // Fetch organization branding
        const org = await fetchOrgForBranding(report.organizationId);

        // Generate PDF
        const pdf = await generatePDF(report, reportData, format as 'visual' | 'simplified', org, chartImages);

        // Send PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${sanitizeFilename(report.name)}.pdf"`
        );
        res.send(Buffer.from(pdf.output("arraybuffer")));
      } catch (error) {
        console.error("Error generating PDF:", {
          reportId,
          reportType: report?.reportType || 'unknown',
          athleteId,
          format,
          error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to generate PDF",
        });
      }
    }
  );

  /**
   * Generate PDF for public snapshot with client-captured trend charts (NO AUTH REQUIRED)
   * POST /api/public/reports/:token/pdf
   */
  app.post(
    "/api/public/reports/:token/pdf",
    // Rate-limit before parsing the (up to 15 MB) body so large payloads cannot
    // bypass the per-IP counter or exhaust memory ahead of the limiter.
    publicSnapshotLimiter,
    express.json({ limit: '15mb' }),
    async (req, res) => {
      try {
        const token = req.params.token;
        const { format = 'simplified' } = req.body || {};
        const chartImages = normalizeChartImages(req.body?.chartImages);

        const snapshot = await reportService.getPublicSnapshot(token);

        if (!snapshot) {
          return res.status(404).json({ message: "Snapshot not found" });
        }

        // COPPA: PDF export must honor the same restriction as the snapshot
        // route — a token alone cannot unlock minor data via the PDF path.
        if (!(await enforcePublicSnapshotAccess(req, res, snapshot))) return;

        // Get report details
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, snapshot.reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Fetch organization branding
        const org = await fetchOrgForBranding(report.organizationId);

        // Generate PDF from snapshot data
        const pdf = await generatePDF(report, snapshot.snapshotData, format as 'visual' | 'simplified', org, chartImages);

        // Send PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${sanitizeFilename(report.name)}.pdf"`
        );
        res.send(Buffer.from(pdf.output("arraybuffer")));
      } catch (error) {
        console.error("Error generating public PDF:", error);
        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to generate PDF",
        });
      }
    }
  );

  /**
   * Generate AI coaching insights for a report
   * POST /api/reports/:id/generate-insights
   *
   * Requires: Coach or above role, AI enabled for organization (both flags)
   */
  app.post("/api/reports/:id/generate-insights", aiGenerationLimiter, requireAuth, requireRole('coach'), requireAIEnabled, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.id;
      const user = req.session?.user || req.user;

      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get report
      const report = await storage.getReport(reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // SECURITY: Verify user has access to this report's organization
      const hasAccess = await reportService["validateOrganizationAccess"](
        user.id,
        report.organizationId
      );
      if (!hasAccess) {
        return res.status(403).json({
          message: "Access denied to this report"
        });
      }

      // COPPA: check AI consent for any minor athletes in this report.
      // canAccessAI fails closed: null/undefined/false → blocked.
      if (report.reportType === 'individual') {
        // For individual reports, check the specific athlete.
        const config = report.config as any;
        const athleteId = config?.filters?.athleteId || config?.athleteId;
        if (athleteId) {
          const canAccess = await coppaService.canAccessAI(athleteId);
          if (!canAccess) {
            const athlete = await storage.getUser(athleteId);
            // Block if minor, or if athlete can't be found (fail closed)
            if (!athlete || athlete.isMinor) {
              return res.status(403).json({
                code: 'ai_consent_required',
                message: "AI coaching insights require parental consent for AI features for this athlete.",
                featureDisabled: true,
                reason: !athlete ? 'athlete_not_found' : 'minor_without_ai_consent',
              });
            }
          }
        } else {
          // Cannot resolve athleteId from individual report config — fail closed to
          // maintain the COPPA invariant. A missing athleteId could mean the report
          // covers a minor whose consent status cannot be verified.
          console.warn(`[COPPA] Individual report ${report.id} has no athleteId in config — blocking AI access (fail closed)`);
          return res.status(403).json({
            code: 'ai_consent_required',
            message: "AI coaching insights are unavailable: unable to verify consent status for this report.",
            featureDisabled: true,
            reason: 'individual_report_missing_athlete',
          });
        }
      } else if (report.reportType === 'team') {
        // For team/org reports, check ALL minor athletes in the organization.
        // If any minor lacks AI consent, block the report generation.
        // Uses batch query (2 queries) instead of per-user queries (2*N).
        const orgUsers = await storage.getOrganizationUsers(report.organizationId);
        const minorIds = orgUsers
          .filter(ou => ou.user?.isMinor)
          .map(ou => ou.user!.id);
        const minorsWithoutConsent = await coppaService.getMinorsWithoutAIConsent(minorIds);
        if (minorsWithoutConsent.length > 0) {
          return res.status(403).json({
            code: 'ai_consent_required',
            message: `AI coaching insights blocked: ${minorsWithoutConsent.length} minor athlete(s) in this report lack parental consent for AI features.`,
            featureDisabled: true,
            reason: 'minor_without_ai_consent',
          });
        }
      }

      // Get organization to check AI flags
      const org = await storage.getOrganization(report.organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get site settings to determine which AI model to use
      const siteSettings = await storage.getSiteSettings();
      const { AI_MODELS, generateCoachingInsights, isModelAvailable } = await import("../services/ai-insights-service");
      type AIModelKey = keyof typeof AI_MODELS;

      const modelKey = (siteSettings?.aiModel || "gpt-5-nano") as string;

      // Validate model key exists in AI_MODELS
      if (!(modelKey in AI_MODELS)) {
        return res.status(500).json({ message: "Invalid AI model configuration. Please contact your administrator." });
      }

      // Validate API key is available for the selected model's provider using shared utility
      const modelAvailability = isModelAvailable(modelKey);
      if (!modelAvailability.available) {
        console.error(`AI generation failed: Missing API key for provider ${modelAvailability.provider}`);
        return res.status(503).json({
          message: "AI service is not available. Please contact your administrator to configure the AI provider."
        });
      }

      // Build report data for AI
      const reportData = await buildReportDataForAI(report, user.id, reportService);

      // Generate insights using AI service
      const insights = await generateCoachingInsights(modelKey as AIModelKey, reportData);

      // Validate insights length
      if (insights.length > MAX_INSIGHTS_LENGTH) {
        return res.status(400).json({
          message: `Generated insights exceed maximum length of ${MAX_INSIGHTS_LENGTH} characters. Please try regenerating.`
        });
      }

      // Use transaction to ensure atomic update of report and audit log
      const result = await db.transaction(async (tx) => {
        // Update report with generated insights
        const [updatedReport] = await tx
          .update(reports)
          .set({
            coachingInsights: insights,
            coachingInsightsGeneratedAt: new Date(),
            coachingInsightsModel: modelKey,
            updatedAt: new Date(),
          })
          .where(eq(reports.id, reportId))
          .returning();

        // Audit log for AI insight generation
        await tx.insert(auditLogs).values({
          userId: user.id,
          action: 'report_ai_insights_generated',
          resourceType: 'report',
          resourceId: reportId,
          details: JSON.stringify({
            reportName: report.name,
            organizationId: report.organizationId,
            model: modelKey,
            insightsLength: insights.length
          }),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        });

        return updatedReport;
      });

      res.json({
        insights,
        generatedAt: result.coachingInsightsGeneratedAt,
        model: modelKey,
      });
    } catch (error) {
      console.error("Error generating coaching insights:", error);

      // Audit log for failed AI generation
      const user = req.session?.user || req.user;
      if (user?.id) {
        try {
          await storage.createAuditLog({
            userId: user.id,
            action: 'report_ai_insights_generation_failed',
            resourceType: 'report',
            resourceId: req.params.id,
            details: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error'
            }),
            ipAddress: req.ip || null,
            userAgent: req.get('user-agent') || null,
          });
        } catch (auditError) {
          // Log with full context for debugging - audit trail is critical for compliance
          console.error("CRITICAL: Failed to create audit log for failed AI generation:", {
            userId: user.id,
            reportId: req.params.id,
            originalError: error instanceof Error ? error.message : 'Unknown error',
            auditError: auditError instanceof Error ? auditError.message : auditError,
          });
        }
      }

      res.status(500).json({
        message: "Failed to generate coaching insights. Please try again or contact support."
      });
    }
  });

  /**
   * Update coaching insights for a report (manual edit)
   * PATCH /api/reports/:id/insights
   *
   * Requires: Coach or above role, AI enabled for organization (both flags)
   */
  app.patch("/api/reports/:id/insights", reportLimiter, requireAuth, requireRole('coach'), requireAIEnabled, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const reportId = req.params.id;
      const { coachingInsights } = req.body;

      // Validate insights
      const { updateReportInsightsSchema } = await import("@shared/schema");
      updateReportInsightsSchema.parse({ coachingInsights });

      // Get report
      const report = await storage.getReport(reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // SECURITY: Verify user has access to this organization
      const hasAccess = await reportService["validateOrganizationAccess"](
        user.id,
        report.organizationId
      );
      if (!hasAccess) {
        return res.status(403).json({
          message: "Access denied to this report"
        });
      }

      // Use transaction to ensure atomic update of report and audit log
      const result = await db.transaction(async (tx) => {
        // Update report insights
        // Set model to null to indicate manual edit (not AI-generated)
        const [updatedReport] = await tx
          .update(reports)
          .set({
            coachingInsights,
            coachingInsightsGeneratedAt: new Date(),
            coachingInsightsModel: null, // Clear model to indicate manual edit
            updatedAt: new Date(),
          })
          .where(eq(reports.id, reportId))
          .returning();

        // Audit log for manual insight update
        await tx.insert(auditLogs).values({
          userId: user.id,
          action: 'report_ai_insights_updated',
          resourceType: 'report',
          resourceId: reportId,
          details: JSON.stringify({
            reportName: report.name,
            organizationId: report.organizationId,
            insightsLength: coachingInsights.length
          }),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        });

        return updatedReport;
      });

      res.json({
        insights: result.coachingInsights,
        generatedAt: result.coachingInsightsGeneratedAt,
        model: result.coachingInsightsModel,
      });
    } catch (error) {
      console.error("Error updating coaching insights:", error);

      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }

      res.status(500).json({
        message: "Failed to update coaching insights"
      });
    }
  });

  /**
   * Share a report with a single athlete
   * POST /api/reports/:id/share
   */
  app.post(
    "/api/reports/:id/share",
    reportLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Validate request body
        const validatedData = shareReportSchema.parse(req.body);
        const { athleteId, message } = validatedData;

        // Get report
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Verify athlete exists and is in same organization
        const athleteOrgMemberships = await db
          .select()
          .from(userOrganizations)
          .where(
            and(
              eq(userOrganizations.userId, athleteId),
              eq(userOrganizations.organizationId, report.organizationId)
            )
          )
          .limit(1);

        if (athleteOrgMemberships.length === 0) {
          return res
            .status(400)
            .json({ message: "Athlete not found in this organization" });
        }

        // Verify that the user is actually an athlete (not a coach or admin)
        const userRoles = await storage.getUserRoles(athleteId, report.organizationId);
        if (!userRoles.includes('athlete')) {
          return res
            .status(400)
            .json({ message: "User must be an athlete to receive report shares" });
        }

        // Get athlete details (including email for notifications)
        const athlete = await db
          .select({
            firstName: users.firstName,
            lastName: users.lastName,
            fullName: users.fullName,
            emails: users.emails,
          })
          .from(users)
          .where(eq(users.id, athleteId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!athlete) {
          return res.status(400).json({ message: "Athlete not found" });
        }

        // Attempt to create share
        try {
          const [share] = await db
            .insert(reportShares)
            .values({
              reportId,
              athleteId,
              sharedBy: user.id,
              organizationId: report.organizationId,
              message: message || null,
            })
            .returning();

          // Send notifications (non-blocking - don't fail if notifications fail)
          let emailSent = false;
          let pushSent = false;

          try {
            // Get athlete's notification preferences
            const prefs = await db
              .select()
              .from(notificationPreferences)
              .where(eq(notificationPreferences.userId, athleteId))
              .limit(1)
              .then((rows) => rows[0]);

            // Use defaults if no preferences exist
            const pushEnabled = prefs?.pushEnabled ?? true;
            const emailEnabled = prefs?.emailEnabled ?? true;
            const pushReportShared = prefs?.pushReportShared ?? true;
            const emailReportShared = prefs?.emailReportShared ?? true;

            // Get coach and organization details for notification
            const coach = await db
              .select({ fullName: users.fullName })
              .from(users)
              .where(eq(users.id, user.id))
              .limit(1)
              .then((rows) => rows[0]);

            const organization = await db
              .select({ name: organizations.name })
              .from(organizations)
              .where(eq(organizations.id, report.organizationId))
              .limit(1)
              .then((rows) => rows[0]);

            // Send email notification if enabled
            if (emailEnabled && emailReportShared && athlete.emails && athlete.emails.length > 0) {
              try {
                const appUrl = process.env.APP_URL || 'https://athletemetrics.app';
                emailSent = await emailService.sendReportSharedNotification(athlete.emails[0], {
                  athleteName: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`,
                  coachName: coach?.fullName || 'Your coach',
                  organizationName: organization?.name || 'Your organization',
                  reportName: report.name,
                  message: message || undefined,
                  viewUrl: `${appUrl}/my-reports`,
                });
              } catch (emailError) {
                console.error(
                  `Failed to send email notification - Coach: ${user.id}, Athlete: ${athlete.emails[0]}, Org: ${report.organizationId}`,
                  emailError
                );
              }
            }

            // Send push notification if enabled
            if (pushEnabled && pushReportShared) {
              try {
                const pushService = getPushNotificationService(db);
                const notificationPayload: NotificationPayload = {
                  type: 'report_shared',
                  title: 'New Performance Report',
                  body: `${coach?.fullName || 'Your coach'} shared "${report.name}" with you`,
                  url: '/my-reports',
                  data: {
                    shareId: share.id,
                    reportId: share.reportId,
                  },
                };
                const result = await pushService.sendToUser(athleteId, notificationPayload, report.organizationId);
                pushSent = result.successful > 0;
              } catch (pushError) {
                console.error(
                  `Failed to send push notification - Coach: ${user.id}, Athlete: ${athleteId}, Org: ${report.organizationId}`,
                  pushError
                );
              }
            }
          } catch (notificationError) {
            console.error(
              `Failed to send notifications - Coach: ${user.id}, Athlete: ${athleteId}, Org: ${report.organizationId}`,
              notificationError
            );
            // Don't fail the request if notifications fail
          }

          res.status(201).json({
            shareId: share.id,
            athleteName: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`,
            notificationSent: emailSent || pushSent,
          });
        } catch (insertError: any) {
          // Check for unique constraint violation
          if (getPgErrorCode(insertError) === PG_UNIQUE_VIOLATION) {
            return res.status(409).json({
              message: "Report already shared with this athlete",
            });
          }
          throw insertError;
        }
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Validation error",
            errors: error.errors,
          });
        }
        console.error("Error sharing report:", error);
        res.status(500).json({ message: "Failed to share report" });
      }
    }
  );

  /**
   * Share a report with multiple athletes (bulk)
   * POST /api/reports/:id/share-bulk
   *
   * @description
   * Shares a SINGLE report with MULTIPLE athletes in a single transaction.
   * Duplicate shares are skipped using database unique constraints.
   * Notifications are sent asynchronously after successful database operations.
   *
   * @security
   * - Rate limited: 15 requests per 15 minutes (bulkOperationLimiter)
   * - Authentication: requireAuth
   * - Authorization: requireRole('coach')
   * - Organization access: Validates coach has access to report's organization
   * - Athlete access: Validates all athletes belong to the same organization as report
   *
   * @performance
   * - Batch queries used to prevent N+1 issues (athletes, preferences, notifications)
   * - Single transaction for all share inserts (ACID guarantees)
   * - Fire-and-forget notification sending to avoid blocking response
   * - For 100 athletes: ~200-400ms for DB operations, 5-30s for notifications (async)
   *
   * @input
   * - reportId (URL param): UUID of report to share
   * - athleteIds (body): Array of athlete UUIDs (max 100)
   * - message (body, optional): Custom message to include (max 1000 chars)
   *
   * @returns
   * {
   *   shared: number,           // Successfully shared count
   *   skipped: number,          // Already shared count (duplicates)
   *   alreadyShared: number     // Same as skipped for backwards compatibility
   * }
   *
   * @example
   * POST /api/reports/123e4567-e89b-12d3-a456-426614174000/share-bulk
   * {
   *   "athleteIds": ["uuid1", "uuid2", "uuid3"],
   *   "message": "Great job this week!"
   * }
   */
  app.post(
    "/api/reports/:id/share-bulk",
    bulkOperationLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Validate request body
        const validatedData = bulkShareReportSchema.parse(req.body);
        const { athleteIds, message } = validatedData;

        // Get report
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Determine target athletes
        let targetAthleteIds: string[];

        if (athleteIds && athleteIds.length > 0) {
          // Use provided athlete IDs
          targetAthleteIds = athleteIds;
        } else {
          // Get all athletes in the report's organization
          const orgAthletes = await db
            .select({ userId: userOrganizations.userId })
            .from(userOrganizations)
            .where(
              and(
                eq(userOrganizations.organizationId, report.organizationId),
                eq(userOrganizations.role, 'athlete')
              )
            );

          targetAthleteIds = orgAthletes.map((a) => a.userId);
        }

        if (targetAthleteIds.length === 0) {
          return res.status(400).json({
            message: "No athletes to share with",
          });
        }

        // Enforce bulk share limit
        if (targetAthleteIds.length > MAX_BULK_SHARE) {
          return res.status(400).json({
            message: `Cannot share with more than ${MAX_BULK_SHARE} athletes at once. Requested: ${targetAthleteIds.length}`,
          });
        }

        // Batch verify organization membership AND athlete role (fixes N+1 query)
        const orgMemberships = await db
          .select({ userId: userOrganizations.userId, role: userOrganizations.role })
          .from(userOrganizations)
          .where(
            and(
              inArray(userOrganizations.userId, targetAthleteIds),
              eq(userOrganizations.organizationId, report.organizationId),
              eq(userOrganizations.role, 'athlete')
            )
          );
        const validAthleteSet = new Set(orgMemberships.map((m) => m.userId));

        // Get athlete names and emails for notifications
        const athletes = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            fullName: users.fullName,
            emails: users.emails,
          })
          .from(users)
          .where(inArray(users.id, targetAthleteIds));

        const athleteMap = new Map(
          athletes.map((a) => [
            a.id,
            a.fullName || `${a.firstName} ${a.lastName}`,
          ])
        );

        // Get existing shares to avoid duplicates
        const existingShares = await db
          .select({ athleteId: reportShares.athleteId })
          .from(reportShares)
          .where(
            and(
              eq(reportShares.reportId, reportId),
              inArray(reportShares.athleteId, targetAthleteIds)
            )
          );

        const alreadySharedSet = new Set(
          existingShares.map((s) => s.athleteId)
        );

        // Process shares - prepare data first, then insert in a transaction
        const results: Array<{
          athleteId: string;
          athleteName: string;
          status: 'shared' | 'skipped' | 'already_shared' | 'failed';
          reason?: string;
        }> = [];

        let skipped = 0;
        let alreadyShared = 0;

        // Prepare list of shares to insert
        const sharesToInsert: Array<{
          reportId: string;
          athleteId: string;
          sharedBy: string;
          organizationId: string;
          message: string | null;
        }> = [];

        for (const athleteId of targetAthleteIds) {
          const athleteName = athleteMap.get(athleteId) || 'Unknown Athlete';

          // Skip if already shared
          if (alreadySharedSet.has(athleteId)) {
            results.push({
              athleteId,
              athleteName,
              status: 'already_shared',
            });
            alreadyShared++;
            continue;
          }

          // Verify athlete is in the organization (using pre-fetched set)
          if (!validAthleteSet.has(athleteId)) {
            results.push({
              athleteId,
              athleteName,
              status: 'skipped',
              reason: 'Not in organization',
            });
            skipped++;
            continue;
          }

          // Add to batch insert
          sharesToInsert.push({
            reportId,
            athleteId,
            sharedBy: user.id,
            organizationId: report.organizationId,
            message: message || null,
          });
        }

        // Insert all shares in a single transaction for consistency
        let shared = 0;
        if (sharesToInsert.length > 0) {
          try {
            await db.transaction(async (tx) => {
              await tx.insert(reportShares).values(sharesToInsert);
            });

            // Mark all as shared in results
            for (const share of sharesToInsert) {
              const athleteName = athleteMap.get(share.athleteId) || 'Unknown Athlete';
              results.push({
                athleteId: share.athleteId,
                athleteName,
                status: 'shared',
              });
              shared++;
            }

            // Send notifications to all athletes (non-blocking)
            // Note: For large bulk shares (e.g., 100 athletes), this runs sequentially
            // but doesn't block the response. Consider moving to background job queue
            // for production if notification volume becomes an issue.
            if (sharesToInsert.length > 0) {
              // Get coach details once for all notifications
              const coach = await db
                .select({ fullName: users.fullName })
                .from(users)
                .where(eq(users.id, user.id))
                .limit(1)
                .then((rows) => rows[0]);

              const organization = await db
                .select({ name: organizations.name })
                .from(organizations)
                .where(eq(organizations.id, report.organizationId))
                .limit(1)
                .then((rows) => rows[0]);

              const appUrl = process.env.APP_URL || 'https://athletemetrics.app';

              // Batch fetch notification preferences for all athletes to avoid N+1 query
              const uniqueAthleteIds = sharesToInsert.map((s) => s.athleteId);
              const prefsRecords = await db
                .select()
                .from(notificationPreferences)
                .where(inArray(notificationPreferences.userId, uniqueAthleteIds));
              const prefsMap = new Map(prefsRecords.map((p) => [p.userId, p]));

              // Send notifications asynchronously (fire and forget)
              // Note: Notification failures are logged but don't block the response.
              // Athletes can still see shared reports in "My Reports" even if notifications fail.
              Promise.all(
                sharesToInsert.map(async (share) => {
                  try {
                    // Get athlete's notification preferences from the batch-fetched map
                    const prefs = prefsMap.get(share.athleteId);

                    const pushEnabled = prefs?.pushEnabled ?? true;
                    const emailEnabled = prefs?.emailEnabled ?? true;
                    const pushReportShared = prefs?.pushReportShared ?? true;
                    const emailReportShared = prefs?.emailReportShared ?? true;

                    // Get athlete details
                    const athlete = athletes.find((a) => a.id === share.athleteId);
                    if (!athlete) return;

                    // Send email notification
                    if (emailEnabled && emailReportShared && athlete.emails && athlete.emails.length > 0) {
                      try {
                        await emailService.sendReportSharedNotification(athlete.emails[0], {
                          athleteName: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`,
                          coachName: coach?.fullName || 'Your coach',
                          organizationName: organization?.name || 'Your organization',
                          reportName: report.name,
                          message: share.message || undefined,
                          viewUrl: `${appUrl}/my-reports`,
                        });
                      } catch (emailError) {
                        console.error(
                          `Failed to send email notification - Coach: ${user.id}, Athlete: ${athlete.emails[0]}, Org: ${report.organizationId}`,
                          emailError
                        );
                      }
                    }

                    // Send push notification
                    if (pushEnabled && pushReportShared) {
                      try {
                        const pushService = getPushNotificationService(db);
                        const notificationPayload: NotificationPayload = {
                          type: 'report_shared',
                          title: 'New Performance Report',
                          body: `${coach?.fullName || 'Your coach'} shared "${report.name}" with you`,
                          url: '/my-reports',
                          data: {
                            reportId: share.reportId,
                          },
                        };
                        await pushService.sendToUser(share.athleteId, notificationPayload, report.organizationId);
                      } catch (pushError) {
                        console.error(
                          `Failed to send push notification - Coach: ${user.id}, Athlete: ${share.athleteId}, Org: ${report.organizationId}`,
                          pushError
                        );
                      }
                    }
                  } catch (notificationError) {
                    console.error(
                      `Failed to send notifications - Coach: ${user.id}, Athlete: ${share.athleteId}, Org: ${report.organizationId}`,
                      notificationError
                    );
                  }
                })
              ).catch((err) => {
                console.error('Error in bulk notification sending:', err);
              });
            }
          } catch (shareError: any) {
            console.error('Failed to bulk insert shares:', shareError);
            // If transaction fails, mark all as failed
            for (const share of sharesToInsert) {
              const athleteName = athleteMap.get(share.athleteId) || 'Unknown Athlete';
              results.push({
                athleteId: share.athleteId,
                athleteName,
                status: 'failed',
                reason: shareError.message || 'Database transaction failed',
              });
            }
          }
        }

        res.status(200).json({
          totalRequested: targetAthleteIds.length,
          shared,
          skipped,
          alreadyShared,
          results,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Validation error",
            errors: error.errors,
          });
        }
        console.error("Error bulk sharing report:", error);
        res.status(500).json({ message: "Failed to bulk share report" });
      }
    }
  );

  /**
   * Bulk distribute individual reports to their respective athletes
   * POST /api/reports/bulk-distribute
   *
   * @description
   * Distributes MULTIPLE individual reports to their RESPECTIVE athletes.
   * Unlike share-bulk (ONE report → MANY athletes), this endpoint handles
   * MANY reports → THEIR CONFIGURED athletes (each report has one athleteId).
   * Each report is only sent to its designated athlete.
   *
   * @use-case
   * - Coach generates 50 individual athlete reports from template
   * - Coach clicks "Send All" to distribute to each athlete
   * - Each athlete receives only their own personalized report
   *
   * @security
   * - Rate limited: 15 requests per 15 minutes (bulkOperationLimiter)
   * - Authentication: requireAuth
   * - Authorization: requireRole('coach')
   * - Organization access: Validates coach has access to all reports' organizations
   * - Report validation: Only sends reports with valid athleteId (IndividualReportConfig)
   *
   * @performance
   * - Batch queries for reports, athletes, preferences, organizations
   * - Single transaction for all share inserts (ACID guarantees)
   * - Fire-and-forget notification sending to avoid blocking response
   * - For 100 reports: ~300-500ms for DB operations, 7-30s for notifications (async)
   *
   * @input
   * - reportIds (body): Array of report UUIDs (max 100)
   * - message (body, optional): Custom message to include (max 1000 chars)
   *
   * @returns
   * {
   *   distributed: number,      // Successfully distributed count
   *   skipped: number,          // Already distributed count (duplicates)
   *   failed: number            // Failed count (invalid athleteId, access denied, etc.)
   * }
   *
   * @example
   * POST /api/reports/bulk-distribute
   * {
   *   "reportIds": ["uuid1", "uuid2", "uuid3"],
   *   "message": "Here is your personalized report!"
   * }
   */
  app.post(
    "/api/reports/bulk-distribute",
    bulkOperationLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        // Validate request body
        const validatedData = bulkDistributeReportsSchema.parse(req.body);
        const { reportIds, message } = validatedData;

        // Fetch all requested reports in one query
        const targetReports = await db
          .select()
          .from(reports)
          .where(inArray(reports.id, reportIds));

        if (targetReports.length === 0) {
          return res.status(404).json({ message: "No reports found" });
        }

        // Get unique organization IDs from the reports to validate access
        const orgIds = [...new Set(targetReports.map((r) => r.organizationId))];

        // Validate user has access to all organizations
        for (const orgId of orgIds) {
          const hasAccess = await reportService["validateOrganizationAccess"](
            user.id,
            orgId
          );
          if (!hasAccess) {
            return res.status(403).json({
              message: "Access denied to one or more report organizations",
            });
          }
        }

        // Build a map of athleteId -> report for individual reports
        const reportAthleteMap: Map<string, { reportId: string; reportName: string; athleteId: string; organizationId: string }> = new Map();
        const skippedReports: Array<{ reportId: string; reportName: string; reason: string }> = [];

        for (const report of targetReports) {
          // Only process individual reports
          if (report.reportType !== 'individual') {
            skippedReports.push({
              reportId: report.id,
              reportName: report.name,
              reason: 'Not an individual report',
            });
            continue;
          }

          const config = report.config as IndividualReportConfig;
          const athleteId = config?.athleteId;

          if (!athleteId) {
            skippedReports.push({
              reportId: report.id,
              reportName: report.name,
              reason: 'No athlete ID configured',
            });
            continue;
          }

          reportAthleteMap.set(report.id, {
            reportId: report.id,
            reportName: report.name,
            athleteId,
            organizationId: report.organizationId,
          });
        }

        if (reportAthleteMap.size === 0) {
          return res.status(400).json({
            message: "No valid individual reports to distribute",
            skipped: skippedReports,
          });
        }

        // Get all unique athlete IDs and fetch their details
        const athleteIds = [...new Set([...reportAthleteMap.values()].map((r) => r.athleteId))];

        const athletes = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            fullName: users.fullName,
            emails: users.emails,
          })
          .from(users)
          .where(inArray(users.id, athleteIds));

        const athleteMap = new Map(athletes.map((a) => [a.id, a]));

        // Check which report-athlete pairs already have shares
        const reportIdsToCheck = [...reportAthleteMap.keys()];
        const existingShares = await db
          .select({
            reportId: reportShares.reportId,
            athleteId: reportShares.athleteId,
          })
          .from(reportShares)
          .where(inArray(reportShares.reportId, reportIdsToCheck));

        // Create a set of "reportId:athleteId" for quick lookup
        const existingShareSet = new Set(
          existingShares.map((s) => `${s.reportId}:${s.athleteId}`)
        );

        // Prepare results and shares to insert
        const results: Array<{
          reportId: string;
          reportName: string;
          athleteId: string;
          athleteName: string;
          status: 'sent' | 'already_sent' | 'skipped';
          reason?: string;
        }> = [];
        const sharesToInsert: Array<{
          reportId: string;
          athleteId: string;
          sharedBy: string;
          organizationId: string;
          message: string | null;
        }> = [];

        for (const [reportId, reportInfo] of reportAthleteMap) {
          const athlete = athleteMap.get(reportInfo.athleteId);
          const athleteName = athlete
            ? athlete.fullName || `${athlete.firstName} ${athlete.lastName}`
            : 'Unknown Athlete';

          // Check if already shared
          if (existingShareSet.has(`${reportId}:${reportInfo.athleteId}`)) {
            results.push({
              reportId,
              reportName: reportInfo.reportName,
              athleteId: reportInfo.athleteId,
              athleteName,
              status: 'already_sent',
            });
            continue;
          }

          // Verify athlete exists
          if (!athlete) {
            results.push({
              reportId,
              reportName: reportInfo.reportName,
              athleteId: reportInfo.athleteId,
              athleteName,
              status: 'skipped',
              reason: 'Athlete not found',
            });
            continue;
          }

          // Add to batch insert
          sharesToInsert.push({
            reportId,
            athleteId: reportInfo.athleteId,
            sharedBy: user.id,
            organizationId: reportInfo.organizationId,
            message: message || null,
          });
        }

        // Insert all shares in a single transaction
        let sent = 0;
        if (sharesToInsert.length > 0) {
          try {
            await db.transaction(async (tx) => {
              await tx.insert(reportShares).values(sharesToInsert);
            });

            // Mark all as sent in results
            for (const share of sharesToInsert) {
              const reportInfo = reportAthleteMap.get(share.reportId);
              const athlete = athleteMap.get(share.athleteId);
              const athleteName = athlete
                ? athlete.fullName || `${athlete.firstName} ${athlete.lastName}`
                : 'Unknown Athlete';

              results.push({
                reportId: share.reportId,
                reportName: reportInfo?.reportName || 'Unknown Report',
                athleteId: share.athleteId,
                athleteName,
                status: 'sent',
              });
              sent++;
            }

            // Send notifications asynchronously (fire and forget)
            // OPTIMIZATION: Batch query all organization names and notification preferences upfront
            const coach = await db
              .select({ fullName: users.fullName })
              .from(users)
              .where(eq(users.id, user.id))
              .limit(1)
              .then((rows) => rows[0]);

            // Batch query organization names
            const uniqueOrgIds = [...new Set(sharesToInsert.map(s => s.organizationId))];
            const orgRecords = await db
              .select({ id: organizations.id, name: organizations.name })
              .from(organizations)
              .where(inArray(organizations.id, uniqueOrgIds));
            const orgNameMap = new Map(orgRecords.map(o => [o.id, o.name]));

            // Batch query notification preferences
            const uniqueAthleteIds = [...new Set(sharesToInsert.map(s => s.athleteId))];
            const prefsRecords = await db
              .select()
              .from(notificationPreferences)
              .where(inArray(notificationPreferences.userId, uniqueAthleteIds));
            const prefsMap = new Map(prefsRecords.map(p => [p.userId, p]));

            const appUrl = process.env.APP_URL || 'https://athletemetrics.app';

            Promise.all(
              sharesToInsert.map(async (share) => {
                try {
                  const athlete = athleteMap.get(share.athleteId);
                  if (!athlete) return;

                  const reportInfo = reportAthleteMap.get(share.reportId);
                  if (!reportInfo) return;

                  const organizationName = orgNameMap.get(share.organizationId) || 'Your organization';
                  const prefs = prefsMap.get(share.athleteId);

                  const pushEnabled = prefs?.pushEnabled ?? true;
                  const emailEnabled = prefs?.emailEnabled ?? true;
                  const pushReportShared = prefs?.pushReportShared ?? true;
                  const emailReportShared = prefs?.emailReportShared ?? true;

                  // Send email notification
                  if (emailEnabled && emailReportShared && athlete.emails && athlete.emails.length > 0) {
                    try {
                      await emailService.sendReportSharedNotification(athlete.emails[0], {
                        athleteName: athlete.fullName || `${athlete.firstName} ${athlete.lastName}`,
                        coachName: coach?.fullName || 'Your coach',
                        organizationName,
                        reportName: reportInfo.reportName,
                        message: share.message || undefined,
                        viewUrl: `${appUrl}/my-reports`,
                      });
                    } catch (emailError) {
                      console.error(
                        `Failed to send email notification - Coach: ${user.id}, Athlete: ${athlete.emails[0]}, Report: ${share.reportId}, Org: ${share.organizationId}`,
                        emailError
                      );
                    }
                  }

                  // Send push notification
                  if (pushEnabled && pushReportShared) {
                    try {
                      const pushService = getPushNotificationService(db);
                      const notificationPayload: NotificationPayload = {
                        type: 'report_shared',
                        title: 'New Performance Report',
                        body: `${coach?.fullName || 'Your coach'} shared "${reportInfo.reportName}" with you`,
                        url: '/my-reports',
                        data: {
                          reportId: share.reportId,
                        },
                      };
                      await pushService.sendToUser(share.athleteId, notificationPayload, share.organizationId);
                    } catch (pushError) {
                      console.error(
                        `Failed to send push notification - Coach: ${user.id}, Athlete: ${share.athleteId}, Report: ${share.reportId}, Org: ${share.organizationId}`,
                        pushError
                      );
                    }
                  }
                } catch (notificationError) {
                  console.error(
                    `Failed to send notifications - Coach: ${user.id}, Athlete: ${share.athleteId}, Report: ${share.reportId}, Org: ${share.organizationId}`,
                    notificationError
                  );
                }
              })
            ).catch((err) => {
              console.error('Error in bulk distribute notification sending:', err);
            });
          } catch (insertError: any) {
            // Log detailed error server-side for debugging
            console.error('Failed to bulk insert shares for distribute:', insertError);
            // If transaction fails, mark all pending as failed with generic message
            // (avoid exposing internal error details to client)
            for (const share of sharesToInsert) {
              const reportInfo = reportAthleteMap.get(share.reportId);
              const athlete = athleteMap.get(share.athleteId);
              const athleteName = athlete
                ? athlete.fullName || `${athlete.firstName} ${athlete.lastName}`
                : 'Unknown Athlete';

              results.push({
                reportId: share.reportId,
                reportName: reportInfo?.reportName || 'Unknown Report',
                athleteId: share.athleteId,
                athleteName,
                status: 'skipped',
                reason: 'Failed to share report',
              });
            }
          }
        }

        // Calculate summary
        const alreadySent = results.filter((r) => r.status === 'already_sent').length;
        const skipped = results.filter((r) => r.status === 'skipped').length + skippedReports.length;

        res.status(200).json({
          summary: {
            sent,
            alreadySent,
            skipped,
          },
          results,
          skippedReports,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Validation error",
            errors: error.errors,
          });
        }
        console.error("Error bulk distributing reports:", error);
        res.status(500).json({ message: "Failed to bulk distribute reports" });
      }
    }
  );

  // Zod schema for bulk report operations
  const bulkReportIdsSchema = z.object({
    reportIds: z.array(z.string().uuid()).min(1, "At least one report ID is required").max(100, "Cannot process more than 100 reports at once"),
  });

  /**
   * Bulk archive multiple reports
   * POST /api/reports/bulk-archive
   *
   * @description
   * Archives multiple reports by setting their archivedAt timestamp.
   * Archived reports are hidden from default views but can be restored.
   * Returns 200 with count:0 if no reports match (not 404).
   *
   * @security
   * - Rate limited: 15 requests per 15 minutes (bulkOperationLimiter)
   * - Authentication: requireAuth
   * - Authorization: requireRole('coach')
   * - Organization access: Validates coach has access to all reports' organizations
   *
   * @input
   * - reportIds (body): Array of report UUIDs to archive
   *
   * @returns
   * {
   *   message: string,
   *   archived: number,
   *   archivedAt?: Date
   * }
   */
  app.post(
    "/api/reports/bulk-archive",
    bulkOperationLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        // Validate request body
        const validatedData = bulkReportIdsSchema.parse(req.body);
        const { reportIds } = validatedData;

        // Fetch all requested reports to validate access
        const targetReports = await db
          .select()
          .from(reports)
          .where(inArray(reports.id, reportIds));

        if (targetReports.length === 0) {
          return res.json({
            message: "No reports to archive",
            archived: 0
          });
        }

        // Get unique organization IDs to validate access
        const orgIds = [...new Set(targetReports.map((r) => r.organizationId))];

        // Validate user has access to all organizations
        for (const orgId of orgIds) {
          const hasAccess = await reportService["validateOrganizationAccess"](
            user.id,
            orgId
          );
          if (!hasAccess) {
            return res.status(403).json({
              message: "Access denied to one or more report organizations",
            });
          }
        }

        // Archive all reports in a transaction for consistency
        const archivedAt = new Date();
        await db.transaction(async (tx) => {
          await tx
            .update(reports)
            .set({ archivedAt })
            .where(inArray(reports.id, reportIds));
        });

        res.json({
          message: "Reports archived successfully",
          archived: targetReports.length,
          archivedAt,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Validation error",
            errors: error.errors,
          });
        }
        console.error("Error bulk archiving reports:", error);
        res.status(500).json({ message: "Failed to bulk archive reports" });
      }
    }
  );

  /**
   * Bulk unarchive multiple reports
   * POST /api/reports/bulk-unarchive
   *
   * @description
   * Restores multiple archived reports by clearing their archivedAt timestamp.
   * Unarchived reports return to default views.
   * Returns 200 with count:0 if no reports match (not 404).
   *
   * @security
   * - Rate limited: 15 requests per 15 minutes (bulkOperationLimiter)
   * - Authentication: requireAuth
   * - Authorization: requireRole('coach')
   * - Organization access: Validates coach has access to all reports' organizations
   *
   * @input
   * - reportIds (body): Array of report UUIDs to unarchive
   *
   * @returns
   * {
   *   message: string,
   *   unarchived: number
   * }
   */
  app.post(
    "/api/reports/bulk-unarchive",
    bulkOperationLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        // Validate request body
        const validatedData = bulkReportIdsSchema.parse(req.body);
        const { reportIds } = validatedData;

        // Fetch all requested reports to validate access
        const targetReports = await db
          .select()
          .from(reports)
          .where(inArray(reports.id, reportIds));

        if (targetReports.length === 0) {
          return res.json({
            message: "No reports to unarchive",
            unarchived: 0
          });
        }

        // Get unique organization IDs to validate access
        const orgIds = [...new Set(targetReports.map((r) => r.organizationId))];

        // Validate user has access to all organizations
        for (const orgId of orgIds) {
          const hasAccess = await reportService["validateOrganizationAccess"](
            user.id,
            orgId
          );
          if (!hasAccess) {
            return res.status(403).json({
              message: "Access denied to one or more report organizations",
            });
          }
        }

        // Unarchive all reports in a transaction for consistency
        await db.transaction(async (tx) => {
          await tx
            .update(reports)
            .set({ archivedAt: null })
            .where(inArray(reports.id, reportIds));
        });

        res.json({
          message: "Reports unarchived successfully",
          unarchived: targetReports.length,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Validation error",
            errors: error.errors,
          });
        }
        console.error("Error bulk unarchiving reports:", error);
        res.status(500).json({ message: "Failed to bulk unarchive reports" });
      }
    }
  );

  /**
   * Bulk delete multiple reports
   * POST /api/reports/bulk-delete
   */
  app.post(
    "/api/reports/bulk-delete",
    bulkOperationLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        // Validate request body
        const validatedData = bulkReportIdsSchema.parse(req.body);
        const { reportIds } = validatedData;

        // Fetch all requested reports to validate access
        const targetReports = await db
          .select()
          .from(reports)
          .where(inArray(reports.id, reportIds));

        if (targetReports.length === 0) {
          return res.status(404).json({ message: "No reports found" });
        }

        // Get unique organization IDs to validate access
        const orgIds = [...new Set(targetReports.map((r) => r.organizationId))];

        // Validate user has access to all organizations
        for (const orgId of orgIds) {
          const hasAccess = await reportService["validateOrganizationAccess"](
            user.id,
            orgId
          );
          if (!hasAccess) {
            return res.status(403).json({
              message: "Access denied to one or more report organizations",
            });
          }
        }

        // Delete all reports (cascades to snapshots, benchmarks, and shares)
        await db.delete(reports).where(inArray(reports.id, reportIds));

        res.json({
          message: "Reports deleted successfully",
          deleted: targetReports.length,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Validation error",
            errors: error.errors,
          });
        }
        console.error("Error bulk deleting reports:", error);
        res.status(500).json({ message: "Failed to bulk delete reports" });
      }
    }
  );

  /**
   * Get reports shared with the authenticated athlete
   * GET /api/my/reports
   */
  app.get("/api/my/reports", reportLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get all shares for this athlete with joined report and coach info
      // Filter out dismissed reports (dismissedAt IS NULL)
      const shares = await db
        .select({
          shareId: reportShares.id,
          reportId: reportShares.reportId,
          reportName: reports.name,
          reportType: reports.reportType,
          sharedById: reportShares.sharedBy,
          sharedByFirstName: users.firstName,
          sharedByLastName: users.lastName,
          sharedByFullName: users.fullName,
          message: reportShares.message,
          createdAt: reportShares.createdAt,
          viewedAt: reportShares.viewedAt,
        })
        .from(reportShares)
        .innerJoin(reports, eq(reportShares.reportId, reports.id))
        .leftJoin(users, eq(reportShares.sharedBy, users.id))
        .where(
          and(
            eq(reportShares.athleteId, user.id),
            isNull(reportShares.dismissedAt)
          )
        )
        .orderBy(desc(reportShares.createdAt));

      // Format response
      const formattedReports = shares.map((share) => ({
        shareId: share.shareId,
        reportId: share.reportId,
        reportName: share.reportName,
        reportType: share.reportType as 'team' | 'individual',
        sharedBy: share.sharedById
          ? {
              id: share.sharedById,
              firstName: share.sharedByFirstName || '',
              lastName: share.sharedByLastName || '',
            }
          : null,
        message: share.message,
        createdAt: share.createdAt.toISOString(),
        viewedAt: share.viewedAt ? share.viewedAt.toISOString() : null,
        isNew: share.viewedAt === null,
      }));

      res.json({ reports: formattedReports });
    } catch (error) {
      console.error("Error fetching shared reports:", error);
      res.status(500).json({ message: "Failed to fetch shared reports" });
    }
  });

  /**
   * Get unread report count for badge display
   * GET /api/my/reports/unread-count
   */
  app.get(
    "/api/my/reports/unread-count",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        // Count unread reports using efficient query
        // Only count non-dismissed reports
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(reportShares)
          .where(
            and(
              eq(reportShares.athleteId, user.id),
              isNull(reportShares.viewedAt),
              isNull(reportShares.dismissedAt)
            )
          );

        const unreadCount = Number(result[0]?.count || 0);

        res.json({ unreadCount });
      } catch (error) {
        console.error("Error fetching unread report count:", error);
        res.status(500).json({ message: "Failed to fetch unread count" });
      }
    }
  );

  /**
   * Get a single shared report by share ID
   * GET /api/my/reports/:shareId
   */
  app.get(
    "/api/my/reports/:shareId",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const shareId = req.params.shareId;

        // Validate shareId is a valid UUID
        const uuidSchema = z.string().uuid();
        const parseResult = uuidSchema.safeParse(shareId);
        if (!parseResult.success) {
          return res.status(400).json({ message: "Invalid share ID format" });
        }

        // Get share with report and coach info
        const [share] = await db
          .select({
            shareId: reportShares.id,
            reportId: reportShares.reportId,
            reportName: reports.name,
            reportType: reports.reportType,
            reportConfig: reports.config,
            reportDescription: reports.description,
            reportCoachingInsights: reports.coachingInsights,
            reportCreatedBy: reports.createdBy,
            sharedById: reportShares.sharedBy,
            sharedByFirstName: users.firstName,
            sharedByLastName: users.lastName,
            sharedByFullName: users.fullName,
            message: reportShares.message,
            createdAt: reportShares.createdAt,
            viewedAt: reportShares.viewedAt,
            organizationId: reportShares.organizationId,
          })
          .from(reportShares)
          .innerJoin(reports, eq(reportShares.reportId, reports.id))
          .leftJoin(users, eq(reportShares.sharedBy, users.id))
          .where(
            and(
              eq(reportShares.id, shareId),
              eq(reportShares.athleteId, user.id)
            )
          );

        if (!share) {
          return res.status(404).json({ message: "Shared report not found" });
        }

        // Format response with nested report object (matches Report interface)
        const response = {
          shareId: share.shareId,
          report: {
            id: share.reportId,
            organizationId: share.organizationId,
            createdBy: share.reportCreatedBy,
            name: share.reportName,
            description: share.reportDescription,
            reportType: share.reportType as 'team' | 'individual',
            config: share.reportConfig,
            coachingInsights: share.reportCoachingInsights,
            // These fields are required by IndividualReportView/TeamReportView
            isTemplate: false,
            isPinned: false,
            createdAt: share.createdAt.toISOString(),
          },
          sharedBy: share.sharedById
            ? {
                id: share.sharedById,
                firstName: share.sharedByFirstName || '',
                lastName: share.sharedByLastName || '',
              }
            : null,
          message: share.message,
          createdAt: share.createdAt.toISOString(),
          viewedAt: share.viewedAt ? share.viewedAt.toISOString() : null,
          isNew: share.viewedAt === null,
        };

        res.json(response);
      } catch (error) {
        console.error("Error fetching shared report:", error);
        res.status(500).json({ message: "Failed to fetch shared report" });
      }
    }
  );

  /**
   * Mark a shared report as viewed
   * POST /api/my/reports/:shareId/viewed
   */
  app.post(
    "/api/my/reports/:shareId/viewed",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const shareId = req.params.shareId;

        // Validate shareId is a valid UUID
        const uuidSchema = z.string().uuid();
        const parseResult = uuidSchema.safeParse(shareId);
        if (!parseResult.success) {
          return res.status(400).json({ message: "Invalid share ID format" });
        }

        // Get share
        const [share] = await db
          .select()
          .from(reportShares)
          .where(eq(reportShares.id, shareId))
          .limit(1);

        if (!share) {
          return res.status(404).json({ message: "Share not found" });
        }

        // Verify this share belongs to the authenticated user
        if (share.athleteId !== user.id) {
          return res.status(403).json({
            message: "You can only mark your own reports as viewed",
          });
        }

        // If already viewed, return existing timestamp (idempotent)
        if (share.viewedAt) {
          return res.json({
            success: true,
            viewedAt: share.viewedAt.toISOString(),
          });
        }

        // Mark as viewed
        const viewedAt = new Date();
        await db
          .update(reportShares)
          .set({ viewedAt })
          .where(eq(reportShares.id, shareId));

        res.json({
          success: true,
          viewedAt: viewedAt.toISOString(),
        });
      } catch (error) {
        console.error("Error marking report as viewed:", error);
        res.status(500).json({ message: "Failed to mark report as viewed" });
      }
    }
  );

  /**
   * Dismiss a shared report (athlete soft-hide)
   * DELETE /api/my/reports/:shareId
   *
   * This removes the report from the athlete's view without affecting
   * the coach's ability to see the share or the original report.
   */
  app.delete(
    "/api/my/reports/:shareId",
    reportLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const shareId = req.params.shareId;

        // Validate shareId is a valid UUID
        const uuidSchema = z.string().uuid();
        const parseResult = uuidSchema.safeParse(shareId);
        if (!parseResult.success) {
          return res.status(400).json({ message: "Invalid share ID format" });
        }

        // Get share
        const [share] = await db
          .select()
          .from(reportShares)
          .where(eq(reportShares.id, shareId))
          .limit(1);

        if (!share) {
          return res.status(404).json({ message: "Share not found" });
        }

        // Verify this share belongs to the authenticated user
        if (share.athleteId !== user.id) {
          return res.status(403).json({
            message: "You can only dismiss your own reports",
          });
        }

        // Dismiss the report (soft-hide)
        const dismissedAt = new Date();
        await db
          .update(reportShares)
          .set({ dismissedAt })
          .where(eq(reportShares.id, shareId));

        res.json({
          success: true,
          message: "Report dismissed successfully",
          dismissedAt: dismissedAt.toISOString(),
        });
      } catch (error) {
        console.error("Error dismissing report:", error);
        res.status(500).json({ message: "Failed to dismiss report" });
      }
    }
  );

  /**
   * Unshare a report from an athlete
   * DELETE /api/reports/:id/shares/:shareId
   */
  app.delete(
    "/api/reports/:id/shares/:shareId",
    reportLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;
        const shareId = req.params.shareId;

        // Validate IDs are valid UUIDs
        const uuidSchema = z.string().uuid();
        const reportIdResult = uuidSchema.safeParse(reportId);
        const shareIdResult = uuidSchema.safeParse(shareId);
        if (!reportIdResult.success || !shareIdResult.success) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        // Get share
        const [share] = await db
          .select()
          .from(reportShares)
          .where(
            and(
              eq(reportShares.id, shareId),
              eq(reportShares.reportId, reportId)
            )
          )
          .limit(1);

        if (!share) {
          return res.status(404).json({ message: "Share not found" });
        }

        // Check permissions: must be coach who shared it or org_admin
        const userRoles = await storage.getUserRoles(user.id, share.organizationId);

        const canUnshare =
          share.sharedBy === user.id || // Coach who created the share
          userRoles.includes('org_admin') || // Org admin
          isSiteAdmin(user); // Site admin

        if (!canUnshare) {
          return res.status(403).json({
            message: "You don't have permission to unshare this report",
          });
        }

        // Delete share
        await db.delete(reportShares).where(eq(reportShares.id, shareId));

        res.json({ success: true });
      } catch (error) {
        console.error("Error unsharing report:", error);
        res.status(500).json({ message: "Failed to unshare report" });
      }
    }
  );

  /**
   * Get list of who a report has been shared with
   * GET /api/reports/:id/shares
   */
  app.get(
    "/api/reports/:id/shares",
    reportLimiter,
    requireAuth,
    requireRole('coach'),
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;

        // Get report
        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Validate organization access
        const hasAccess = await reportService["validateOrganizationAccess"](
          user.id,
          report.organizationId
        );
        if (!hasAccess) {
          return res
            .status(403)
            .json({ message: "Access denied to this report" });
        }

        // Get shares with athlete and sharedBy info
        const shares = await db
          .select({
            shareId: reportShares.id,
            athleteId: reportShares.athleteId,
            athleteFirstName: sql<string>`athlete_user.first_name`,
            athleteLastName: sql<string>`athlete_user.last_name`,
            athleteFullName: sql<string>`athlete_user.full_name`,
            sharedById: reportShares.sharedBy,
            sharedByFirstName: sql<string>`coach_user.first_name`,
            sharedByLastName: sql<string>`coach_user.last_name`,
            sharedByFullName: sql<string>`coach_user.full_name`,
            message: reportShares.message,
            createdAt: reportShares.createdAt,
            viewedAt: reportShares.viewedAt,
          })
          .from(reportShares)
          .innerJoin(
            sql`users AS athlete_user`,
            sql`${reportShares.athleteId} = athlete_user.id`
          )
          .leftJoin(
            sql`users AS coach_user`,
            sql`${reportShares.sharedBy} = coach_user.id`
          )
          .where(eq(reportShares.reportId, reportId))
          .orderBy(desc(reportShares.createdAt));

        // Format response
        const formattedShares = shares.map((share: any) => ({
          shareId: share.shareId,
          athlete: {
            id: share.athleteId,
            firstName: share.athleteFirstName || '',
            lastName: share.athleteLastName || '',
          },
          sharedBy: share.sharedById
            ? {
                id: share.sharedById,
                firstName: share.sharedByFirstName || '',
                lastName: share.sharedByLastName || '',
              }
            : null,
          message: share.message,
          createdAt: share.createdAt.toISOString(),
          viewedAt: share.viewedAt ? share.viewedAt.toISOString() : null,
        }));

        res.json({ shares: formattedShares });
      } catch (error) {
        console.error("Error fetching report shares:", error);
        res.status(500).json({ message: "Failed to fetch report shares" });
      }
    }
  );
}

/**
 * Sanitize filename for safe PDF download
 * Prevents path traversal, null bytes, Unicode normalization attacks, and other security issues
 */
/** Fetch organization record for PDF branding */
async function fetchOrgForBranding(organizationId: string | undefined | null) {
  if (!organizationId) return undefined;
  return db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1).then((rows) => rows[0]);
}

function sanitizeFilename(filename: string): string {
  return filename
    .normalize('NFKD') // Unicode normalization to prevent homograph attacks
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
    .replace(/[\u202A-\u202E]/g, '') // Remove bidirectional text overrides (RTL attacks)
    .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_') // Remove dangerous characters
    .replace(/^\.+/, '_') // Prevent hidden files
    .replace(/\.+$/, '') // Remove trailing dots (Windows security issue)
    .substring(0, 200) // Limit length to prevent issues
    .trim() || 'report'; // Fallback for empty names
}

/**
 * Add footer to all pages in the PDF
 */
function addFooterToAllPages(doc: jsPDF, orgName?: string, startPage = 1): void {
  const pageCount = doc.getNumberOfPages();

  for (let i = startPage; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);

    const pageWidth = doc.internal.pageSize.getWidth();

    // Left-aligned: org branding or default
    const footerText = orgName
      ? `${orgName} | Powered by AthleteMetrics`
      : 'athletemetrics.io';
    doc.text(footerText, 14, 287);

    // Right-aligned: page numbers
    const pageText = `Page ${i} of ${pageCount}`;
    const pageTextWidth = doc.getTextWidth(pageText);
    doc.text(pageText, pageWidth - 14 - pageTextWidth, 287);
  }
}

/**
 * Generate PDF document from report data
 */
// Tier color name → RGB for PDF cell backgrounds (matched to Tailwind classes in TierBadge.tsx)
const TIER_COLOR_RGB: Record<string, [number, number, number]> = {
  gold:    [245, 158, 11],
  emerald: [16, 185, 129],
  silver:  [148, 163, 184],
  blue:    [59, 130, 246],
  bronze:  [234, 88, 12],
  amber:   [217, 119, 6],
  slate:   [100, 116, 139],
  gray:    [107, 114, 128],
};

/** Create a light tint (blend with white at 25% opacity) for cell backgrounds */
function tierTint(colorName: string): [number, number, number] {
  const rgb = TIER_COLOR_RGB[colorName?.toLowerCase()] || TIER_COLOR_RGB.gray;
  return [
    Math.round(rgb[0] * 0.25 + 255 * 0.75),
    Math.round(rgb[1] * 0.25 + 255 * 0.75),
    Math.round(rgb[2] * 0.25 + 255 * 0.75),
  ] as [number, number, number];
}

/**
 * COPPA gate for public snapshot access, shared by the public snapshot-data
 * route and the public PDF-export routes so they cannot diverge.
 *
 * If the snapshot is flagged `publicAccessRestricted` (contains minor data from
 * a COPPA-enabled org), public-link access is only permitted for an
 * authenticated site_admin, a member of the report's org, or a parent of an
 * athlete in that org. Writes the access-blocked audit log and the 403 response
 * itself; returns `false` when the caller must stop, `true` when allowed.
 */
async function enforcePublicSnapshotAccess(
  req: express.Request,
  res: express.Response,
  snapshot: { reportId: string; publicAccessRestricted?: boolean | null },
): Promise<boolean> {
  if (!snapshot.publicAccessRestricted) return true;

  // Audit the blocked attempt regardless of whether the user is authenticated.
  coppaService.writeCoppaAudit({
    action: COPPA_ACTIONS.SNAPSHOT_ACCESS_BLOCKED,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    details: { token: req.params.token, authenticated: !!req.session?.user },
  }).catch((err) => {
    console.error('[COPPA] Failed to write snapshot access blocked audit log:', err);
  });

  const sessionUser = req.session?.user;
  if (!sessionUser) {
    res.status(403).json({
      code: 'minor_data_restricted',
      message: 'This report contains data for minor athletes and cannot be shared via public link.',
    });
    return false;
  }

  // Site admins may always access restricted snapshots.
  if (!sessionUser.isSiteAdmin) {
    const [reportRow] = await db
      .select({ organizationId: reports.organizationId })
      .from(reports)
      .where(eq(reports.id, snapshot.reportId))
      .limit(1);

    if (!reportRow) {
      res.status(403).json({
        code: 'minor_data_restricted',
        message: 'This report contains data for minor athletes. Access is restricted.',
      });
      return false;
    }

    const orgId = reportRow.organizationId;
    const userOrgs = await storage.getUserOrganizations(sessionUser.id);
    const isMember = userOrgs.some((o) => o.organizationId === orgId);

    if (!isMember) {
      // Allow an authenticated parent of an athlete in this org.
      const [parentLink] = await db
        .select({ id: parentAthleteLinks.id })
        .from(parentAthleteLinks)
        .innerJoin(userOrganizations, eq(userOrganizations.userId, parentAthleteLinks.athleteUserId))
        .where(and(
          eq(parentAthleteLinks.parentUserId, sessionUser.id),
          eq(parentAthleteLinks.isActive, true),
          eq(userOrganizations.organizationId, orgId),
        ))
        .limit(1);

      if (!parentLink) {
        res.status(403).json({
          code: 'minor_data_restricted',
          message: 'This report contains data for minor athletes. Access is restricted to organization members.',
        });
        return false;
      }
    }
  }

  return true;
}

/**
 * Normalize the client-supplied chartImages payload into a safe array.
 * Destructuring defaults only guard `undefined`; a client sending `null`, a
 * string, or malformed items would otherwise reach jsPDF and throw a 500.
 * Coerce to [] and keep only well-formed PNG data-URL entries so a bad payload
 * degrades to "no charts" instead of crashing the export.
 */
function normalizeChartImages(raw: unknown): Array<{ metricCode: string; dataUrl: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (img): img is { metricCode: string; dataUrl: string } =>
      !!img &&
      typeof img.metricCode === 'string' &&
      typeof img.dataUrl === 'string' &&
      // addTrendChartsToPdf calls doc.addImage(dataUrl, 'PNG', …); require a PNG
      // data URL so a JPEG/WebP can't be silently mis-decoded as PNG.
      img.dataUrl.startsWith('data:image/png;base64,'),
  );
}

function addTrendChartsToPdf(
  doc: jsPDF,
  chartImages: Array<{ metricCode: string; dataUrl: string }>,
  metricLabels: Record<string, string> = {},
): void {
  if (!chartImages.length) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const imgWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - margin;
  const maxPerPage = 2; // flow ~2 charts per page for readability

  // Start the trends section on a fresh page, then flow charts down it.
  doc.addPage();
  let yPos = 20;
  let onPage = 0;

  for (const img of chartImages) {
    // Isolate each chart: a corrupt payload that passes the data:image/png;base64,
    // prefix check but has truncated bytes will throw inside getImageProperties or
    // addImage. Catching per-chart means one bad capture skips rather than aborting
    // the entire PDF with a 500.
    try {
      const props = doc.getImageProperties(img.dataUrl);
      const imgHeight = (props.height / props.width) * imgWidth;
      const blockHeight = 6 + imgHeight + 10; // label + image + gap

      // Break to a new page when the page is full (max per page) or the next
      // chart would overflow the bottom margin. Never break before the first
      // chart on a page, so an oversized chart still renders.
      if (onPage > 0 && (onPage >= maxPerPage || yPos + blockHeight > bottomLimit)) {
        doc.addPage();
        yPos = 20;
        onPage = 0;
      }

      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text(metricLabels[img.metricCode] || img.metricCode, margin, yPos);
      yPos += 6;
      doc.addImage(img.dataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
      onPage += 1;
    } catch (err) {
      console.error('[pdf] skipping corrupt chart for', img.metricCode, err);
    }
  }
}

async function generatePDF(report: any, reportData: any, format: 'visual' | 'simplified' = 'simplified', org?: ReportOrg, chartImages: Array<{ metricCode: string; dataUrl: string }> = []): Promise<jsPDF> {
  const doc = new jsPDF();
  const isVisual = format === 'visual';

  // Color schemes — use org branding colors if available
  const colors = {
    primary: (org?.brandPrimaryColor ? hexToRgb(org.brandPrimaryColor) : isVisual ? [41, 128, 185] : [70, 70, 70]) as [number, number, number],
    secondary: (org?.brandSecondaryColor ? hexToRgb(org.brandSecondaryColor) : isVisual ? [52, 152, 219] : [100, 100, 100]) as [number, number, number],
    accent: (isVisual ? [46, 204, 113] : [120, 120, 120]) as [number, number, number],
    text: [40, 40, 40] as [number, number, number],
  };

  const reportName = report.name || 'Performance Report';
  const pageWidth = doc.internal.pageSize.getWidth();

  // --- Cover page for individual reports ---
  if (reportData.reportType === 'individual') {
    const athlete = reportData.athlete;

    // Try to embed org logo if available
    let logoRendered = false;
    if (org?.brandLogoUrl) {
      const logoData = await fetchLogoBase64(org.brandLogoUrl);
      if (logoData) {
        doc.addImage(`data:${logoData.mimeType};base64,${logoData.base64}`, logoData.ext, (pageWidth - 60) / 2, 50, 60, 40);
        logoRendered = true;
      }
    }

    const coverY = logoRendered ? 110 : 80;

    if (org?.name) {
      doc.setFontSize(16);
      doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      const orgNameWidth = doc.getTextWidth(org.name);
      doc.text(org.name, (pageWidth - orgNameWidth) / 2, coverY);
    }

    doc.setFontSize(24);
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    const titleText = 'Performance Assessment Report';
    const titleWidth = doc.getTextWidth(titleText);
    doc.text(titleText, (pageWidth - titleWidth) / 2, coverY + 20);

    doc.setFontSize(20);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    const athleteName = athlete?.userName || 'Athlete';
    const nameWidth = doc.getTextWidth(athleteName);
    doc.text(athleteName, (pageWidth - nameWidth) / 2, coverY + 40);

    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    const dateStr = reportData.generatedAt ? new Date(reportData.generatedAt).toLocaleDateString() : '';
    const dateWidth = doc.getTextWidth(dateStr);
    doc.text(dateStr, (pageWidth - dateWidth) / 2, coverY + 55);

    if (org?.brandTagline) {
      doc.setFontSize(12);
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      const maxTaglineWidth = pageWidth - 28;
      const taglineLines = doc.splitTextToSize(org.brandTagline, maxTaglineWidth);
      let tagY = coverY + 70;
      for (const line of taglineLines) {
        const lineWidth = doc.getTextWidth(line);
        doc.text(line, (pageWidth - lineWidth) / 2, tagY);
        tagY += 6;
      }
    }

    doc.addPage();
  }

  // --- Header with optional logo and branding ---
  let headerY = 20;

  if (org?.brandLogoUrl && reportData.reportType === 'team') {
    const logoData = await fetchLogoBase64(org.brandLogoUrl);
    if (logoData) {
      doc.addImage(`data:${logoData.mimeType};base64,${logoData.base64}`, logoData.ext, 14, 10, 30, 20);
      doc.setFontSize(20);
      if (isVisual || org?.brandPrimaryColor) {
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      }
      doc.text(reportName, 50, 20);
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);

      if (org?.brandTagline) {
        doc.setFontSize(10);
        doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        const tagLines = doc.splitTextToSize(org.brandTagline, pageWidth - 64); // 50mm left + 14mm right margin
        let tagY = 27;
        for (const tl of tagLines) { doc.text(tl, 50, tagY); tagY += 5; }
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        headerY = tagY + 3;
      } else {
        headerY = 32;
      }
    } else {
      doc.setFontSize(20);
      if (isVisual || org?.brandPrimaryColor) {
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      }
      doc.text(reportName, 14, 20);
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    }
  } else {
    doc.setFontSize(20);
    if (isVisual || org?.brandPrimaryColor) {
      doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    }
    doc.text(reportName, 14, 20);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);

    if (org?.brandTagline && reportData.reportType === 'team') {
      doc.setFontSize(10);
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      const tagLines = doc.splitTextToSize(org.brandTagline, pageWidth - 28);
      let tagY = 27;
      for (const tl of tagLines) { doc.text(tl, 14, tagY); tagY += 5; }
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
      headerY = tagY + 3;
    }
  }

  // Add description
  if (report.description) {
    doc.setFontSize(12);
    doc.text(report.description, 14, headerY + 3);
    headerY += 10;
  }

  // Add generation timestamp
  doc.setFontSize(10);
  doc.text(
    `Generated: ${new Date(reportData.generatedAt).toLocaleString()}`,
    14,
    headerY + 3
  );

  let yPos = headerY + 13;

  if (reportData.reportType === 'team') {
    // TEAM REPORT SECTIONS

    // 1. Report Summary
    doc.setFontSize(16);
    if (isVisual) doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text("Report Summary", 14, yPos);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    yPos += 10;

    const summaryRows = [
      ["Athletes Tested", `${reportData.athleteCount || 0}`],
      ["Metrics", reportData.teamStatistics?.map((s: any) => s.metric).join(', ') || "N/A"],
    ];

    autoTable(doc, {
      startY: yPos,
      body: summaryRows,
      theme: isVisual ? "grid" : "plain",
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // 2. Performance Snapshot (Team Statistics)
    doc.setFontSize(16);
    if (isVisual) doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text("Performance Snapshot", 14, yPos);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    yPos += 10;

    if (reportData.teamStatistics && reportData.teamStatistics.length > 0) {
      const statsRows = reportData.teamStatistics.map((stat: any) => [
        stat.metric,
        stat.average !== null ? stat.average.toFixed(2) : "N/A",
        stat.median !== null ? stat.median.toFixed(2) : "N/A",
        stat.min !== null ? stat.min.toFixed(2) : "N/A",
        stat.max !== null ? stat.max.toFixed(2) : "N/A",
        stat.topPerformer?.userName || "N/A",
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Metric", "Average", "Median", "Min", "Max", "Top Performer"]],
        body: statsRows,
        theme: isVisual ? "striped" : "grid",
        headStyles: { fillColor: colors.primary },
        styles: { fontSize: 9 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // 3. Benchmark Achievement Summary
    if (reportData.athleteRankings && reportData.athleteRankings.length > 0) {
      const benchmarkAchievements = calculateBenchmarkAchievements(
        reportData.athleteRankings,
        reportData.teamStatistics
      );

      if (benchmarkAchievements.length > 0) {
        doc.setFontSize(16);
        if (isVisual) doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.text("Benchmark Achievement Summary", 14, yPos);
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        yPos += 10;

        const benchmarkRows = benchmarkAchievements.map((achievement: any) => [
          achievement.metric,
          achievement.benchmarkName,
          `${achievement.benchmarkValue.toFixed(2)} ${achievement.units}`,
          achievement.count.toString(),
          `${achievement.percentage.toFixed(0)}%`,
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["Metric", "Benchmark", "Value", "Athletes", "Percentage"]],
          body: benchmarkRows,
          theme: isVisual ? "striped" : "grid",
          headStyles: { fillColor: colors.secondary },
          styles: { fontSize: 9 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // 3b. Tier Distribution Summary
      const tierDistributions = calculateTierDistributions(reportData.athleteRankings);
      if (tierDistributions.length > 0) {
        if (yPos > 230) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        if (isVisual) doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        doc.text("Tier Distribution", 14, yPos);
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        yPos += 8;

        for (const dist of tierDistributions) {
          if (yPos > 250) {
            doc.addPage();
            yPos = 20;
          }

          const tierNames = dist.tiers.map(t => t.tierName);
          const tierColors = dist.tiers.map(t => t.tierColor);
          const tierCounts = dist.tiers.map(t => t.count.toString());
          const metricLabel = reportData.metricLabels?.[dist.metricCode] || dist.metricCode;

          autoTable(doc, {
            startY: yPos,
            head: [["Metric", "Tier Group", ...tierNames]],
            body: [[metricLabel, dist.tierGroupName, ...tierCounts]],
            theme: isVisual ? "striped" : "grid",
            headStyles: { fillColor: colors.secondary },
            styles: { fontSize: 9 },
            didParseCell: (data: any) => {
              // Color tier name header cells with their tier color tint
              if (data.section === 'head' && data.column.index >= 2) {
                const tierIdx = data.column.index - 2;
                if (tierIdx < tierColors.length) {
                  data.cell.styles.fillColor = tierTint(tierColors[tierIdx]);
                  data.cell.styles.textColor = [40, 40, 40];
                  data.cell.styles.fontStyle = 'bold';
                }
              }
              // Color tier count body cells with matching tint
              if (data.section === 'body' && data.column.index >= 2) {
                const tierIdx = data.column.index - 2;
                if (tierIdx < tierColors.length) {
                  data.cell.styles.fillColor = tierTint(tierColors[tierIdx]);
                }
              }
            },
          });

          yPos = (doc as any).lastAutoTable.finalY + 8;
        }

        yPos += 7;
      }
    }

    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // 4. Individual Performance by Metric
    if (reportData.teamStatistics && reportData.teamStatistics.length > 0 &&
        reportData.athleteRankings && reportData.athleteRankings.length > 0) {

      doc.setFontSize(16);
      if (isVisual) doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.text("Individual Performance by Metric", 14, yPos);
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
      yPos += 10;

      for (const stat of reportData.teamStatistics) {
        // Check if we need a new page for each metric
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        if (isVisual) doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
        doc.text(stat.metric, 14, yPos);
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        yPos += 6;

        // Sort athletes by this metric
        const sortedAthletes = await sortAthletesByMetric(reportData.athleteRankings, stat.metric);
        const totalAthletes = sortedAthletes.length;
        const displayedAthletes = sortedAthletes.slice(0, PDF_LIMITS.MAX_ATHLETES_PER_METRIC);

        if (displayedAthletes.length > 0) {
          // Collect tier color for each row's benchmark column
          const rowTierColors: (string | null)[] = [];
          const metricRows = displayedAthletes.map((athlete: any, idx: number) => {
            const value = athlete.measurements[stat.metric];
            const percentile = athlete.percentiles?.[stat.metric];
            const benchmarkLabel = getBenchmarkLabel(athlete, stat.metric);

            // Check if this athlete has a tier benchmark for coloring
            const comps = athlete.benchmarkComparisons?.[stat.metric];
            const tierComp = comps?.find((c: any) => c.tierName);
            rowTierColors.push(tierComp?.tierColor || null);

            return [
              (idx + 1).toString(),
              athlete.userName,
              value !== null && value !== undefined ? `${value.toFixed(2)} ${stat.units || ''}` : "N/A",
              percentile !== undefined ? `${percentile.toFixed(0)}th` : "N/A",
              benchmarkLabel || "-",
            ];
          });

          autoTable(doc, {
            startY: yPos,
            head: [["Rank", "Athlete", "Value", "Percentile", "Benchmarks Met"]],
            body: metricRows,
            theme: isVisual ? "striped" : "grid",
            headStyles: { fillColor: colors.accent, fontSize: 9 },
            styles: { fontSize: 8 },
            margin: { left: 14 },
            didParseCell: (data: any) => {
              if (data.section !== 'body') return;
              // Color the "Benchmarks Met" column (index 4 — matches head: [Rank, Athlete, Value, Percentile, Benchmarks Met])
              if (data.column.index === 4 && data.row.index < rowTierColors.length) {
                const colorName = rowTierColors[data.row.index];
                if (colorName) {
                  data.cell.styles.fillColor = tierTint(colorName);
                  data.cell.styles.fontStyle = 'bold';
                }
              }
            },
          });

          yPos = (doc as any).lastAutoTable.finalY + 5;

          // Add truncation notice if more athletes than limit
          if (totalAthletes > PDF_LIMITS.MAX_ATHLETES_PER_METRIC) {
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Showing top ${PDF_LIMITS.MAX_ATHLETES_PER_METRIC} of ${totalAthletes} athletes`, 14, yPos);
            doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
            yPos += 5;
          }

          yPos += 5; // Add spacing before next metric
        }
      }
    }

    // 5. Composite Index Rankings (ONLY if enabled)
    const hasCompositeIndex = reportData.athleteRankings &&
                               reportData.athleteRankings.length > 0 &&
                               reportData.athleteRankings.some((a: any) => a.compositeIndex !== undefined);

    if (hasCompositeIndex) {
      // Check if we need a new page
      if (yPos > PDF_LIMITS.PAGE_BREAK_THRESHOLD) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(16);
      if (isVisual) doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.text("Composite Index Rankings", 14, yPos);
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
      yPos += 10;

      const rankingRows = (reportData.athleteRankings || [])
        .filter((athlete: any) => athlete.compositeIndex !== undefined && athlete.compositeIndex !== null)
        .sort((a: any, b: any) => (b.compositeIndex || 0) - (a.compositeIndex || 0))
        .slice(0, PDF_LIMITS.MAX_COMPOSITE_RANKINGS)
        .map((athlete: any, index: number) => [
          (index + 1).toString(),
          athlete.userName,
          athlete.compositeIndex.toFixed(2),
        ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Rank", "Athlete", "Composite Score"]],
        body: rankingRows,
        theme: isVisual ? "striped" : "grid",
        headStyles: { fillColor: colors.primary },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }
  } else {
    // INDIVIDUAL REPORT
    const athlete = reportData.athlete;

    doc.setFontSize(14);
    doc.text(`Athlete: ${athlete.userName}`, 14, yPos);
    yPos += 7;

    // Add athlete demographics
    doc.setFontSize(10);
    if (athlete.age) {
      doc.text(`Age: ${athlete.age}`, 14, yPos);
      yPos += 5;
    }
    if (athlete.gender) {
      doc.text(`Gender: ${athlete.gender}`, 14, yPos);
      yPos += 5;
    }
    if (athlete.teams && athlete.teams.length > 0) {
      const teamLabel = athlete.teams.length > 1 ? 'Teams' : 'Team';
      doc.text(`${teamLabel}: ${athlete.teams.join(', ')}`, 14, yPos);
      yPos += 5;
    }

    yPos += 5; // Add spacing before measurements table

    if (athlete.measurements) {
      const measurementRows = Object.entries(athlete.measurements).map(
        ([metric, value]: [string, any]) => {
          const label = reportData.metricLabels?.[metric] || metric;
          const unit = reportData.metricUnits?.[metric] || '';
          const formatted = `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
          return [
            label,
            formatted,
            athlete.percentiles[metric]?.toFixed(1) || "N/A",
          ];
        }
      );

      autoTable(doc, {
        startY: yPos,
        head: [["Metric", "Value", "Percentile"]],
        body: measurementRows,
        theme: isVisual ? "striped" : "grid",
        headStyles: { fillColor: colors.primary },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Benchmark comparisons
    if (athlete.benchmarkComparisons) {
      const singleValueRows: any[] = [];
      // Tier data: keep metadata alongside cells for color styling
      const tierData: Array<{
        cells: string[];
        tierColor: string;
        tierOrder: number;
      }> = [];

      Object.entries(athlete.benchmarkComparisons).forEach(
        ([metric, comparisons]: [string, any]) => {
          const label = reportData.metricLabels?.[metric] || metric;
          const unit = reportData.metricUnits?.[metric] || '';
          comparisons.forEach((comp: any) => {
            if (comp.tierName) {
              // Tier benchmark: show tier name + distance to next
              let tierLabel = comp.tierName;
              if (comp.isBestTier) {
                tierLabel += ' [Best]';
              } else if (comp.distanceToNextTier != null && comp.nextTierName) {
                const dist = comp.distanceToNextTier < 1
                  ? comp.distanceToNextTier.toFixed(2)
                  : comp.distanceToNextTier.toFixed(1);
                tierLabel += ` (${dist}${unit ? ` ${unit}` : ''} to ${comp.nextTierName})`;
              }
              // Prefix with rank indicator
              const rankPrefix = comp.tierOrder ? `#${comp.tierOrder} ` : '';
              // Append per-tier coaching note when present (migration 0137).
              // Newline-separated so autoTable wraps it as secondary text below
              // the tier label.
              const tierCellText = comp.coachingNote
                ? `${rankPrefix}${tierLabel}\n${comp.coachingNote}`
                : `${rankPrefix}${tierLabel}`;
              tierData.push({
                cells: [
                  label,
                  comp.tierGroupName || comp.benchmarkName,
                  tierCellText,
                  `${comp.athleteValue.toFixed(2)}${unit ? ` ${unit}` : ''}`,
                ],
                tierColor: comp.tierColor || 'gray',
                tierOrder: comp.tierOrder || 99,
              });
            } else {
              // Single-value benchmark: existing format
              singleValueRows.push([
                label,
                comp.benchmarkName,
                `${comp.benchmarkValue.toFixed(2)}${unit ? ` ${unit}` : ''}`,
                `${comp.athleteValue.toFixed(2)}${unit ? ` ${unit}` : ''}`,
                comp.meetsOrExceeds ? "Yes" : "No",
              ]);
            }
          });
        }
      );

      // Render tier benchmarks table with color-coded tier cells
      if (tierData.length > 0) {
        doc.setFontSize(14);
        doc.text("Benchmark Tiers", 14, yPos);
        yPos += 10;

        autoTable(doc, {
          startY: yPos,
          head: [["Metric", "Tier Group", "Tier", "Actual"]],
          body: tierData.map(d => d.cells),
          theme: isVisual ? "striped" : "grid",
          headStyles: { fillColor: colors.primary },
          styles: { fontSize: 9 },
          didParseCell: (data: any) => {
            if (data.section !== 'body') return;
            const rowIdx = data.row.index;
            const colIdx = data.column.index;
            // Color the "Tier" column (index 2) with the tier's color tint
            if (colIdx === 2 && rowIdx < tierData.length) {
              const colorName = tierData[rowIdx].tierColor;
              data.cell.styles.fillColor = tierTint(colorName);
              data.cell.styles.fontStyle = 'bold';
            }
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Render single-value benchmarks table with green/red Meets Target
      if (singleValueRows.length > 0) {
        doc.setFontSize(14);
        doc.text("Benchmark Comparisons", 14, yPos);
        yPos += 10;

        autoTable(doc, {
          startY: yPos,
          head: [
            ["Metric", "Benchmark", "Target", "Actual", "Meets Target"],
          ],
          body: singleValueRows,
          theme: isVisual ? "striped" : "grid",
          headStyles: { fillColor: colors.primary },
          styles: { fontSize: 9 },
          didParseCell: (data: any) => {
            if (data.section !== 'body') return;
            // Color the "Meets Target" column (index 4 — matches head: [Metric, Benchmark, Target, Actual, Meets Target])
            if (data.column.index === 4) {
              const val = data.cell.raw;
              if (val === 'Yes') {
                data.cell.styles.fillColor = [34, 197, 94];  // green-500
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = 'bold';
              } else if (val === 'No') {
                data.cell.styles.fillColor = [239, 68, 68];  // red-500
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }
    }
  }

  // Tier Legend — show all tiers for each tier group referenced in this report
  if (reportData.reportType === 'individual' || reportData.reportType === 'team') {
    // Collect unique tier groups from benchmark comparisons
    const tierLegendGroups = new Map<string, {
      groupName: string;
      metricLabel: string;
      tiers: Array<{ tierName: string; tierColor: string; tierOrder: number; minValue: number | null; maxValue: number | null }>;
    }>();

    const athletes = reportData.reportType === 'individual'
      ? [reportData.athlete]
      : (reportData.athleteRankings || []);

    for (const ath of athletes) {
      if (!ath?.benchmarkComparisons) continue;
      for (const [metric, comparisons] of Object.entries(ath.benchmarkComparisons) as [string, any[]][]) {
        for (const comp of comparisons) {
          const legendKey = `${metric}:${comp.tierGroupName}`;
          if (comp.tierGroupName && comp.allTiers && !tierLegendGroups.has(legendKey)) {
            tierLegendGroups.set(legendKey, {
              groupName: comp.tierGroupName,
              metricLabel: reportData.metricLabels?.[metric] || metric,
              tiers: [...comp.allTiers].sort((a: any, b: any) => a.tierOrder - b.tierOrder),
            });
          }
        }
      }
    }

    if (tierLegendGroups.size > 0) {
      if (yPos > 230) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text("Benchmark Tier Reference", 14, yPos);
      yPos += 8;

      for (const group of tierLegendGroups.values()) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(10);
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        doc.text(`${group.groupName}`, 14, yPos);
        yPos += 6;

        const legendRows = group.tiers.map(t => {
          const range = (t.minValue != null && t.maxValue != null)
            ? `${t.minValue.toFixed(2)} - ${t.maxValue.toFixed(2)}`
            : '-';
          return [`#${t.tierOrder}`, t.tierName, range];
        });

        autoTable(doc, {
          startY: yPos,
          head: [["Rank", "Tier", "Range"]],
          body: legendRows,
          theme: "grid",
          headStyles: { fillColor: colors.secondary, fontSize: 8 },
          styles: { fontSize: 8 },
          margin: { left: 14, right: 100 },
          tableWidth: 100,
          didParseCell: (data: any) => {
            if (data.section !== 'body') return;
            if (data.row.index < group.tiers.length) {
              const colorName = group.tiers[data.row.index].tierColor;
              if (data.column.index === 1) {
                data.cell.styles.fillColor = tierTint(colorName);
                data.cell.styles.fontStyle = 'bold';
              }
            }
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      yPos += 5;
    }
  }

  // Add Coaching Insights section (if available)
  if (report.coachingInsights) {
    // Check if we need a new page
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(16);
    if (isVisual) doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text("Coaching Insights", 14, yPos);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    yPos += 10;

    // Render markdown with structure preserved (headers bold, bullets indented)
    const insightsPageWidth = doc.internal.pageSize.getWidth();
    const insightsContentWidth = insightsPageWidth - 28; // 14mm margins each side
    const lineHeight = 5;

    doc.setFontSize(8);
    const markdownLines = report.coachingInsights.split('\n');

    for (const rawLine of markdownLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        yPos += 3; // Blank line = paragraph spacing
        continue;
      }

      // Check for page break
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }

      // Headers (## Section Title)
      if (/^#{1,3}\s+/.test(trimmed)) {
        const headerText = trimmed.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '');
        yPos += 3; // Extra spacing before header
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.text(headerText, 14, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        doc.setFontSize(8);
        yPos += lineHeight + 1;
        continue;
      }

      // Bullet points (- or * or •)
      const bulletMatch = trimmed.match(/^[-*•]\s+(.*)/);
      if (bulletMatch) {
        const bulletText = bulletMatch[1].replace(/\*\*(.*?)\*\*/g, '$1');
        const bulletLines = doc.splitTextToSize(bulletText, insightsContentWidth - 8);
        for (let i = 0; i < bulletLines.length; i++) {
          if (yPos > 280) { doc.addPage(); yPos = 20; }
          if (i === 0) {
            doc.text('•', 16, yPos);
            doc.text(bulletLines[i], 22, yPos);
          } else {
            doc.text(bulletLines[i], 22, yPos); // Continuation indented
          }
          yPos += lineHeight;
        }
        continue;
      }

      // Regular paragraph text — strip bold markers and wrap
      const plainText = trimmed.replace(/\*\*(.*?)\*\*/g, '$1');
      const wrappedLines = doc.splitTextToSize(plainText, insightsContentWidth);
      for (const wLine of wrappedLines) {
        if (yPos > 280) { doc.addPage(); yPos = 20; }
        doc.text(wLine, 14, yPos);
        yPos += lineHeight;
      }
    }

    yPos += 5;

    // Add generation metadata
    if (report.coachingInsightsGeneratedAt) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      const generatedDate = new Date(report.coachingInsightsGeneratedAt).toLocaleString();
      const modelText = report.coachingInsightsModel ? ` (${report.coachingInsightsModel})` : '';
      doc.text(`Generated: ${generatedDate}${modelText}`, 14, yPos);
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
      yPos += 10;
    }
  }

  // --- Glossary of metrics (always last content section) ---
  const glossaryExplanations: Record<string, MetricExplanation> =
    reportData.metricExplanations ?? {};

  // Collect ordered metric codes for glossary rows
  const glossaryOrder: string[] = [];
  const pushCode = (code: unknown) => {
    if (typeof code === 'string' && code && !glossaryOrder.includes(code)) {
      glossaryOrder.push(code);
    }
  };
  if (reportData.reportType === 'team' && Array.isArray(reportData.teamStatistics)) {
    for (const stat of reportData.teamStatistics) pushCode(stat?.metric);
  } else if (reportData.reportType === 'individual' && reportData.athlete?.measurements) {
    for (const code of Object.keys(reportData.athlete.measurements)) pushCode(code);
  }
  // Fallback: include any explanation keys that weren't already ordered
  for (const code of Object.keys(glossaryExplanations)) pushCode(code);

  const glossaryRows = glossaryOrder
    .map((code) => {
      const entry = glossaryExplanations[code];
      if (!entry) return null;
      return [entry.title || code, entry.whatItMeasures || '', entry.whyItMatters || '', entry.unitNote || ''];
    })
    .filter((row): row is string[] => row !== null);

  if (glossaryRows.length > 0) {
    doc.addPage();
    doc.setFontSize(18);
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text('Glossary of Metrics', 14, 20);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);

    autoTable(doc, {
      startY: 28,
      head: [['Metric', 'What it measures', 'Why it matters', 'Unit & direction']],
      body: glossaryRows,
      theme: isVisual ? 'grid' : 'striped',
      headStyles: {
        fillColor: colors.primary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 32, fontStyle: 'bold' },
        1: { cellWidth: 60 },
        2: { cellWidth: 60 },
        3: { cellWidth: 30 },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // Append trend-chart pages BEFORE adding footers, so the pages those charts
  // create are included in the footer pass below.
  if (reportData.reportType === 'individual' && chartImages.length > 0) {
    addTrendChartsToPdf(doc, chartImages, reportData.metricLabels || {});
  }

  // Add footer to content pages — skip page 1 when a cover page was inserted
  const footerStartPage = reportData.reportType === 'individual' ? 2 : 1;
  addFooterToAllPages(doc, org?.name, footerStartPage);

  return doc;
}

/**
 * Helper function: Strip markdown formatting for plain text rendering in PDF
 */
function stripMarkdown(markdown: string): string {
  return markdown
    // Remove headers (# ## ###)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold (**text** or __text__)
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    // Remove italic (*text* or _text_)
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove strikethrough (~~text~~)
    .replace(/~~(.*?)~~/g, '$1')
    // Remove code blocks (```code```)
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code (`code`)
    .replace(/`([^`]+)`/g, '$1')
    // Remove links ([text](url))
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove images (![alt](url))
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
    // Remove blockquotes (> text)
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules (--- or ***)
    .replace(/^(-{3,}|\*{3,})$/gm, '')
    // Remove list markers (- or * or 1.)
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Helper function: Calculate benchmark achievements for PDF
 * Groups by metric + benchmark to show values for each metric
 */
function calculateBenchmarkAchievements(athleteRankings: any[], teamStatistics?: any[]) {
  if (!athleteRankings || athleteRankings.length === 0) {
    return [];
  }

  // Build a map of metric -> benchmark -> { value, units } from teamStatistics
  const benchmarkValuesMap = new Map<string, Map<string, { value: number; units: string }>>();
  if (teamStatistics) {
    teamStatistics.forEach((stat: any) => {
      if (stat.benchmarks && Array.isArray(stat.benchmarks)) {
        const metricBenchmarks = new Map<string, { value: number; units: string }>();
        stat.benchmarks.forEach((benchmark: any) => {
          metricBenchmarks.set(benchmark.name, {
            value: benchmark.value,
            units: stat.units || ''
          });
        });
        benchmarkValuesMap.set(stat.metric, metricBenchmarks);
      }
    });
  }

  // Track achievements by metric + benchmark
  const achievementMap = new Map<string, {
    metric: string;
    benchmarkName: string;
    benchmarkValue: number;
    units: string;
    count: number;
  }>();

  // Count how many athletes meet each metric-benchmark combination
  athleteRankings.forEach((athlete: any) => {
    if (athlete.benchmarkComparisons) {
      Object.entries(athlete.benchmarkComparisons).forEach(([metric, comparisons]: [string, any]) => {
        comparisons.forEach((comp: any) => {
          if (comp.meetsOrExceeds) {
            const key = `${metric}:${comp.benchmarkName}`;

            if (!achievementMap.has(key)) {
              // Get benchmark value from teamStatistics if available
              const metricBenchmarks = benchmarkValuesMap.get(metric);
              const benchmarkInfo = metricBenchmarks?.get(comp.benchmarkName);

              achievementMap.set(key, {
                metric,
                benchmarkName: comp.benchmarkName,
                benchmarkValue: benchmarkInfo?.value ?? comp.benchmarkValue,
                units: benchmarkInfo?.units ?? '',
                count: 0
              });
            }

            achievementMap.get(key)!.count++;
          }
        });
      });
    }
  });

  // Convert to array and calculate percentages
  const achievements = Array.from(achievementMap.values())
    .map((achievement) => ({
      ...achievement,
      percentage: (achievement.count / athleteRankings.length) * 100,
    }))
    .filter((achievement) => achievement.count > 0)
    // Sort by metric first, then by count descending
    .sort((a, b) => {
      if (a.metric !== b.metric) {
        return a.metric.localeCompare(b.metric);
      }
      return b.count - a.count;
    });

  return achievements;
}

/**
 * Build report data structure for AI insights generation
 *
 * Includes data size limits to prevent extremely large payloads:
 * - MAX_METRICS: 20 metrics maximum
 * - MAX_ATHLETES: 100 athletes maximum for team reports
 * - MAX_VALUES_PER_METRIC: 100 values per metric
 */
async function buildReportDataForAI(report: Report, userId: string, reportService: ReportService): Promise<import("../services/ai-insights-service").ReportData> {
  // Data size limits to prevent large AI payloads
  const MAX_METRICS = 20;
  const MAX_ATHLETES = 100;
  const MAX_VALUES_PER_METRIC = 100;

  try {
    // Fetch organization details
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, report.organizationId))
      .limit(1)
      .then((rows) => rows[0]);

    // Generate full report data using report service
    // Use unknown type then narrow based on report type
    let reportData: unknown;
    if (report.reportType === 'team') {
      reportData = await reportService.generateTeamReport(report.id, userId);
    } else {
      // For individual reports, we need the athlete ID from the report config
      const config = isIndividualReportConfig(report.config) ? report.config : null;
      const athleteId = config?.athleteId;

      if (!athleteId) {
        throw new Error("Individual report missing athlete ID in config");
      }

      reportData = await reportService.generateIndividualReport(
        report.id,
        userId,
        athleteId
      );
    }

    // Extract timeframe from report config
    // Use type guards to safely access config properties
    const reportConfig = isIndividualReportConfig(report.config) || isTeamReportConfig(report.config)
      ? report.config
      : null;
    let timeframe = "Current Season";
    if (reportConfig?.timeframe) {
      const { customStart: startDate, customEnd: endDate } = reportConfig.timeframe;
      if (startDate && endDate) {
        const start = new Date(startDate).toLocaleDateString();
        const end = new Date(endDate).toLocaleDateString();
        timeframe = `${start} to ${end}`;
      }
    }

    // Build metrics array from report data
    const metrics: Array<{
      code: string;
      label: string;
      values: number[];
      unit: string;
      lowerIsBetter: boolean;
      percentile?: number;
      teamAverage?: number;
    }> = [];

    // Cast reportData to typed object for accessing properties
    // The report service returns different structures for team vs individual reports
    const typedReportData = reportData as {
      teamStatistics?: Array<{ metric: string; units?: string }>;
      athleteRankings?: Array<{
        userId: string;
        userName: string;
        measurements?: Record<string, number>;
        benchmarkComparisons?: Record<string, Array<{ meetsOrExceeds: boolean }>>;
      }>;
      athleteCount?: number;
      teamIds?: string[];
      athlete?: {
        userId: string;
        userName?: string;
        fullName?: string;
        position?: string;
        age?: number;
        gender?: string;
        sports?: string[];
        measurements?: Record<string, number>;
        percentiles?: Record<string, number>;
        teamAverages?: Record<string, number>;
        benchmarkComparisons?: Record<string, Array<{ meetsOrExceeds: boolean }>>;
      };
      benchmarkComparisons?: Array<{
        metric: string;
        benchmarkName: string;
        benchmarkValue: number;
        meetsOrExceeds: boolean;
      }>;
      metricLabels?: Record<string, string>;
    };

    if (report.reportType === 'team' && typedReportData.teamStatistics) {
      // Limit athlete rankings to prevent large payloads
      const limitedAthleteRankings = typedReportData.athleteRankings
        ? typedReportData.athleteRankings.slice(0, MAX_ATHLETES)
        : [];

      // Team report metrics (limited to MAX_METRICS)
      const statsToProcess = typedReportData.teamStatistics.slice(0, MAX_METRICS);

      // Batch query metricType for all codes to avoid N+1 DB queries
      const teamMetricCodes = statsToProcess.map(s => s.metric);
      const teamMetricTypes = teamMetricCodes.length > 0
        ? await db
            .select({ code: siteMetrics.code, metricType: siteMetrics.metricType })
            .from(siteMetrics)
            .where(inArray(siteMetrics.code, teamMetricCodes))
        : [];
      const teamLowerIsBetterMap = new Map(teamMetricTypes.map(m => [m.code, m.metricType === 'lower_is_better']));

      for (const stat of statsToProcess) {
        const metricCode = stat.metric;
        const values: number[] = [];

        // Extract individual values from athlete rankings (limited)
        for (const athlete of limitedAthleteRankings) {
          if (athlete.measurements && athlete.measurements[metricCode] !== undefined) {
            values.push(athlete.measurements[metricCode]);
          }
        }

        // Limit values per metric
        const limitedValues = values.slice(0, MAX_VALUES_PER_METRIC);

        metrics.push({
          code: metricCode,
          label: typedReportData.metricLabels?.[metricCode] || metricCode, // Human-readable label
          values: limitedValues,
          unit: stat.units || "",
          lowerIsBetter: teamLowerIsBetterMap.get(metricCode) ?? false,
        });
      }
    } else if (report.reportType === 'individual' && typedReportData.athlete) {
      // Individual report metrics (limited to MAX_METRICS)
      const athlete = typedReportData.athlete;
      if (athlete.measurements) {
        const entries = Object.entries(athlete.measurements).slice(0, MAX_METRICS);

        // Batch query unit and metricType for all codes to avoid N+1 DB queries
        const individualMetricCodes = entries.filter(([, v]) => typeof v === 'number').map(([code]) => code);
        const individualMetricInfo = individualMetricCodes.length > 0
          ? await db
              .select({ code: siteMetrics.code, unit: siteMetrics.unit, metricType: siteMetrics.metricType })
              .from(siteMetrics)
              .where(inArray(siteMetrics.code, individualMetricCodes))
          : [];
        const individualUnitMap = new Map(individualMetricInfo.map(m => [m.code, m.unit || '']));
        const individualLowerIsBetterMap = new Map(individualMetricInfo.map(m => [m.code, m.metricType === 'lower_is_better']));

        for (const [metricCode, value] of entries) {
          if (typeof value === 'number') {
            metrics.push({
              code: metricCode,
              label: typedReportData.metricLabels?.[metricCode] || metricCode, // Human-readable label
              values: [value],
              unit: individualUnitMap.get(metricCode) || '',
              lowerIsBetter: individualLowerIsBetterMap.get(metricCode) ?? false,
              percentile: athlete.percentiles?.[metricCode],
              teamAverage: athlete.teamAverages?.[metricCode],
            });
          }
        }
      }
    }

    // Build improvements array (metrics that improved from previous)
    const improvements: Array<{ metric: string; improvement: string }> = [];
    // Note: Would need historical data to calculate improvements
    // For now, this is a placeholder for future enhancement

    // Build concerns array (metrics below expected performance)
    const concerns: Array<{ metric: string; concern: string }> = [];
    if (typedReportData.benchmarkComparisons) {
      // Identify metrics below benchmarks
      for (const comparison of typedReportData.benchmarkComparisons) {
        if (!comparison.meetsOrExceeds) {
          concerns.push({
            metric: comparison.metric,
            concern: `Below ${comparison.benchmarkName} benchmark (${comparison.benchmarkValue})`,
          });
        }
      }
    }

    // Build benchmark comparisons array
    const benchmarkComparisons: Array<{ metric: string; performance: string }> = [];
    if (report.reportType === 'team' && typedReportData.athleteRankings) {
      // Calculate team benchmark achievement rate
      const benchmarkStats = new Map<string, { total: number; met: number }>();

      for (const athlete of typedReportData.athleteRankings) {
        if (athlete.benchmarkComparisons) {
          for (const [metric, comparisons] of Object.entries(athlete.benchmarkComparisons)) {
            if (!benchmarkStats.has(metric)) {
              benchmarkStats.set(metric, { total: 0, met: 0 });
            }
            const stats = benchmarkStats.get(metric)!;
            for (const comp of comparisons) {
              stats.total++;
              if (comp.meetsOrExceeds) stats.met++;
            }
          }
        }
      }

      for (const [metric, stats] of benchmarkStats) {
        const percentage = Math.round((stats.met / stats.total) * 100);
        benchmarkComparisons.push({
          metric,
          performance: `${percentage}% of athletes meet benchmarks (${stats.met}/${stats.total})`,
        });
      }
    } else if (report.reportType === 'individual' && typedReportData.athlete?.benchmarkComparisons) {
      // Individual benchmark comparisons
      for (const [metric, comparisons] of Object.entries(typedReportData.athlete.benchmarkComparisons)) {
        const metComparisons = comparisons.filter(c => c.meetsOrExceeds);
        const totalComparisons = comparisons.length;
        benchmarkComparisons.push({
          metric,
          performance: `Meets ${metComparisons.length}/${totalComparisons} benchmarks`,
        });
      }
    }

    // Extract and validate audience from report config
    // athlete/parent audiences only apply to individual reports — team reports always use coach
    const VALID_AUDIENCES = ['coach', 'athlete', 'parent'] as const;
    const rawAudience = (reportConfig as any)?.audience;
    const audience = report.reportType === 'team'
      ? 'coach' as const
      : VALID_AUDIENCES.includes(rawAudience as typeof VALID_AUDIENCES[number])
        ? (rawAudience as typeof VALID_AUDIENCES[number])
        : undefined;

    // Build final ReportData object
    const aiReportData: import("../services/ai-insights-service").ReportData = {
      reportType: report.reportType as "individual" | "team",
      reportName: report.name,
      organizationName: org?.name || "Unknown Organization",
      organizationContext: org?.aiPromptContext || undefined,
      timeframe,
      metrics,
      improvements,
      concerns,
      benchmarkComparisons,
      audience,
    };

    // Add team-specific data
    if (report.reportType === 'team') {
      aiReportData.athleteCount = typedReportData.athleteCount || 0;

      // Fetch team info (name and sport) from the first team in teamIds
      if (typedReportData.teamIds && typedReportData.teamIds.length > 0) {
        const teamData = await db
          .select({
            name: teams.name,
            sport: teams.sport,
          })
          .from(teams)
          .where(eq(teams.id, typedReportData.teamIds[0]))
          .limit(1)
          .then((rows) => rows[0]);

        if (teamData) {
          aiReportData.teamName = teamData.name;
          aiReportData.teamSport = teamData.sport || undefined;
        }
      }
    }

    // Add individual-specific data
    if (report.reportType === 'individual' && typedReportData.athlete) {
      aiReportData.athleteName = typedReportData.athlete.userName || typedReportData.athlete.fullName;
      aiReportData.athletePosition = typedReportData.athlete.position;
      aiReportData.athleteAge = typedReportData.athlete.age;
      aiReportData.athleteGender = typedReportData.athlete.gender;
      // Extract sport from athlete.sports array (use first sport)
      aiReportData.athleteSport = typedReportData.athlete.sports?.[0] || undefined;
    }

    return aiReportData;
  } catch (error) {
    console.error("Error building report data for AI:", error);
    throw new Error(
      `Failed to prepare report data for AI analysis: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

