/**
 * Report Generation Service
 * Handles report data preparation, PDF generation, and storage
 */

import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import {
  generatedReports,
  reportTemplates,
  users,
  measurements,
  teams,
  userTeams,
  organizations,
} from "@shared/schema";
import type {
  GenerateReportRequest,
  GenerateReportResponse,
  ReportData,
  ReportTemplateConfig,
} from "@shared/report-types";
import {
  DEFAULT_INDIVIDUAL_TEMPLATE,
  DEFAULT_TEAM_TEMPLATE,
  DEFAULT_MULTI_ATHLETE_TEMPLATE,
  DEFAULT_RECRUITING_TEMPLATE,
} from "@shared/report-types";
import { randomBytes } from "crypto";
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs/promises";

export class ReportService {
  private reportsDir: string;

  constructor() {
    // Store generated reports in ./reports directory
    this.reportsDir = path.join(process.cwd(), "reports");
    this.ensureReportsDirectory();
  }

  /**
   * Ensure reports directory exists
   */
  private async ensureReportsDirectory() {
    try {
      await fs.access(this.reportsDir);
    } catch {
      await fs.mkdir(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Generate a report
   */
  async generateReport(
    request: GenerateReportRequest,
    userId: string
  ): Promise<GenerateReportResponse> {
    // Get template configuration
    const config = await this.getReportConfig(request);

    // Fetch report data
    const reportData = await this.fetchReportData(request, config);

    // Generate PDF if requested
    let filePath: string | undefined;
    let fileSize: number | undefined;

    if (request.options?.generatePdf) {
      const pdfResult = await this.generatePdf(reportData, config);
      filePath = pdfResult.filePath;
      fileSize = pdfResult.fileSize;
    }

    // Generate share token
    const shareToken = randomBytes(32).toString("hex");

    // Calculate expiration date
    let expiresAt: Date | undefined;
    if (request.options?.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + request.options.expiresInDays);
    }

    // Save report to database
    const [report] = await db
      .insert(generatedReports)
      .values({
        title: request.title,
        templateId: request.templateId,
        organizationId: request.organizationId,
        generatedBy: userId,
        reportType: request.reportType,
        athleteIds: request.athleteIds,
        teamIds: request.teamIds,
        filePath,
        fileSize,
        shareToken,
        isPublic: request.options?.isPublic ? "true" : "false",
        expiresAt,
      })
      .returning();

    // Build response
    const response: GenerateReportResponse = {
      reportId: report.id,
      title: report.title,
      reportType: report.reportType as any,
      createdAt: report.createdAt.toISOString(),
    };

    if (filePath) {
      response.pdfUrl = `/api/reports/${report.id}/download`;
    }

    if (shareToken) {
      response.shareUrl = `/reports/view/${shareToken}`;
    }

    if (expiresAt) {
      response.expiresAt = expiresAt.toISOString();
    }

    return response;
  }

  /**
   * Get report configuration (from template or defaults)
   */
  private async getReportConfig(
    request: GenerateReportRequest
  ): Promise<ReportTemplateConfig> {
    // If config provided directly, use it
    if (request.config) {
      return request.config;
    }

    // If template ID provided, fetch it
    if (request.templateId) {
      const [template] = await db
        .select()
        .from(reportTemplates)
        .where(eq(reportTemplates.id, request.templateId))
        .limit(1);

      if (template) {
        return JSON.parse(template.config);
      }
    }

    // Otherwise, use default template based on report type
    switch (request.reportType) {
      case "individual":
        return DEFAULT_INDIVIDUAL_TEMPLATE;
      case "team":
        return DEFAULT_TEAM_TEMPLATE;
      case "multi_athlete":
        return DEFAULT_MULTI_ATHLETE_TEMPLATE;
      case "recruiting":
        return DEFAULT_RECRUITING_TEMPLATE;
      default:
        return DEFAULT_INDIVIDUAL_TEMPLATE;
    }
  }

  /**
   * Fetch all data needed for the report
   */
  private async fetchReportData(
    request: GenerateReportRequest,
    config: ReportTemplateConfig
  ): Promise<ReportData> {
    // Fetch organization info
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, request.organizationId))
      .limit(1);

    // Fetch user info
    const [generatedBy] = await db
      .select()
      .from(users)
      .where(eq(users.id, request.organizationId))
      .limit(1);

    // Fetch athletes
    const athleteIds = request.athleteIds || [];
    const athletes = await db
      .select({
        id: users.id,
        name: users.fullName,
        birthYear: users.birthYear,
        gender: users.gender,
      })
      .from(users)
      .where(inArray(users.id, athleteIds));

    // TODO: Fetch measurements, calculate statistics, generate chart data
    // This would integrate with the existing analytics service

    // Build report data structure
    const reportData: ReportData = {
      meta: {
        title: request.title,
        organizationName: org?.name || "Unknown Organization",
        generatedBy: generatedBy?.fullName || "Unknown",
        generatedAt: new Date().toISOString(),
        dateRange: {
          start: config.dateRange?.startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          end: config.dateRange?.endDate || new Date().toISOString(),
        },
      },
      athletes: athletes.map((a) => ({
        id: a.id,
        name: a.name,
        birthYear: a.birthYear || undefined,
        gender: a.gender || undefined,
      })),
      sections: [],
    };

    return reportData;
  }

