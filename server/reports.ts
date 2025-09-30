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
  getAnalysisTypeForReport,
} from "@shared/report-types";
import type { AnalyticsRequest } from "@shared/analytics-types";
import { AnalyticsService } from "./analytics";
import { transformAnalyticsToReportData } from "./report-data-transformer";
import { randomBytes } from "crypto";
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs/promises";

export class ReportService {
  private reportsDir: string;
  private analyticsService: AnalyticsService;
  private pdfAvailableCache: boolean | null = null;

  constructor() {
    // Store generated reports in ./reports directory
    this.reportsDir = path.join(process.cwd(), "reports");
    this.ensureReportsDirectory();
    this.analyticsService = new AnalyticsService();
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
   * Check if PDF generation is available
   * Tests if Puppeteer can launch a browser
   */
  async isPdfGenerationAvailable(): Promise<boolean> {
    // Return cached result if available
    if (this.pdfAvailableCache !== null) {
      return this.pdfAvailableCache;
    }

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      await browser.close();
      this.pdfAvailableCache = true;
      return true;
    } catch (error) {
      console.warn("PDF generation not available:", error instanceof Error ? error.message : error);
      this.pdfAvailableCache = false;
      return false;
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

    // Fetch report data using analytics service
    const reportData = await this.fetchReportData(request, config, userId);

    // Generate PDF if requested and available
    let filePath: string | undefined;
    let fileSize: number | undefined;

    if (request.options?.generatePdf) {
      const pdfAvailable = await this.isPdfGenerationAvailable();
      if (pdfAvailable) {
        const pdfResult = await this.generatePdf(reportData, config);
        filePath = pdfResult.filePath;
        fileSize = pdfResult.fileSize;
      } else {
        console.warn("PDF generation requested but not available, skipping PDF generation");
      }
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
    // Get base config from template or defaults
    let baseConfig: ReportTemplateConfig;

    if (request.templateId) {
      const [template] = await db
        .select()
        .from(reportTemplates)
        .where(eq(reportTemplates.id, request.templateId))
        .limit(1);

      if (template) {
        baseConfig = JSON.parse(template.config);
      } else {
        baseConfig = this.getDefaultTemplate(request.reportType);
      }
    } else {
      baseConfig = this.getDefaultTemplate(request.reportType);
    }

    // Merge with provided config (allows partial overrides)
    if (request.config) {
      const mergedConfig = { ...baseConfig };

      // Only override fields that are explicitly provided
      if (request.config.metrics) {
        mergedConfig.metrics = request.config.metrics;
      }
      if (request.config.charts && request.config.charts.length > 0) {
        mergedConfig.charts = request.config.charts;
      }
      if (request.config.timeframeType) {
        mergedConfig.timeframeType = request.config.timeframeType;
      }
      if (request.config.filters) {
        mergedConfig.filters = { ...baseConfig.filters, ...request.config.filters };
      }
      if (request.config.dateRange) {
        mergedConfig.dateRange = { ...baseConfig.dateRange, ...request.config.dateRange };
      }
      if (request.config.displayOptions) {
        mergedConfig.displayOptions = { ...baseConfig.displayOptions, ...request.config.displayOptions };
      }

      return mergedConfig;
    }

    return baseConfig;
  }

  /**
   * Get default template for report type
   */
  private getDefaultTemplate(reportType: string): ReportTemplateConfig {
    switch (reportType) {
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
   * Fetch all data needed for the report using analytics service
   */
  private async fetchReportData(
    request: GenerateReportRequest,
    config: ReportTemplateConfig,
    userId: string
  ): Promise<ReportData> {
    // Fetch organization info
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, request.organizationId))
      .limit(1);

    // Fetch user info (person generating the report)
    const [generatedBy] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Fetch team info if this is a team report
    let teamInfo: { name: string } | null = null;
    if (request.reportType === "team" && request.teamIds && request.teamIds.length > 0) {
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, request.teamIds[0]))
        .limit(1);
      teamInfo = team ? { name: team.name } : null;
    }

    // Determine date range
    const dateRange = this.getDateRange(config.dateRange);

    // Build analytics request
    const analysisType = getAnalysisTypeForReport(request.reportType);
    const athleteId = request.reportType === "individual" || request.reportType === "recruiting"
      ? request.athleteIds?.[0]
      : undefined;

    // Fetch data for BEST performances
    const bestRequest: AnalyticsRequest = {
      analysisType,
      athleteId,
      filters: {
        organizationId: request.organizationId,
        athleteIds: request.athleteIds,
        teams: request.teamIds,
        ...config.filters,
      },
      metrics: config.metrics,
      timeframe: {
        type: "best",
        period: config.dateRange?.type || "all_time",
        startDate: dateRange.start,
        endDate: dateRange.end,
      },
    };

    // Fetch data for TRENDS over time
    const trendsRequest: AnalyticsRequest = {
      ...bestRequest,
      timeframe: {
        ...bestRequest.timeframe,
        type: "trends",
      },
    };

    // Call analytics service to get both best and trends data
    const [bestResponse, trendsResponse] = await Promise.all([
      this.analyticsService.getAnalyticsData(bestRequest),
      this.analyticsService.getAnalyticsData(trendsRequest),
    ]);

    // Filter metrics to only those with actual data
    const availableMetrics = this.getAvailableMetrics(bestResponse, trendsResponse);
    console.log('[ReportService] Available metrics with data:', availableMetrics);

    // Transform analytics responses to report data (combining best and trends)
    const reportData = transformAnalyticsToReportData(
      bestResponse,
      trendsResponse,
      availableMetrics,
      config,
      {
        title: request.title,
        organizationName: teamInfo?.name || org?.name || "Unknown Organization",
        generatedBy: generatedBy?.fullName || "Unknown",
        generatedAt: new Date().toISOString(),
        dateRangeStart: dateRange.start.toISOString(),
        dateRangeEnd: dateRange.end.toISOString(),
      }
    );

    // For team reports, fetch full roster (not just athletes with measurements)
    if (request.reportType === "team" && request.teamIds && request.teamIds.length > 0) {
      const teamRoster = await this.fetchTeamRoster(request.teamIds);
      // Merge roster with existing athletes from measurements
      const athleteMap = new Map(reportData.athletes.map(a => [a.id, a]));
      teamRoster.forEach(athlete => {
        if (!athleteMap.has(athlete.id)) {
          athleteMap.set(athlete.id, athlete);
        }
      });
      reportData.athletes = Array.from(athleteMap.values());
    }

    return reportData;
  }

