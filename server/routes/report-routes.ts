/**
 * Report API Routes
 * Endpoints for generating, retrieving, and managing reports
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireOrganizationAccess } from "../middleware";
import { reportService } from "../reports";
import { generateReportRequestSchema } from "@shared/report-types";
import { z } from "zod";
import fs from "fs/promises";

const router = Router();

/**
 * POST /api/reports/generate
 * Generate a new report
 */
router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request
    const validatedData = generateReportRequestSchema.parse(req.body);

    // Check organization access
    const user = req.session.user;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // TODO: Add permission check for report generation
    // Should check if user has access to the organization

    // Generate report
    const result = await reportService.generateReport(validatedData, user.id);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors,
      });
    }

    console.error("Error generating report:", error);
    res.status(500).json({
      message: "Failed to generate report",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/reports/:id
 * Get report metadata by ID
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const report = await reportService.getReport(id, user.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    res.json(report);
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      message: "Failed to fetch report",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/reports/:id/download
 * Download report PDF
 */
router.get("/:id/download", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const report = await reportService.getReport(id, user.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (!report.filePath) {
      return res.status(404).json({ message: "PDF not available for this report" });
    }

    // Check if file exists
    try {
      await fs.access(report.filePath);
    } catch {
      return res.status(404).json({ message: "PDF file not found" });
    }

    // Send file
    res.download(report.filePath, `${report.title}.pdf`, (err) => {
      if (err) {
        console.error("Error sending PDF:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to download PDF" });
        }
      }
    });
  } catch (error) {
    console.error("Error downloading report:", error);
    if (!res.headersSent) {
      res.status(500).json({
        message: "Failed to download report",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

/**
 * GET /api/reports/shared/:shareToken
 * Get report by share token (public access)
 */
router.get("/shared/:shareToken", async (req: Request, res: Response) => {
  try {
    const { shareToken } = req.params;

    const report = await reportService.getReportByShareToken(shareToken);

    if (!report) {
      return res.status(404).json({ message: "Report not found or expired" });
    }

    if (report.isPublic !== "true") {
      return res.status(403).json({ message: "Report is not public" });
    }

    res.json(report);
  } catch (error) {
    console.error("Error fetching shared report:", error);
    res.status(500).json({
      message: "Failed to fetch report",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/reports/organization/:organizationId
 * Get all reports for an organization
 */
router.get(
  "/organization/:organizationId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      // TODO: Add permission check for organization access

      const reports = await reportService.getOrganizationReports(
        organizationId,
        limit
      );

      res.json(reports);
    } catch (error) {
      console.error("Error fetching organization reports:", error);
      res.status(500).json({
        message: "Failed to fetch reports",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * DELETE /api/reports/:id
 * Delete a report
 */
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await reportService.deleteReport(id, user.id);

    res.json({ message: "Report deleted successfully" });
  } catch (error) {
    console.error("Error deleting report:", error);
    res.status(500).json({
      message: "Failed to delete report",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;