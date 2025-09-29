/**
 * Team Performance Report Template
 * Shows team-level statistics, distributions, and comparisons
 */

import React from "react";
import { ReportView, ReportSection, ReportStats, ReportTable } from "../ReportView";
import { BoxPlotChart } from "@/components/charts/BoxPlotChart";
import { BarChart } from "@/components/charts/BarChart";
import type { ReportData } from "@shared/report-types";

interface TeamReportProps {
  data: ReportData;
  onDownloadPdf?: () => void;
  onShare?: () => void;
}

export function TeamReport({
  data,
  onDownloadPdf,
  onShare,
}: TeamReportProps) {
  // Extract statistics from sections
  const statsSection = data.sections.find((s) => s.type === "statistics");
  const stats = statsSection?.content?.stats || [];

  // Extract chart sections
  const distributionSection = data.sections.find((s) => s.title.includes("Distribution"));
  const comparisonSection = data.sections.find((s) => s.title.includes("Averages"));
  const tableSection = data.sections.find((s) => s.type === "table");

  return (
    <ReportView
      title={data.meta.title}
      subtitle="Team Performance Summary"
      organizationName={data.meta.organizationName}
      generatedBy={data.meta.generatedBy}
      generatedAt={new Date(data.meta.generatedAt)}
      dateRange={{
        start: new Date(data.meta.dateRange.start),
        end: new Date(data.meta.dateRange.end),
      }}
      onDownloadPdf={onDownloadPdf}
      onShare={onShare}
      className="report-landscape"
    >
      {/* Team Overview */}
      <ReportSection title="Team Overview">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-semibold">Total Athletes:</span>{" "}
            {data.athletes.length}
          </div>
          <div>
            <span className="font-semibold">Data Period:</span>{" "}
            {new Date(data.meta.dateRange.start).toLocaleDateString()} -{" "}
            {new Date(data.meta.dateRange.end).toLocaleDateString()}
          </div>
          <div>
            <span className="font-semibold">Total Measurements:</span>{" "}
            {statsSection?.content?.totalMeasurements || "N/A"}
          </div>
        </div>
      </ReportSection>

      {/* Team Statistics */}
      {stats.length > 0 && (
        <ReportSection title="Team Performance Statistics">
          <ReportStats stats={stats} columns={4} />
        </ReportSection>
      )}

      {/* Performance Distribution Box Plot */}
      {distributionSection && (
        <ReportSection
          title={distributionSection.title}
          subtitle="Statistical distribution of team performance"
        >
          <div className="chart-container">
            {distributionSection.content?.chartData && (
              <BoxPlotChart {...distributionSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Team Averages Comparison */}
      {comparisonSection && (
        <ReportSection
          title={comparisonSection.title}
          subtitle="Comparison of team averages across metrics"
          pageBreakBefore={true}
        >
          <div className="chart-container">
            {comparisonSection.content?.chartData && (
              <BarChart {...comparisonSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Top Performers Table */}
      {tableSection && (
        <ReportSection title="Top Performers" subtitle="Best results by metric">
          <ReportTable
            headers={tableSection.content?.headers || []}
            rows={tableSection.content?.rows || []}
          />
        </ReportSection>
      )}

      {/* Athlete Roster */}
      <ReportSection title="Team Roster" pageBreakBefore={true}>
        <ReportTable
          headers={["Name", "Birth Year", "Gender", "Team"]}
          rows={data.athletes.map((athlete) => [
            athlete.name,
            athlete.birthYear || "N/A",
            athlete.gender || "N/A",
            athlete.team || "N/A",
          ])}
        />
      </ReportSection>
    </ReportView>
  );
}