/**
 * Statistics Summary Card Component
 * Displays comprehensive statistics for measurement data
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateStatistics } from '@shared/analytics-utils';
import type { Measurement } from '@shared/schema';
import { getMetricDisplayName, getMetricUnits } from '@/lib/metrics';

interface StatisticsSummaryCardProps {
  measurements: Measurement[];
  metric: string;
  title?: string;
}

/**
 * Format a number for display with appropriate precision
 */
function formatNumber(value: number, decimals: number = 2): string {
  if (value === 0) return '0.00';
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(decimals);
}

/**
 * Generate default title from metric name using shared utility
 */
function getDefaultTitle(metric: string): string {
  return `${getMetricDisplayName(metric)} Statistics`;
}

export function StatisticsSummaryCard({
  measurements,
  metric,
  title,
}: StatisticsSummaryCardProps) {
  // Extract numeric values from measurements (already filtered by caller)
  // Memoize to prevent unnecessary recalculations
  const stats = useMemo(() => {
    const values = measurements.map(m => parseFloat(m.value));
    return calculateStatistics(values);
  }, [measurements]);

  // Get units for this metric
  const units = getMetricUnits(metric);
  const displayTitle = title || getDefaultTitle(metric);

  // Handle empty state
  if (stats.count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{displayTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No data available for this metric
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate IQR from percentiles
  const iqr = stats.percentiles.p75 - stats.percentiles.p25;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{displayTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Count */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Count (N)</div>
            <div className="text-2xl font-bold">{stats.count}</div>
          </div>

          {/* Mean */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Mean</div>
            <div className="text-2xl font-bold">{formatNumber(stats.mean, 2)}{units}</div>
          </div>

          {/* Median */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Median</div>
            <div className="text-2xl font-bold">{formatNumber(stats.median, 2)}{units}</div>
          </div>

          {/* Standard Deviation */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Std Dev</div>
            <div className="text-2xl font-bold">{formatNumber(stats.std, 2)}{units}</div>
          </div>

          {/* Range */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Range</div>
            <div className="text-2xl font-bold">
              {formatNumber(stats.min, 2)}{units} - {formatNumber(stats.max, 2)}{units}
            </div>
          </div>

          {/* Q1 (25th percentile) */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Q1 (25th)</div>
            <div className="text-2xl font-bold">{formatNumber(stats.percentiles.p25, 2)}{units}</div>
          </div>

          {/* Q3 (75th percentile) */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Q3 (75th)</div>
            <div className="text-2xl font-bold">{formatNumber(stats.percentiles.p75, 2)}{units}</div>
          </div>

          {/* IQR */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">IQR</div>
            <div className="text-2xl font-bold">{formatNumber(iqr, 2)}{units}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
