/**
 * Report Type Definitions
 * Shared types for report generation and templates
 */

import { z } from "zod";

// Report type enum
export type ReportType = "individual" | "team" | "multi_athlete" | "recruiting";

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
  | "box_swarm_combo";

// Report configuration for templates
export interface ReportTemplateConfig {
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
  metrics: {
    primary: "FLY10_TIME",
    additional: ["VERTICAL_JUMP", "AGILITY_505"],
  },
  charts: [
    { type: "line", title: "Performance Trends Over Time", metrics: ["FLY10_TIME"] },
    { type: "radar", title: "Multi-Metric Performance", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505"] },
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
  metrics: {
    primary: "FLY10_TIME",
    additional: ["VERTICAL_JUMP", "AGILITY_505", "DASH_40YD"],
  },
  charts: [
    { type: "box_plot", title: "Team Performance Distribution", metrics: ["FLY10_TIME"] },
    { type: "bar", title: "Team Averages by Metric", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505"] },
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
  metrics: {
    primary: "FLY10_TIME",
    additional: ["VERTICAL_JUMP", "AGILITY_505", "DASH_40YD", "T_TEST"],
  },
  charts: [
    { type: "radar", title: "Athletic Profile", metrics: ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "DASH_40YD"] },
    { type: "line", title: "Performance Progression", metrics: ["FLY10_TIME", "VERTICAL_JUMP"] },
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