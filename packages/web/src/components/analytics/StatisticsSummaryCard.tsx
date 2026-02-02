/**
 * Statistics Summary Card Component
 * Displays comprehensive statistics for measurement data
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateStatistics } from '@shared/analytics-utils';
import { getMetricDisplayName, getMetricUnits, getMetricType } from '@/lib/metrics';
import type { MetricType } from '@shared/analytics-types';

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
  /** Override metric type from DB (for custom metrics). Falls back to getMetricType(). */
  metricType?: MetricType;
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
  metricType: metricTypeOverride,
}: StatisticsSummaryCardProps) {
  // Resolve metric direction: DB override > fallback chain
  const metricDirection = metricTypeOverride || getMetricType(metric);
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

  // Direction-aware tag: 'best' for the extreme representing top performance,
  // 'worst' for the opposite, undefined for middle percentiles and IQR.
  type DirectionTag = 'best' | 'worst' | undefined;

  // For lower_is_better (times): low percentiles = fast = best
  // For higher_is_better (jumps): high percentiles = high = best
  const isLower = metricDirection === 'lower_is_better';
  const isTracking = metricDirection === 'tracking';

  function tagFor(position: 'low' | 'high' | 'mid'): DirectionTag {
    if (isTracking) return undefined;
    if (position === 'mid') return undefined;
    if (position === 'low') return isLower ? 'best' : 'worst';
    return isLower ? 'worst' : 'best'; // high
  }

  // Distribution breakdown items based on mode
  const distributionItems: Array<{ label: string; value: number; tag?: DirectionTag }> = (() => {
    switch (distributionMode) {
      case 'quintiles':
        return [
          { label: 'P20', value: stats.percentiles.p20, tag: tagFor('low') },
          { label: 'P40', value: stats.percentiles.p40, tag: tagFor('mid') },
          { label: 'P60', value: stats.percentiles.p60, tag: tagFor('mid') },
          { label: 'P80', value: stats.percentiles.p80, tag: tagFor('high') },
        ];
      case 'deciles':
        return [
          { label: 'P10', value: stats.percentiles.p10, tag: tagFor('low') },
          { label: 'P20', value: stats.percentiles.p20, tag: tagFor('mid') },
          { label: 'P30', value: stats.percentiles.p30, tag: tagFor('mid') },
          { label: 'P40', value: stats.percentiles.p40, tag: tagFor('mid') },
          { label: 'P50', value: stats.percentiles.p50, tag: tagFor('mid') },
          { label: 'P60', value: stats.percentiles.p60, tag: tagFor('mid') },
          { label: 'P70', value: stats.percentiles.p70, tag: tagFor('mid') },
          { label: 'P80', value: stats.percentiles.p80, tag: tagFor('mid') },
          { label: 'P90', value: stats.percentiles.p90, tag: tagFor('high') },
        ];
      case 'quartiles':
      default:
        return [
          { label: 'Q1 (25th)', value: stats.percentiles.p25, tag: tagFor('low') },
          { label: 'Q3 (75th)', value: stats.percentiles.p75, tag: tagFor('high') },
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
              <div className="text-sm text-muted-foreground">
                {item.label}
                {item.tag === 'best' && <span className="text-green-600 ml-1">(Best)</span>}
                {item.tag === 'worst' && <span className="text-red-600 ml-1">(Worst)</span>}
              </div>
              <div className={`text-2xl font-bold ${
                item.tag === 'best' ? 'text-green-600' :
                item.tag === 'worst' ? 'text-red-600' : ''
              }`}>
                {formatNumber(item.value, 2)}{units}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
