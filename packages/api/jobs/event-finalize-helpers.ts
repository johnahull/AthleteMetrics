/**
 * Helpers for event finalization report AI insights
 *
 * Provides buildReportDataForAI for generating AI coaching insights
 * during event finalization. This is a simplified version focused on
 * individual reports created from event templates.
 */

import { db } from "../db";
import {
  organizations,
  type Report,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import type { ReportData } from "../services/ai-insights-service";
import type { ReportService } from "../services/report-service";
import { isLowerBetter } from "../utils/report-utils";

interface IndividualReportConfig {
  athleteId?: string;
  timeframe?: {
    type: string;
    customStart?: string;
    customEnd?: string;
  };
  metrics?: string[];
  [key: string]: unknown;
}

/**
 * Build ReportData for AI insights generation from an individual report
 */
export async function buildReportDataForAI(
  report: Report,
  userId: string,
  reportService: ReportService,
): Promise<ReportData> {
  const config = report.config as IndividualReportConfig | null;
  const athleteId = config?.athleteId;

  if (!athleteId) {
    throw new Error("Individual report missing athlete ID in config");
  }

  // Fetch organization details
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, report.organizationId))
    .limit(1);

  // Generate report data
  const reportData = await reportService.generateIndividualReport(
    report.id,
    userId,
    athleteId,
  );

  // Extract timeframe
  let timeframe = "Current Season";
  if (config?.timeframe?.customStart && config?.timeframe?.customEnd) {
    const start = new Date(config.timeframe.customStart).toLocaleDateString();
    const end = new Date(config.timeframe.customEnd).toLocaleDateString();
    timeframe = `${start} to ${end}`;
  }

  // Build metrics array
  const typedData = reportData as {
    athlete?: {
      userName?: string;
      fullName?: string;
      position?: string;
      age?: number;
      gender?: string;
      sports?: string[];
      measurements?: Record<string, number>;
      percentiles?: Record<string, number>;
      teamAverages?: Record<string, number>;
    };
    metricLabels?: Record<string, string>;
  };

  const metrics: ReportData['metrics'] = [];

  if (typedData.athlete?.measurements) {
    for (const [metricCode, value] of Object.entries(typedData.athlete.measurements)) {
      if (typeof value === 'number') {
        let lowerBetter = false;
        try {
          lowerBetter = await isLowerBetter(metricCode);
        } catch { /* default false */ }

        metrics.push({
          code: metricCode,
          label: typedData.metricLabels?.[metricCode] || metricCode,
          values: [value],
          unit: "",
          lowerIsBetter: lowerBetter,
          percentile: typedData.athlete?.percentiles?.[metricCode],
          teamAverage: typedData.athlete?.teamAverages?.[metricCode],
        });
      }
    }
  }

  const aiReportData: ReportData = {
    reportType: "individual",
    reportName: report.name,
    organizationName: org?.name || "Unknown Organization",
    timeframe,
    metrics,
    athleteName: typedData.athlete?.userName || typedData.athlete?.fullName,
    athletePosition: typedData.athlete?.position,
    athleteAge: typedData.athlete?.age,
    athleteGender: typedData.athlete?.gender,
    athleteSport: typedData.athlete?.sports?.[0],
  };

  return aiReportData;
}
