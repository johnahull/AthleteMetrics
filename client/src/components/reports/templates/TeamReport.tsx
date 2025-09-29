/**
 * Team Performance Report Template
 * Shows team-level statistics, distributions, and comparisons
 */

import React from "react";
import { ReportView, ReportSection, ReportStats, ReportTable } from "../ReportView";
import { TimeSeriesBoxSwarmChart } from "@/components/charts/TimeSeriesBoxSwarmChart";
import { BoxPlotChart } from "@/components/charts/BoxPlotChart";
import { SwarmChart } from "@/components/charts/SwarmChart";
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
  const timeSeriesSection = data.sections.find((s) => s.title.includes("Over Time"));
  const distributionSection = data.sections.find((s) => s.title.includes("Distribution"));
  const swarmSection = data.sections.find((s) => s.title.includes("Data Points"));
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

      {/* Time Series Box Swarm Chart */}
      {timeSeriesSection && (
        <ReportSection
          title={timeSeriesSection.title}
          subtitle="Team performance evolution with statistical distributions"
        >
          <div className="chart-container">
            {timeSeriesSection.content?.chartData && (
              <TimeSeriesBoxSwarmChart {...timeSeriesSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Performance Distribution Box Plot */}
      {distributionSection && (
        <ReportSection
          title={distributionSection.title}
          subtitle="Statistical distribution of team performance across metrics"
        >
          <div className="chart-container">
            {distributionSection.content?.chartData && (
              <BoxPlotChart {...distributionSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Swarm Plot - Individual Data Points */}
      {swarmSection && (
        <ReportSection
          title={swarmSection.title}
          subtitle="Visual distribution of all individual measurements"
          pageBreakBefore={true}
        >
          <div className="chart-container">
            {swarmSection.content?.chartData && (
              <SwarmChart {...swarmSection.content.chartData} />
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