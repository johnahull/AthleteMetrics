/**
 * Individual Athlete Report Template
 * Shows performance trends, statistics, and progress for a single athlete
 */

import React from "react";
import { ReportView, ReportSection, ReportStats } from "../ReportView";
import { ConnectedScatterChart } from "@/components/charts/ConnectedScatterChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { RadarChart } from "@/components/charts/RadarChart";
import type { ReportData } from "@shared/report-types";

interface IndividualReportProps {
  data: ReportData;
  onDownloadPdf?: () => void;
  onShare?: () => void;
}

export function IndividualReport({
  data,
  onDownloadPdf,
  onShare,
}: IndividualReportProps) {
  const athlete = data.athletes[0]; // Individual report has one athlete

  // Extract statistics from sections
  const statsSection = data.sections.find((s) => s.type === "statistics");
  const stats = statsSection?.content?.stats || [];

  // Extract chart sections
  const trendsSection = data.sections.find((s) => s.title.includes("Trends"));
  const radarSection = data.sections.find((s) => s.title.includes("Multi-Metric"));

  return (
    <ReportView
      title={data.meta.title}
      subtitle={`Performance Report: ${athlete.name}`}
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
      {/* Athlete Info Section */}
      <ReportSection title="Athlete Information">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-semibold">Name:</span> {athlete.name}
          </div>
          {athlete.birthYear && (
            <div>
              <span className="font-semibold">Birth Year:</span> {athlete.birthYear}
            </div>
          )}
          {athlete.gender && (
            <div>
              <span className="font-semibold">Gender:</span> {athlete.gender}
            </div>
          )}
          {athlete.team && (
            <div>
              <span className="font-semibold">Team:</span> {athlete.team}
            </div>
          )}
        </div>
      </ReportSection>

      {/* Key Performance Indicators */}
      {stats.length > 0 && (
        <ReportSection title="Key Performance Indicators">
          <ReportStats stats={stats} columns={3} />
        </ReportSection>
      )}

      {/* Performance Trends Chart */}
      {trendsSection && (
        <ReportSection
          title={trendsSection.title}
          subtitle="Performance progression over time with personal bests highlighted"
          pageBreakBefore={false}
        >
          <div className="chart-container">
            {trendsSection.content?.chartData && (
              <ConnectedScatterChart {...trendsSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Multi-Metric Performance Radar */}
      {radarSection && (
        <ReportSection
          title={radarSection.title}
          subtitle="Comparison across multiple performance metrics"
        >
          <div className="chart-container">
            {radarSection.content?.chartData && (
              <RadarChart {...radarSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Additional sections from data */}
      {data.sections
        .filter(
          (s) =>
            s.type !== "statistics" &&
            !s.title.includes("Trends") &&
            !s.title.includes("Multi-Metric")
        )
        .map((section, index) => (
          <ReportSection key={index} title={section.title}>
            <div>{renderSectionContent(section)}</div>
          </ReportSection>
        ))}
    </ReportView>
  );
}

// Helper to render section content based on type
function renderSectionContent(section: any) {
  switch (section.type) {
    case "chart":
      return <div className="chart-container">{/* Chart component */}</div>;
    case "table":
      return (
        <table className="w-full">
          <tbody>
            {section.content?.rows?.map((row: any[], i: number) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="p-2 border">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "text":
      return <p>{section.content?.text}</p>;
    default:
      return <div>{JSON.stringify(section.content)}</div>;
  }
}