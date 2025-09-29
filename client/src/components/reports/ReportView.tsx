/**
 * ReportView Component
 * Main container for viewing and printing reports with optimized layout
 */

import React, { ReactNode } from "react";
import { ReportHeader, ReportFooter } from "./ReportHeader";
import { Button } from "@/components/ui/button";
import { Download, Printer, Share2 } from "lucide-react";

interface ReportViewProps {
  // Header props
  title: string;
  subtitle?: string;
  organizationName: string;
  generatedBy: string;
  generatedAt: Date;
  dateRange?: {
    start: Date;
    end: Date;
  };
  logoUrl?: string;

  // Content
  children: ReactNode;

  // Footer props
  additionalInfo?: string;

  // Actions
  onPrint?: () => void;
  onDownloadPdf?: () => void;
  onShare?: () => void;

  // Display options
  hideActions?: boolean;
  className?: string;
}

export function ReportView({
  title,
  subtitle,
  organizationName,
  generatedBy,
  generatedAt,
  dateRange,
  logoUrl,
  children,
  additionalInfo,
  onPrint,
  onDownloadPdf,
  onShare,
  hideActions = false,
  className = "",
}: ReportViewProps) {
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div className={`report-container ${className}`}>
      {/* Action buttons - hidden in print mode */}
      {!hideActions && (
        <div className="report-actions no-print mb-6 flex justify-end gap-2 sticky top-0 bg-white z-10 py-4 border-b">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>

          {onDownloadPdf && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadPdf}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          )}

          {onShare && (
            <Button
              variant="outline"
              size="sm"
              onClick={onShare}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          )}
        </div>
      )}

      {/* Report content */}
      <div className="report-content bg-white p-8 shadow-sm">
        <ReportHeader
          title={title}
          subtitle={subtitle}
          organizationName={organizationName}
          generatedBy={generatedBy}
          generatedAt={generatedAt}
          dateRange={dateRange}
          logoUrl={logoUrl}
        />

        <div className="report-body">
          {children}
        </div>

        <ReportFooter additionalInfo={additionalInfo} />
      </div>
    </div>
  );
}

/**
 * ReportSection Component
 * Individual section within a report (chart, table, statistics, etc.)
 */
interface ReportSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  pageBreakBefore?: boolean;
  pageBreakAfter?: boolean;
  className?: string;
}

export function ReportSection({
  title,
  subtitle,
  children,
  pageBreakBefore = false,
  pageBreakAfter = false,
  className = "",
}: ReportSectionProps) {
  return (
    <section
      className={`report-section mb-8 ${pageBreakBefore ? "page-break-before" : ""} ${pageBreakAfter ? "page-break-after" : ""} ${className}`}
    >
      <div className="section-header mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        {subtitle && (
          <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="section-content">
        {children}
      </div>
    </section>
  );
}

/**
 * ReportStats Component
 * Display key statistics in a grid
 */
interface StatItem {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
}

interface ReportStatsProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function ReportStats({
  stats,
  columns = 3,
  className = "",
}: ReportStatsProps) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };

  return (
    <div className={`report-stats grid ${gridCols[columns]} gap-4 ${className}`}>
      {stats.map((stat, index) => (
        <div
          key={index}
          className="stat-card bg-gray-50 p-4 rounded-lg border border-gray-200"
        >
          <div className="stat-label text-sm text-gray-600 mb-1">
            {stat.label}
          </div>
          <div className="stat-value text-2xl font-bold text-gray-900">
            {stat.value}
            {stat.unit && (
              <span className="text-base font-normal text-gray-600 ml-1">
                {stat.unit}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * ReportTable Component
 * Simple table for displaying data
 */
interface ReportTableProps {
  headers: string[];
  rows: (string | number)[][];
  className?: string;
}

export function ReportTable({
  headers,
  rows,
  className = "",
}: ReportTableProps) {
  return (
    <div className={`report-table overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-gray-300">
            {headers.map((header, index) => (
              <th
                key={index}
                className="text-left p-3 font-semibold text-gray-900"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-gray-200 hover:bg-gray-50"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="p-3 text-gray-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}