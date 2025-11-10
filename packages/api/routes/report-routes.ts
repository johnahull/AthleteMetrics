/**
 * Report routes for coach and individual reports
 * Includes report CRUD, generation, snapshots, and PDF export
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { ReportService } from "../services/report-service";
import { requireAuth } from "../middleware";
import {
  insertReportSchema,
  reports,
  reportSnapshots,
  reportBenchmarks,
  insertReportBenchmarkSchema,
  insertReportSnapshotSchema,
  users,
} from "@shared/schema";
import { ZodError } from "zod";
import { db } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { isSiteAdmin } from "../utils/auth-helpers";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
        (validatedData.config as any).athleteIds &&
        Array.isArray((validatedData.config as any).athleteIds) &&
        (validatedData.config as any).athleteIds.length > 0
      ) {
        const athleteIds = (validatedData.config as any).athleteIds as string[];

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
            const reportConfig = {
              ...(validatedData.config as any),
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

      if (validatedData.reportType === "individual") {
        const athleteIds = (validatedData.config as any)?.athleteIds;

        // Validate that individual reports have an athlete
        if (!athleteIds || !Array.isArray(athleteIds) || athleteIds.length === 0) {
          return res.status(400).json({
            message: "Individual reports require at least one athlete",
          });
        }

        // If single athlete in array, normalize to athleteId (singular)
        if (athleteIds.length === 1) {
          finalConfig = {
            ...(validatedData.config as any),
            athleteId: athleteIds[0],
          };
          delete (finalConfig as any).athleteIds;
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
   * Get all reports for user's organizations
   * GET /api/reports
   */
  app.get("/api/reports", reportLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const organizationId = req.query.organizationId as string | undefined;

      // Get user's organizations
      const userOrgs = await reportService["getUserOrganizations"](user.id);
      const orgIds = userOrgs.map((org) => org.organizationId);

      // Site admins can access all reports
      let reportsList;
      if (isSiteAdmin(user)) {
        if (organizationId) {
          reportsList = await db
            .select()
            .from(reports)
            .where(eq(reports.organizationId, organizationId))
            .orderBy(desc(reports.createdAt));
        } else {
          reportsList = await db
            .select()
            .from(reports)
            .orderBy(desc(reports.createdAt));
        }
      } else {
        if (organizationId) {
          // Verify user has access to this organization
          if (!orgIds.includes(organizationId)) {
            return res
              .status(403)
              .json({ message: "Access denied to this organization" });
          }
          reportsList = await db
            .select()
            .from(reports)
            .where(eq(reports.organizationId, organizationId))
            .orderBy(desc(reports.createdAt));
        } else {
          // Get reports for all user's organizations
          reportsList = await db
            .select()
            .from(reports)
            .where(inArray(reports.organizationId, orgIds))
            .orderBy(desc(reports.createdAt));
        }
      }

      res.json(reportsList);
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

      // Update report
      const [updated] = await db
        .update(reports)
        .set({
          ...req.body,
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
        if (report.reportType === "coach") {
          reportData = await reportService.generateCoachReport(reportId, user.id);
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
  app.get("/api/public/reports/:token", async (req, res) => {
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
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: "User not authenticated" });
        }

        const reportId = req.params.id;
        const athleteId = req.query.athleteId as string | undefined;

        const report = await db
          .select()
          .from(reports)
          .where(eq(reports.id, reportId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!report) {
          return res.status(404).json({ message: "Report not found" });
        }

        // Generate report data
        let reportData: any;
        if (report.reportType === "coach") {
          reportData = await reportService.generateCoachReport(reportId, user.id);
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
        const pdf = generatePDF(report, reportData);

        // Send PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${report.name.replace(/[^a-z0-9]/gi, "_")}.pdf"`
        );
        res.send(Buffer.from(pdf.output("arraybuffer")));
      } catch (error) {
        console.error("Error generating PDF:", error);
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
    reportGenerationLimiter,
    async (req, res) => {
      try {
        const token = req.params.token;

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
        const pdf = generatePDF(report, snapshot.snapshotData);

        // Send PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${report.name.replace(/[^a-z0-9]/gi, "_")}.pdf"`
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
}

/**
 * Generate PDF document from report data
 */
function generatePDF(report: any, reportData: any): jsPDF {
  const doc = new jsPDF();

  // Add title
  doc.setFontSize(20);
  doc.text(report.name, 14, 20);

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

  if (reportData.reportType === "coach") {
    // Coach report: Team statistics
    doc.setFontSize(14);
    doc.text("Team Statistics", 14, yPos);
    yPos += 10;

    if (reportData.teamStatistics && reportData.teamStatistics.length > 0) {
      const statsRows = reportData.teamStatistics.map((stat: any) => [
        stat.metric,
        stat.average.toFixed(2),
        stat.median.toFixed(2),
        stat.min.toFixed(2),
        stat.max.toFixed(2),
        stat.topPerformer?.userName || "N/A",
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Metric", "Average", "Median", "Min", "Max", "Top Performer"]],
        body: statsRows,
        theme: "striped",
        headStyles: { fillColor: [41, 128, 185] },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Athlete rankings
    if (reportData.athleteRankings && reportData.athleteRankings.length > 0) {
      doc.setFontSize(14);
      doc.text("Athlete Rankings", 14, yPos);
      yPos += 10;

      const rankingRows = reportData.athleteRankings
        .slice(0, 20) // Top 20
        .map((athlete: any, index: number) => [
          index + 1,
          athlete.userName,
          athlete.compositeIndex?.toFixed(2) || "N/A",
        ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Rank", "Athlete", "Composite Score"]],
        body: rankingRows,
        theme: "striped",
        headStyles: { fillColor: [41, 128, 185] },
      });
    }
  } else {
    // Individual report: Athlete performance
    const athlete = reportData.athlete;

    doc.setFontSize(14);
    doc.text(`Athlete: ${athlete.userName}`, 14, yPos);
    yPos += 10;

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
        theme: "striped",
        headStyles: { fillColor: [41, 128, 185] },
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
              comp.meetsTarget ? "Yes" : "No",
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
          theme: "striped",
          headStyles: { fillColor: [41, 128, 185] },
        });
      }
    }
  }

  return doc;
}
