/**
 * Statistics Summary Card Component
 * Displays comprehensive statistics for measurement data
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateStatistics } from '@shared/analytics-utils';
import { getMetricDisplayName, getMetricUnits } from '@/lib/metrics';

/**
 * Distribution mode for displaying percentile breakdowns
 * - quartiles: Q1 (25th), Q3 (75th), IQR
 * - quintiles: P20, P40, P60, P80 (5 equal groups)
 * - deciles: P10-P90 (10 equal groups)
 */
export type DistributionMode = 'quartiles' | 'quintiles' | 'deciles';

interface StatisticsSummaryCardProps {
  measurements: Array<{ metric: string; value: string }>;
  metric: string;
  title?: string;
  distributionMode?: DistributionMode;
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
  distributionMode = 'quartiles',
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

  // Distribution breakdown items based on mode
  const distributionItems = (() => {
    switch (distributionMode) {
      case 'quintiles':
        return [
          { label: 'P20', value: stats.percentiles.p20 },
          { label: 'P40', value: stats.percentiles.p40 },
          { label: 'P60', value: stats.percentiles.p60 },
          { label: 'P80', value: stats.percentiles.p80 },
        ];
      case 'deciles':
        return [
          { label: 'P10', value: stats.percentiles.p10 },
          { label: 'P20', value: stats.percentiles.p20 },
          { label: 'P30', value: stats.percentiles.p30 },
          { label: 'P40', value: stats.percentiles.p40 },
          { label: 'P50', value: stats.percentiles.p50 },
          { label: 'P60', value: stats.percentiles.p60 },
          { label: 'P70', value: stats.percentiles.p70 },
          { label: 'P80', value: stats.percentiles.p80 },
          { label: 'P90', value: stats.percentiles.p90 },
        ];
      case 'quartiles':
      default:
        return [
          { label: 'Q1 (25th)', value: stats.percentiles.p25 },
          { label: 'Q3 (75th)', value: stats.percentiles.p75 },
          { label: 'IQR', value: iqr },
        ];
    }
  })();

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

          {/* Distribution breakdown items */}
          {distributionItems.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="text-sm text-muted-foreground">{item.label}</div>
              <div className="text-2xl font-bold">{formatNumber(item.value, 2)}{units}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
