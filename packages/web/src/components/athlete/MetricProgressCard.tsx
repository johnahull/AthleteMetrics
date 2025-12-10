/**
 * MetricProgressCard Component
 *
 * Displays sparkline chart for a specific performance metric with:
 * - Last 10 measurements as a sparkline chart
 * - Trend indicator: improving, steady, or declining
 * - Color-coded trends (green/yellow/red)
 * - Comparison text showing percentage change
 * - Current value and best value prominently displayed
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Line } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import {
  calculateMetricTrend,
  getSparklineData,
  getBestValue,
  type TrendDirection,
} from '@/utils/metric-trend-utils';
import { MetricContextTooltip } from './MetricContextTooltip';
import { isLowerBetter } from '@/constants/metrics';

// Chart.js is already registered globally in App.tsx via chart-setup.ts

interface Measurement {
  value: string | number;
  date: string;
}

interface PersonalRecord {
  metric: string;
  displayName: string;
  value: number;
  units: string;
  date: string;
  isRecent: boolean; // Within 7 days
  improvement: number | null;
  improvementText: string | null;
}

interface MetricProgressCardProps {
  metric: string;
  displayName: string;
  measurements: Measurement[];
  units: string;
  personalRecord?: PersonalRecord | null;
  showConfetti?: boolean;
}

/**
 * Filter measurements to keep only the best value per date.
 * Uses isLowerBetter to determine what "best" means for the metric.
 */
function filterBestPerDate(measurements: Measurement[], metric: string): Measurement[] {
  const bestByDate = new Map<string, Measurement>();
  const lowerIsBetter = isLowerBetter(metric);

  for (const m of measurements) {
    const existing = bestByDate.get(m.date);
    if (!existing) {
      bestByDate.set(m.date, m);
    } else {
      const existingValue = parseFloat(String(existing.value));
      const currentValue = parseFloat(String(m.value));
      const isBetter = lowerIsBetter
        ? currentValue < existingValue
        : currentValue > existingValue;
      if (isBetter) {
        bestByDate.set(m.date, m);
      }
    }
  }

  return Array.from(bestByDate.values());
}

