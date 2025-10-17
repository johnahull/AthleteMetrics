/**
 * Chart Loading Skeleton Component
 *
 * Provides a skeleton loading state for charts while data is being processed
 * or during athlete selection changes.
 */

import React from 'react';

interface ChartSkeletonProps {
  /** Height of the skeleton chart area */
  height?: number;
  /** Whether to show the athlete selector skeleton */
  showAthleteSelector?: boolean;
  /** Whether to show the legend skeleton */
  showLegend?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export const ChartSkeleton = React.memo(function ChartSkeleton({
  height = 400,
  showAthleteSelector = true,
  showLegend = true,
  className = ''
}: ChartSkeletonProps) {
  return (
    <div className={`w-full animate-pulse ${className}`} aria-label="Loading chart">
      {/* Athlete Selector Skeleton */}
      {showAthleteSelector && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 bg-gray-200 rounded w-32"></div>
            <div className="flex gap-2">
              <div className="h-8 bg-gray-200 rounded w-20"></div>
              <div className="h-8 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-gray-200 rounded"></div>
                <div className="w-3 h-3 bg-gray-200 rounded-full"></div>
                <div className="h-3 bg-gray-200 rounded flex-1"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart Area Skeleton */}
      <div
        className="bg-gray-100 rounded-lg border flex items-center justify-center relative overflow-hidden"
        style={{ height: `${height}px` }}
      >
        {/* Simulated chart elements */}
        <div className="absolute inset-4 border-l border-b border-gray-200">
          {/* Y-axis skeleton */}
          <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-between">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-2 bg-gray-200 rounded w-6"></div>
            ))}
          </div>

          {/* X-axis skeleton */}
          <div className="absolute -bottom-6 left-0 right-0 flex justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-8 h-2 bg-gray-200 rounded"></div>
            ))}
          </div>

          {/* Simulated line chart paths */}
          <div className="relative w-full h-full">
            {Array.from({ length: 3 }).map((_, lineIndex) => (
              <svg key={lineIndex} className="absolute inset-0 w-full h-full opacity-20">
                <path
                  d={`M 0,${60 + lineIndex * 20} Q 25,${40 + lineIndex * 15} 50,${80 + lineIndex * 10} T 100,${50 + lineIndex * 25} T 150,${30 + lineIndex * 20} T 200,${70 + lineIndex * 15}`}
                  stroke={`hsl(${lineIndex * 120}, 50%, 60%)`}
                  strokeWidth="2"
                  fill="none"
                  className="animate-pulse"
                />
              </svg>
            ))}
          </div>
        </div>

        {/* Loading text */}
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80">
          <div className="text-center">
            <div className="h-6 bg-gray-200 rounded w-32 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48 mx-auto"></div>
          </div>
        </div>
      </div>

      {/* Legend Skeleton */}
      {showLegend && (
        <div className="mt-4">
          <div className="text-center mb-4">
            <div className="h-4 bg-gray-200 rounded w-80 mx-auto"></div>
          </div>

          <div className="space-y-4">
            {/* Athletes Legend Skeleton */}
            <div>
              <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <div className="w-4 h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded flex-1"></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics Legend Skeleton */}
            <div>
              <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-8 h-2 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded flex-1"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ChartSkeleton;