  /**
   * Determine which metrics have actual measurement data
   */
  private getAvailableMetrics(bestResponse: any, trendsResponse: any): string[] {
    const metricsWithData = new Set<string>();

    // Check best data
    if (bestResponse.data && bestResponse.data.length > 0) {
      bestResponse.data.forEach((point: any) => {
        if (point.metric) {
          metricsWithData.add(point.metric);
        }
      });
    }

    // Check trends data
    if (trendsResponse.data && trendsResponse.data.length > 0) {
      trendsResponse.data.forEach((point: any) => {
        if (point.metric) {
          metricsWithData.add(point.metric);
        }
      });
    }

    return Array.from(metricsWithData);
  }

  /**
   * Fetch team roster (all athletes on team, not just those with measurements)
   */
  private async fetchTeamRoster(teamIds: string[]): Promise<Array<{
    id: string;
    name: string;
    birthYear?: number;
    gender?: string;
    team?: string;
  }>> {
    console.log('[ReportService] Fetching team roster for team IDs:', teamIds);

    const teamMembers = await db
      .select({
        userId: userTeams.userId,
        userName: users.fullName,
        birthYear: users.birthYear,
        gender: users.gender,
        teamName: teams.name,
      })
      .from(userTeams)
      .innerJoin(users, eq(userTeams.userId, users.id))
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(
        and(
          inArray(userTeams.teamId, teamIds),
          eq(userTeams.isActive, "true")
        )
      );

    console.log('[ReportService] Found team members:', teamMembers.length);

    return teamMembers.map((member: any) => ({
      id: member.userId,
      name: member.userName,
      birthYear: member.birthYear ? parseInt(member.birthYear, 10) : undefined,
      gender: member.gender || undefined,
      team: member.teamName,
    }));
  }

  /**
   * Calculate date range from config
   */
  private getDateRange(dateRangeConfig?: {
    type: string;
    startDate?: string;
    endDate?: string;
  }): { start: Date; end: Date } {
    const end = new Date();
    let start = new Date();

    if (dateRangeConfig?.type === "custom" && dateRangeConfig.startDate && dateRangeConfig.endDate) {
      return {
        start: new Date(dateRangeConfig.startDate),
        end: new Date(dateRangeConfig.endDate),
      };
    }

    switch (dateRangeConfig?.type) {
      case "this_year":
        start = new Date(end.getFullYear(), 0, 1);
        break;
      case "last_30_days":
        start.setDate(end.getDate() - 30);
        break;
      case "last_90_days":
        start.setDate(end.getDate() - 90);
        break;
      case "all_time":
      default:
        start.setFullYear(end.getFullYear() - 5); // 5 years back
        break;
    }

    return { start, end };
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
   * Get report by share token with full report data
   */
  async getReportByShareTokenWithData(shareToken: string) {
    const report = await this.getReportByShareToken(shareToken);

    if (!report) {
      return null;
    }

    // Regenerate the report data
    const config = await this.getReportConfig({
      reportType: report.reportType as any,
      title: report.title,
      organizationId: report.organizationId,
      athleteIds: report.athleteIds || undefined,
      teamIds: report.teamIds || undefined,
      templateId: report.templateId || undefined,
    });

    const reportData = await this.fetchReportData(
      {
        reportType: report.reportType as any,
        title: report.title,
        organizationId: report.organizationId,
        athleteIds: report.athleteIds || undefined,
        teamIds: report.teamIds || undefined,
      },
      config,
      report.generatedBy
    );

    return {
      metadata: report,
      data: reportData,
      config: config,
    };
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
        filePath: generatedReports.filePath,
        shareToken: generatedReports.shareToken,
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