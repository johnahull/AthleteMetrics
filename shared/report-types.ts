/**
 * Report Type Definitions
 * Shared types for report generation and templates
 */

import { z } from "zod";

// Report type enum
export type ReportType = "individual" | "team" | "multi_athlete" | "recruiting";

// Map report types to analytics analysis types
export function getAnalysisTypeForReport(reportType: ReportType): "individual" | "intra_group" | "inter_group" {
  switch (reportType) {
    case "individual":
    case "recruiting":
      return "individual";
    case "multi_athlete":
      return "intra_group"; // Multiple athletes within same group
    case "team":
      return "inter_group"; // Multiple groups/teams comparison
    default:
      return "individual";
  }
}

// Chart types available for reports
export type ReportChartType =
  | "line"
  | "bar"
  | "box_plot"
  | "distribution"
  | "radar"
  | "scatter"
  | "swarm"
  | "multi_line"
  | "box_swarm_combo"
  | "time_series_box_swarm"
  | "connected_scatter";

// Report configuration for templates
export interface ReportTemplateConfig {
  // Timeframe type - best performances or trends over time
  timeframeType: "best" | "trends";

  // Metrics to include
  metrics: {
    primary: string;
    additional: string[];
  };

  // Chart configurations
  charts: {
    type: ReportChartType;
    title: string;
    metrics: string[]; // Which metrics this chart displays
  }[];

  // Filters and grouping
  filters?: {
    genders?: ("Male" | "Female" | "Not Specified")[];
    birthYearFrom?: number;
    birthYearTo?: number;
    teams?: string[];
  };

  // Date range
  dateRange?: {
    type: "all_time" | "this_year" | "last_30_days" | "last_90_days" | "custom";
    startDate?: string;
    endDate?: string;
  };

  // Display options
  displayOptions: {
    includeStatistics: boolean;
    includeTrends: boolean;
    includeComparison: boolean;
    showRawData: boolean;
    pageOrientation: "portrait" | "landscape";
  };
}

// Report generation request
export interface GenerateReportRequest {
  reportType: ReportType;
  title: string;
  organizationId: string;

  // Template to use (optional)
  templateId?: string;

  // Athletes/teams to include
  athleteIds?: string[];
  teamIds?: string[];

  // Configuration (overrides template if provided)
  config?: ReportTemplateConfig;

  // Additional options
  options?: {
    generatePdf?: boolean;
    emailTo?: string[];
    isPublic?: boolean;
    expiresInDays?: number;
  };
}

// Report generation response
export interface GenerateReportResponse {
  reportId: string;
  title: string;
  reportType: ReportType;
  pdfUrl?: string;
  shareUrl?: string;
  expiresAt?: string;
  createdAt: string;
}

// Report data structure for rendering
export interface ReportData {
  meta: {
    title: string;
    subtitle?: string;
    organizationName: string;
    generatedBy: string;
    generatedAt: string;
    dateRange: {
      start: string;
      end: string;
    };
  };

  athletes: {
    id: string;
    name: string;
    birthYear?: number;
    gender?: string;
    team?: string;
  }[];

  sections: ReportSection[];
}

// Report section (charts, tables, text)
export interface ReportSection {
  type: "chart" | "statistics" | "table" | "text";
  title: string;
  content: any; // Specific to section type
}

// Default template configurations
export const DEFAULT_INDIVIDUAL_TEMPLATE: ReportTemplateConfig = {
  timeframeType: "trends",
  metrics: {
    primary: "FLY10_TIME",
    additional: ["VERTICAL_JUMP", "AGILITY_505"],
  },
  charts: [
    { type: "connected_scatter", title: "Performance Trends Over Time", metrics: ["FLY10_TIME"] },
    { type: "multi_line", title: "Multi-Metric Progress", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505"] },
    { type: "radar", title: "Athletic Profile", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505"] },
  ],
  displayOptions: {
    includeStatistics: true,
    includeTrends: true,
    includeComparison: true,
    showRawData: false,
    pageOrientation: "portrait",
  },
};

export const DEFAULT_TEAM_TEMPLATE: ReportTemplateConfig = {
  timeframeType: "best",
  metrics: {
    primary: "FLY10_TIME",
    additional: ["VERTICAL_JUMP", "AGILITY_505", "DASH_40YD"],
  },
  charts: [
    { type: "time_series_box_swarm", title: "Team Performance Over Time", metrics: ["FLY10_TIME"] },
    { type: "box_plot", title: "Performance Distribution by Metric", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505"] },
    { type: "swarm", title: "Individual Data Points", metrics: ["FLY10_TIME"] },
  ],
  displayOptions: {
    includeStatistics: true,
    includeTrends: false,
    includeComparison: true,
    showRawData: false,
    pageOrientation: "landscape",
  },
};

export const DEFAULT_MULTI_ATHLETE_TEMPLATE: ReportTemplateConfig = {
  timeframeType: "best",
  metrics: {
    primary: "FLY10_TIME",
    additional: ["VERTICAL_JUMP", "AGILITY_505"],
  },
  charts: [
    { type: "bar", title: "Athlete Comparison", metrics: ["FLY10_TIME", "VERTICAL_JUMP"] },
    { type: "radar", title: "Multi-Metric Comparison", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505"] },
  ],
  displayOptions: {
    includeStatistics: true,
    includeTrends: false,
    includeComparison: true,
    showRawData: true,
    pageOrientation: "portrait",
  },
};

export const DEFAULT_RECRUITING_TEMPLATE: ReportTemplateConfig = {
  timeframeType: "trends",
  metrics: {
    primary: "FLY10_TIME",
    additional: ["VERTICAL_JUMP", "AGILITY_505", "DASH_40YD", "T_TEST"],
  },
  charts: [
    { type: "radar", title: "Athletic Profile", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "DASH_40YD"] },
    { type: "connected_scatter", title: "Performance Progression", metrics: ["FLY10_TIME", "VERTICAL_JUMP"] },
    { type: "multi_line", title: "Multi-Metric Development", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505"] },
  ],
  displayOptions: {
    includeStatistics: true,
    includeTrends: true,
    includeComparison: true,
    showRawData: true,
    pageOrientation: "portrait",
  },
};

// Validation schemas
export const generateReportRequestSchema = z.object({
  reportType: z.enum(["individual", "team", "multi_athlete", "recruiting"]),
  title: z.string().min(1, "Report title is required"),
  organizationId: z.string().min(1, "Organization ID is required"),
  templateId: z.string().optional(),
  athleteIds: z.array(z.string()).optional(),
  teamIds: z.array(z.string()).optional(),
  config: z.any().optional(), // TODO: Add more specific validation
  options: z.object({
    generatePdf: z.boolean().optional(),
    emailTo: z.array(z.string().email()).optional(),
    isPublic: z.boolean().optional(),
    expiresInDays: z.number().int().positive().optional(),
  }).optional(),
});

export type GenerateReportRequestInput = z.infer<typeof generateReportRequestSchema>;