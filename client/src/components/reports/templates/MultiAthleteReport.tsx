/**
 * Multi-Athlete Comparison Report Template
 * Side-by-side comparison of selected athletes
 */

import React from "react";
import { ReportView, ReportSection, ReportTable } from "../ReportView";
import { BarChart } from "@/components/charts/BarChart";
import { RadarChart } from "@/components/charts/RadarChart";
import type { ReportData } from "@shared/report-types";

interface MultiAthleteReportProps {
  data: ReportData;
  onDownloadPdf?: () => void;
  onShare?: () => void;
}

export function MultiAthleteReport({
  data,
  onDownloadPdf,
  onShare,
}: MultiAthleteReportProps) {
  const comparisonSection = data.sections.find((s) => s.title.includes("Comparison"));
  const radarSection = data.sections.find((s) => s.title.includes("Multi-Metric"));
  const tableSection = data.sections.find((s) => s.type === "table");

  return (
    <ReportView
      title={data.meta.title}
      subtitle={`Comparing ${data.athletes.length} Athletes`}
      organizationName={data.meta.organizationName}
      generatedBy={data.meta.generatedBy}
      generatedAt={new Date(data.meta.generatedAt)}
      dateRange={{
        start: new Date(data.meta.dateRange.start),
        end: new Date(data.meta.dateRange.end),
      }}
      onDownloadPdf={onDownloadPdf}
      onShare={onShare}
    >
      {/* Athletes Being Compared */}
      <ReportSection title="Athletes in Comparison">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {data.athletes.map((athlete, index) => (
            <div
              key={athlete.id}
              className="border border-gray-200 rounded p-4 bg-gray-50"
            >
              <div className="font-semibold text-lg mb-2">{athlete.name}</div>
              <div className="text-sm text-gray-600 space-y-1">
                {athlete.birthYear && <div>Birth Year: {athlete.birthYear}</div>}
                {athlete.gender && <div>Gender: {athlete.gender}</div>}
                {athlete.team && <div>Team: {athlete.team}</div>}
              </div>
            </div>
          ))}
        </div>
      </ReportSection>

      {/* Side-by-Side Bar Chart Comparison */}
      {comparisonSection && (
        <ReportSection
          title={comparisonSection.title}
          subtitle="Direct performance comparison across athletes"
        >
          <div className="chart-container">
            {comparisonSection.content?.chartData && (
              <BarChart {...comparisonSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Multi-Metric Radar Comparison */}
      {radarSection && (
        <ReportSection
          title={radarSection.title}
          subtitle="Comprehensive multi-metric athlete profiles"
          pageBreakBefore={true}
        >
          <div className="chart-container">
            {radarSection.content?.chartData && (
              <RadarChart {...radarSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Performance Data Table */}
      {tableSection && (
        <ReportSection title="Performance Data" subtitle="Raw measurements and statistics">
          <ReportTable
            headers={tableSection.content?.headers || []}
            rows={tableSection.content?.rows || []}
          />
        </ReportSection>
      )}
    </ReportView>
  );
}