/**
 * Recruiting Package Report Template
 * Comprehensive athlete profile for recruiting purposes
 */

import React from "react";
import { ReportView, ReportSection, ReportStats } from "../ReportView";
import { RadarChart } from "@/components/charts/RadarChart";
import { LineChart } from "@/components/charts/LineChart";
import type { ReportData } from "@shared/report-types";

interface RecruitingReportProps {
  data: ReportData;
  onDownloadPdf?: () => void;
  onShare?: () => void;
}

export function RecruitingReport({
  data,
  onDownloadPdf,
  onShare,
}: RecruitingReportProps) {
  const athlete = data.athletes[0]; // Recruiting report is for one athlete

  const statsSection = data.sections.find((s) => s.type === "statistics");
  const stats = statsSection?.content?.stats || [];

  const profileSection = data.sections.find((s) => s.title.includes("Athletic Profile"));
  const progressionSection = data.sections.find((s) => s.title.includes("Progression"));

  return (
    <ReportView
      title={data.meta.title}
      subtitle="Recruiting Package"
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
      {/* Athlete Profile Header */}
      <ReportSection title="Athlete Profile">
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">{athlete.name}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {athlete.birthYear && (
              <div>
                <div className="text-gray-600 font-medium">Birth Year</div>
                <div className="text-lg font-semibold">{athlete.birthYear}</div>
              </div>
            )}
            {athlete.gender && (
              <div>
                <div className="text-gray-600 font-medium">Gender</div>
                <div className="text-lg font-semibold">{athlete.gender}</div>
              </div>
            )}
            {athlete.team && (
              <div>
                <div className="text-gray-600 font-medium">Current Team</div>
                <div className="text-lg font-semibold">{athlete.team}</div>
              </div>
            )}
            <div>
              <div className="text-gray-600 font-medium">Measurements</div>
              <div className="text-lg font-semibold">
                {statsSection?.content?.totalMeasurements || "N/A"}
              </div>
            </div>
          </div>
        </div>
      </ReportSection>

      {/* Key Performance Metrics */}
      {stats.length > 0 && (
        <ReportSection title="Key Performance Metrics" subtitle="Best recorded performances">
          <ReportStats stats={stats} columns={3} />
        </ReportSection>
      )}

      {/* Athletic Profile Radar Chart */}
      {profileSection && (
        <ReportSection
          title={profileSection.title}
          subtitle="Comprehensive athletic assessment across multiple dimensions"
        >
          <div className="chart-container flex justify-center">
            {profileSection.content?.chartData && (
              <div className="w-full max-w-2xl">
                <RadarChart {...profileSection.content.chartData} />
              </div>
            )}
          </div>
        </ReportSection>
      )}

      {/* Performance Progression */}
      {progressionSection && (
        <ReportSection
          title={progressionSection.title}
          subtitle="Demonstrated improvement and development trajectory"
          pageBreakBefore={true}
        >
          <div className="chart-container">
            {progressionSection.content?.chartData && (
              <LineChart {...progressionSection.content.chartData} />
            )}
          </div>
        </ReportSection>
      )}

      {/* Strengths and Highlights */}
      <ReportSection title="Strengths and Highlights">
        <div className="space-y-4">
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h4 className="font-semibold text-green-900 mb-1">Top Strengths</h4>
            <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
              <li>Consistent improvement across measurement periods</li>
              <li>Exceptional performance in speed and agility metrics</li>
              <li>Strong work ethic and dedication to training</li>
            </ul>
          </div>

          <div className="border-l-4 border-blue-500 pl-4 py-2">
            <h4 className="font-semibold text-blue-900 mb-1">Areas of Development</h4>
            <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
              <li>Continued focus on strength and power development</li>
              <li>Opportunity for growth in technical skill refinement</li>
            </ul>
          </div>
        </div>
      </ReportSection>

      {/* Coach's Notes Section (Placeholder) */}
      <ReportSection title="Coach's Assessment" pageBreakBefore={true}>
        <div className="bg-gray-50 border border-gray-200 rounded p-4">
          <p className="text-sm text-gray-600 italic">
            This section can be customized with specific coach observations and
            recommendations for recruiting purposes.
          </p>
        </div>
      </ReportSection>
    </ReportView>
  );
}