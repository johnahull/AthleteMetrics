import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * KPI Card Skeleton
 * Matches the structure of KPI cards on the dashboard
 */
export function KPICardSkeleton() {
  return (
    <Card aria-busy="true">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
      <span className="sr-only">Loading data...</span>
    </Card>
  );
}

/**
 * Table Skeleton
 * Configurable skeleton for table-like data displays
 */
interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

export function TableSkeleton({
  rows = 5,
  columns = 6,
  showHeader = true,
}: TableSkeletonProps) {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only">Loading table...</span>
      {/* Header */}
      {showHeader && (
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      )}
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton key={colIdx} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Chart Skeleton
 * Displays animated bars to represent loading charts
 */
interface ChartSkeletonProps {
  height?: string;
  bars?: number;
}

export function ChartSkeleton({ height = "16rem", bars = 8 }: ChartSkeletonProps) {
  return (
    <div
      className="w-full flex items-end justify-around gap-2 p-4"
      style={{ height }}
      aria-busy="true"
    >
      <span className="sr-only">Loading chart...</span>
      {Array.from({ length: bars }).map((_, i) => (
        <Skeleton
          key={i}
          className="w-full"
          style={{ height: `${Math.random() * 80 + 20}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Progress Bar
 * Shows progress with optional message
 */
interface ProgressBarProps {
  value: number;
  message?: string;
}

export function ProgressBar({ value, message }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full space-y-2" aria-busy="true">
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${clampedValue}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {message && (
        <p className="text-sm text-gray-600 text-center">{message}</p>
      )}
    </div>
  );
}