export function MetricProgressCard({
  metric,
  displayName,
  measurements,
  units,
  personalRecord,
  showConfetti = true,
}: MetricProgressCardProps) {
  const confettiTriggered = useRef(false);

  // Trigger confetti for recent PRs
  useEffect(() => {
    if (showConfetti && !confettiTriggered.current && personalRecord?.isRecent) {
      confettiTriggered.current = true;
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'],
        });
      } catch (error) {
        console.warn('Failed to trigger confetti:', error);
      }
    }
  }, [personalRecord?.isRecent, showConfetti, personalRecord]);

  // Filter to best measurement per date for sparkline and trend
  const filteredMeasurements = useMemo(
    () => filterBestPerDate(measurements, metric),
    [measurements, metric]
  );

  // Calculate trend data using filtered measurements
  const trendData = useMemo(
    () => calculateMetricTrend(filteredMeasurements, metric),
    [filteredMeasurements, metric]
  );

  // Get sparkline data (last 10 measurements, filtered to best per date)
  const sparklineData = useMemo(
    () => getSparklineData(filteredMeasurements, 10),
    [filteredMeasurements]
  );

  // Get current value from filtered measurements (most recent best)
  const currentValue = useMemo(() => {
    if (filteredMeasurements.length === 0) return null;
    const sorted = [...filteredMeasurements].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return parseFloat(String(sorted[0].value));
  }, [filteredMeasurements]);

  const bestValue = useMemo(
    () => getBestValue(measurements, metric),
    [measurements, metric]
  );

  // Handle empty measurements
  if (measurements.length === 0) {
    return (
      <Card data-testid="metric-progress-card">
        <CardHeader>
          <CardTitle className="text-lg">{displayName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            data-testid="no-measurements"
            className="text-center py-8 text-gray-500"
          >
            No measurements yet
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sparkline chart configuration
  const chartData = {
    labels: Array(sparklineData.length).fill(''),
    datasets: [
      {
        data: sparklineData,
        borderColor: getTrendColor(trendData?.trend),
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context: TooltipItem<'line'>) => `${context.parsed.y}${units}`,
        },
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
      },
    },
  };

  return (
    <Card
      data-testid="metric-progress-card"
      className="hover:shadow-md transition-shadow"
      aria-label={`${displayName} performance progress card`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>{displayName}</span>
          {trendData && (
            <Badge
              data-testid="trend-badge"
              className={`${getTrendBadgeColor(trendData.trend)} text-white`}
              aria-label={`Performance trend: ${trendData.trend}`}
            >
              <span className="flex items-center gap-1">
                {getTrendIcon(trendData.trend)}
                <span className="capitalize">{trendData.trend}</span>
              </span>
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Current and PR Values */}
        <div className="mb-4">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-sm text-gray-600">Current:</span>
            <MetricContextTooltip
              metric={metric}
              value={currentValue ?? 0}
              compact
            >
              <span
                data-testid="current-value"
                className="text-2xl sm:text-3xl font-bold text-gray-900"
              >
                {currentValue?.toFixed(2)}
                {units}
              </span>
            </MetricContextTooltip>
          </div>

          {/* PR Display - uses personalRecord if available, otherwise bestValue */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-yellow-600" />
              <span className="text-sm text-gray-600">PR:</span>
            </div>
            <MetricContextTooltip
              metric={metric}
              value={personalRecord?.value ?? bestValue ?? 0}
              compact
            >
              <span
                data-testid="pr-value"
                className="text-xl font-semibold text-yellow-700"
              >
                {personalRecord?.value?.toFixed(2) ?? bestValue?.toFixed(2)}
                {units}
              </span>
            </MetricContextTooltip>
            {personalRecord && (
              <span className="text-xs text-gray-500">
                ({new Date(personalRecord.date).toLocaleDateString()})
              </span>
            )}
            {personalRecord?.isRecent && (
              <Badge
                data-testid="new-pr-badge"
                className="bg-green-500 text-white text-xs"
              >
                New PR!
              </Badge>
            )}
          </div>

          {/* Improvement text */}
          {personalRecord?.improvementText && (
            <p className="text-sm text-green-600 font-medium mt-1 ml-6">
              {personalRecord.improvementText}
            </p>
          )}
        </div>

        {/* Sparkline Chart */}
        <div
          data-testid="sparkline-container"
          className="h-24 mb-3"
          role="img"
          aria-label={`Sparkline chart showing last ${sparklineData.length} ${displayName} measurements`}
        >
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Comparison Text */}
        {trendData && (
          <p
            data-testid="comparison-text"
            className={`text-sm font-medium ${getTrendTextColor(trendData.trend)}`}
            aria-live="polite"
          >
            {trendData.comparisonText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Get trend icon component
 */
function getTrendIcon(trend: TrendDirection | undefined) {
  if (!trend) return null;

  switch (trend) {
    case 'improving':
      return <TrendingUp data-testid="trend-icon-improving" className="h-4 w-4" />;
    case 'declining':
      return <TrendingDown data-testid="trend-icon-declining" className="h-4 w-4" />;
    case 'steady':
      return <Minus data-testid="trend-icon-steady" className="h-4 w-4" />;
  }
}

/**
 * Get badge background color for trend
 */
function getTrendBadgeColor(trend: TrendDirection | undefined): string {
  if (!trend) return 'bg-gray-500';

  switch (trend) {
    case 'improving':
      return 'bg-green-500';
    case 'steady':
      return 'bg-yellow-600'; // Changed from bg-yellow-500 for WCAG AA contrast compliance
    case 'declining':
      return 'bg-red-500';
  }
}

/**
 * Get text color for trend
 */
function getTrendTextColor(trend: TrendDirection | undefined): string {
  if (!trend) return 'text-gray-600';

  switch (trend) {
    case 'improving':
      return 'text-green-600';
    case 'steady':
      return 'text-yellow-600';
    case 'declining':
      return 'text-red-600';
  }
}

/**
 * Get chart line color for trend
 */
function getTrendColor(trend: TrendDirection | undefined): string {
  if (!trend) return '#6b7280'; // gray

  switch (trend) {
    case 'improving':
      return '#10b981'; // green
    case 'steady':
      return '#f59e0b'; // yellow
    case 'declining':
      return '#ef4444'; // red
  }
}
