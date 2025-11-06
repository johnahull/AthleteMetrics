/**
 * Statistics Summary Card Component
 * Displays comprehensive statistics for measurement data
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateStatistics } from '@/utils/statistics';

interface Measurement {
  id: string;
  metric: string;
  value: string;
  units: string;
  [key: string]: any;
}

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
 * Generate default title from metric name
 */
function getDefaultTitle(metric: string): string {
  const metricNames: Record<string, string> = {
    FLY10_TIME: '10-Yard Fly Time',
    VERTICAL_JUMP: 'Vertical Jump',
    AGILITY_505: '5-0-5 Agility',
    AGILITY_5105: '5-10-5 Agility',
    T_TEST: 'T-Test Agility',
    DASH_40YD: '40-Yard Dash',
    RSI: 'Reactive Strength Index',
  };

  const name = metricNames[metric] || metric.replace(/_/g, ' ');
  return `${name} Statistics`;
}

export function StatisticsSummaryCard({
  measurements,
  metric,
  title,
}: StatisticsSummaryCardProps) {
  // Extract numeric values from measurements (already filtered by caller)
  const values = measurements.map(m => parseFloat(m.value));

  // Calculate statistics
  const stats = calculateStatistics(values);

  // Determine display title
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
            <div className="text-2xl font-bold">{formatNumber(stats.mean, 2)}</div>
          </div>

          {/* Median */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Median</div>
            <div className="text-2xl font-bold">{formatNumber(stats.median, 2)}</div>
          </div>

          {/* Standard Deviation */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Std Dev</div>
            <div className="text-2xl font-bold">{formatNumber(stats.stdDev, 2)}</div>
          </div>

          {/* Range */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Range</div>
            <div className="text-2xl font-bold">
              {formatNumber(stats.min, 2)} - {formatNumber(stats.max, 2)}
            </div>
          </div>

          {/* Q1 */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Q1 (25th)</div>
            <div className="text-2xl font-bold">{formatNumber(stats.q1, 2)}</div>
          </div>

          {/* Q3 */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Q3 (75th)</div>
            <div className="text-2xl font-bold">{formatNumber(stats.q3, 2)}</div>
          </div>

          {/* IQR */}
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">IQR</div>
            <div className="text-2xl font-bold">{formatNumber(stats.iqr, 2)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