  /**
   * Generate PDF from report data using Puppeteer
   */
  private async generatePdf(
    reportData: ReportData,
    config: ReportTemplateConfig
  ): Promise<{ filePath: string; fileSize: number }> {
    const fileName = `report-${Date.now()}-${randomBytes(8).toString("hex")}.pdf`;
    const filePath = path.join(this.reportsDir, fileName);

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();

      // Generate HTML content for report
      const html = this.generateReportHtml(reportData, config);

      // Set content and wait for it to load
      await page.setContent(html, {
        waitUntil: "networkidle0",
      });

      // Generate PDF
      await page.pdf({
        path: filePath,
        format: config.displayOptions.pageOrientation === "landscape" ? "letter" : "letter",
        landscape: config.displayOptions.pageOrientation === "landscape",
        printBackground: true,
        margin: {
          top: "20mm",
          right: "20mm",
          bottom: "20mm",
          left: "20mm",
        },
      });

      // Get file size
      const stats = await fs.stat(filePath);

      return {
        filePath,
        fileSize: stats.size,
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate HTML for report (to be rendered by Puppeteer)
   */
  private generateReportHtml(
    reportData: ReportData,
    config: ReportTemplateConfig
  ): string {
    // This is a simplified version - in production, you'd use a proper template engine
    // or server-side render React components

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${reportData.meta.title}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 11pt;
              line-height: 1.6;
              color: #333;
              background: white;
            }
            .container {
              max-width: 100%;
              padding: 20mm;
            }
            .header {
              border-bottom: 2px solid #ddd;
              padding-bottom: 10mm;
              margin-bottom: 10mm;
            }
            h1 {
              font-size: 24pt;
              margin-bottom: 5mm;
              color: #111;
            }
            h2 {
              font-size: 18pt;
              margin-top: 10mm;
              margin-bottom: 5mm;
              color: #222;
            }
            .meta-info {
              display: flex;
              justify-content: space-between;
              font-size: 10pt;
              color: #666;
            }
            .section {
              margin-bottom: 10mm;
              page-break-inside: avoid;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 5mm 0;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${reportData.meta.title}</h1>
              <div class="meta-info">
                <div>
                  <strong>${reportData.meta.organizationName}</strong><br>
                  Generated by: ${reportData.meta.generatedBy}<br>
                  Date: ${new Date(reportData.meta.generatedAt).toLocaleDateString()}
                </div>
                <div>
                  Data Range:<br>
                  ${new Date(reportData.meta.dateRange.start).toLocaleDateString()} -
                  ${new Date(reportData.meta.dateRange.end).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div class="section">
              <h2>Athletes</h2>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Birth Year</th>
                    <th>Gender</th>
                  </tr>
                </thead>
                <tbody>
                  ${reportData.athletes
                    .map(
                      (a) => `
                    <tr>
                      <td>${a.name}</td>
                      <td>${a.birthYear || "N/A"}</td>
                      <td>${a.gender || "N/A"}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>

            ${reportData.sections
              .map(
                (section) => `
              <div class="section">
                <h2>${section.title}</h2>
                <div>${JSON.stringify(section.content)}</div>
              </div>
            `
              )
              .join("")}
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Get a generated report by ID
   */
  async getReport(reportId: string, userId: string) {
    const [report] = await db
      .select()
      .from(generatedReports)
      .where(
        and(
          eq(generatedReports.id, reportId),
          eq(generatedReports.generatedBy, userId)
        )
      )
      .limit(1);

    return report;
  }

  /**
   * Get report by share token
   */
  async getReportByShareToken(shareToken: string) {
    const [report] = await db
      .select()
      .from(generatedReports)
      .where(eq(generatedReports.shareToken, shareToken))
      .limit(1);

    // Check if expired
    if (report && report.expiresAt && new Date(report.expiresAt) < new Date()) {
      return null;
    }

    return report;
  }

  /**
   * Get all reports for an organization
   */
  async getOrganizationReports(organizationId: string, limit = 50) {
    const reports = await db
      .select({
        id: generatedReports.id,
        title: generatedReports.title,
        reportType: generatedReports.reportType,
        generatedBy: users.fullName,
        createdAt: generatedReports.createdAt,
        athleteIds: generatedReports.athleteIds,
        teamIds: generatedReports.teamIds,
      })
      .from(generatedReports)
      .leftJoin(users, eq(generatedReports.generatedBy, users.id))
      .where(eq(generatedReports.organizationId, organizationId))
      .orderBy(generatedReports.createdAt)
      .limit(limit);

    return reports;
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string, userId: string) {
    const report = await this.getReport(reportId, userId);
    if (!report) {
      throw new Error("Report not found");
    }

    // Delete PDF file if exists
    if (report.filePath) {
      try {
        await fs.unlink(report.filePath);
      } catch (error) {
        console.error("Error deleting PDF file:", error);
      }
    }

    // Delete from database
    await db.delete(generatedReports).where(eq(generatedReports.id, reportId));
  }
}

export const reportService = new ReportService();