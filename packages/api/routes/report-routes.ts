/**
 * Report routes for coach and individual reports
 * Includes report CRUD, generation, snapshots, and PDF export
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { ReportService } from "../services/report-service";
import { requireAuth, requireAIEnabled, type AuthenticatedRequest } from "../middleware";
import { storage } from "../storage";
import {
  insertReportSchema,
  reports,
  reportSnapshots,
  reportBenchmarks,
  insertReportBenchmarkSchema,
  insertReportSnapshotSchema,
  users,
  organizations,
  teams,
  auditLogs,
  MAX_INSIGHTS_LENGTH,
  type Report,
} from "@shared/schema";
import { ZodError } from "zod";
import { db } from "../db";
import { eq, and, desc, asc, sql, inArray, type SQL } from "drizzle-orm";
import { isSiteAdmin } from "../utils/auth-helpers";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from "../utils/report-utils";

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

      res.json({
        reports: reportsList,
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

        // Generate PDF
        const pdf = await generatePDF(report, reportData, format as 'visual' | 'simplified');

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

        // Generate PDF from snapshot data
        const pdf = await generatePDF(report, snapshot.snapshotData, format as 'visual' | 'simplified');

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
   * Requires: AI enabled for organization (both flags)
   */
  app.post("/api/reports/:id/generate-insights", aiGenerationLimiter, requireAuth, requireAIEnabled, async (req: AuthenticatedRequest, res) => {
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
   * Requires: AI enabled for organization (both flags)
   */
  app.patch("/api/reports/:id/insights", reportLimiter, requireAuth, requireAIEnabled, async (req: AuthenticatedRequest, res) => {
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
}

/**
 * Sanitize filename for safe PDF download
 * Prevents path traversal, null bytes, Unicode normalization attacks, and other security issues
 */
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
function addFooterToAllPages(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128); // Gray color

    // Add footer text centered at bottom of page
    const pageWidth = doc.internal.pageSize.getWidth();
    const footerText = 'athletemetrics.io';
    const textWidth = doc.getTextWidth(footerText);
    const xPosition = (pageWidth - textWidth) / 2;

    doc.text(footerText, xPosition, 287); // 287 is near bottom of A4 page (297mm height)
  }
}

/**
 * Generate PDF document from report data
 */
async function generatePDF(report: any, reportData: any, format: 'visual' | 'simplified' = 'simplified'): Promise<jsPDF> {
  const doc = new jsPDF();
  const isVisual = format === 'visual';

  // Color schemes
  const colors = {
    primary: (isVisual ? [41, 128, 185] : [70, 70, 70]) as [number, number, number],
    secondary: (isVisual ? [52, 152, 219] : [100, 100, 100]) as [number, number, number],
    accent: (isVisual ? [46, 204, 113] : [120, 120, 120]) as [number, number, number],
    text: [40, 40, 40] as [number, number, number],
  };

  // Add title
  doc.setFontSize(20);
  if (isVisual) {
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  }
  doc.text(report.name, 14, 20);
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);

  // Add description
  if (report.description) {
    doc.setFontSize(12);
    doc.text(report.description, 14, 30);
  }

  // Add generation timestamp
  doc.setFontSize(10);
  doc.text(
    `Generated: ${new Date(reportData.generatedAt).toLocaleString()}`,
    14,
    40
  );

  let yPos = 50;

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
          const metricRows = displayedAthletes.map((athlete: any, idx: number) => {
            const value = athlete.measurements[stat.metric];
            const percentile = athlete.percentiles?.[stat.metric];
            const benchmarkLabel = getBenchmarkLabel(athlete, stat.metric);

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
        ([metric, value]: [string, any]) => [
          metric,
          value.toFixed(2),
          athlete.percentiles[metric]?.toFixed(1) || "N/A",
        ]
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
      const allBenchmarks: any[] = [];

      Object.entries(athlete.benchmarkComparisons).forEach(
        ([metric, comparisons]: [string, any]) => {
          comparisons.forEach((comp: any) => {
            allBenchmarks.push([
              metric,
              comp.benchmarkName,
              comp.benchmarkValue.toFixed(2),
              comp.athleteValue.toFixed(2),
              comp.meetsOrExceeds ? "Yes" : "No",
            ]);
          });
        }
      );

      if (allBenchmarks.length > 0) {
        doc.setFontSize(14);
        doc.text("Benchmark Comparisons", 14, yPos);
        yPos += 10;

        autoTable(doc, {
          startY: yPos,
          head: [
            ["Metric", "Benchmark", "Target", "Actual", "Meets Target"],
          ],
          body: allBenchmarks,
          theme: isVisual ? "striped" : "grid",
          headStyles: { fillColor: colors.primary },
        });
      }
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

    // Strip markdown formatting for PDF
    const plainTextInsights = stripMarkdown(report.coachingInsights);

    // Split insights into lines and add with text wrapping
    // Use same width as autoTable content area (page width minus left/right margins)
    // AutoTable default margins are typically 14mm on each side
    const pageWidth = doc.internal.pageSize.getWidth();
    const margins = { left: 14, right: 14 };
    const contentWidth = pageWidth - margins.left - margins.right;
    const lineHeight = 5;

    doc.setFontSize(10);
    const lines = doc.splitTextToSize(plainTextInsights, contentWidth);

    lines.forEach((line: string) => {
      // Check if we need a new page
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, 14, yPos);
      yPos += lineHeight;
    });

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

  // Add footer to all pages
  addFooterToAllPages(doc);

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
          lowerIsBetter: isMetricLowerBetter(metricCode),
        });
      }
    } else if (report.reportType === 'individual' && typedReportData.athlete) {
      // Individual report metrics (limited to MAX_METRICS)
      const athlete = typedReportData.athlete;
      if (athlete.measurements) {
        const entries = Object.entries(athlete.measurements).slice(0, MAX_METRICS);
        for (const [metricCode, value] of entries) {
          if (typeof value === 'number') {
            metrics.push({
              code: metricCode,
              label: typedReportData.metricLabels?.[metricCode] || metricCode, // Human-readable label
              values: [value],
              unit: getMetricUnit(metricCode),
              lowerIsBetter: isMetricLowerBetter(metricCode),
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

    // Build final ReportData object
    const aiReportData: import("../services/ai-insights-service").ReportData = {
      reportType: report.reportType as "individual" | "team",
      reportName: report.name,
      organizationName: org?.name || "Unknown Organization",
      timeframe,
      metrics,
      improvements,
      concerns,
      benchmarkComparisons,
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

/**
 * Helper: Determine if metric is lower-is-better
 */
function isMetricLowerBetter(metricCode: string): boolean {
  // Metrics where lower values indicate better performance
  const lowerIsBetterMetrics = [
    'FLY10_TIME',
    'AGILITY_505',
    'AGILITY_5105',
    'T_TEST',
    'DASH_40YD',
    '40_YARD_DASH',
    'SPRINT_TIME',
  ];

  return lowerIsBetterMetrics.some(m =>
    metricCode.toUpperCase().includes(m.toUpperCase())
  );
}

/**
 * Helper: Get unit for metric
 */
function getMetricUnit(metricCode: string): string {
  const upperCode = metricCode.toUpperCase();

  if (upperCode.includes('TIME') || upperCode.includes('DASH') || upperCode.includes('SPRINT')) {
    return 'seconds';
  }
  if (upperCode.includes('JUMP') || upperCode.includes('HEIGHT')) {
    return 'inches';
  }
  if (upperCode.includes('WEIGHT') || upperCode.includes('MASS')) {
    return 'lbs';
  }
  if (upperCode.includes('DISTANCE')) {
    return 'yards';
  }

  return ''; // Unknown unit
}
