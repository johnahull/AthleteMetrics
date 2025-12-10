/**
 * MeasurementProgressChart Component
 *
 * Displays measurement progress over time as a line chart.
 * Shows values on Y-axis and dates on X-axis.
 * Includes an optional trend line using linear regression.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions, ChartDataset } from 'chart.js';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, TrendingUp } from 'lucide-react';
import type { Measurement } from '@shared/schema';
import { getMetricDisplayName, getMetricUnit, isLowerBetter } from '@/constants/metrics';

// Import chart setup to register Chart.js components
import '@/lib/chart-setup';

// Constants
const TREND_LINE_LABEL = 'Trend';

/**
 * Safely parse a string value to float, returning 0 for invalid values
 */
function safeParseFloat(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Calculate linear regression for trend line using ordinary least squares.
 * Returns slope and intercept for y = mx + b.
 *
 * @param values - Array of y-values to fit the trend line to
 * @returns Object with slope and intercept coefficients
 */
function calculateLinearRegression(values: number[]): { slope: number; intercept: number } {
  // Filter out NaN and Infinity values
  const validValues = values.filter(v => Number.isFinite(v));
  const n = validValues.length;

  if (n < 2) return { slope: 0, intercept: validValues[0] || 0 };

  // x values are indices (0, 1, 2, ...)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += validValues[i];
    sumXY += i * validValues[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Guard against NaN results from numerical instability
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
    return { slope: 0, intercept: sumY / n };
  }

  return { slope, intercept };
}

/**
 * Generate trend line data points using linear regression.
 * Returns an array of y-values representing the best-fit line
 * at each x position (0, 1, 2, ..., n-1).
 *
 * @param values - Array of y-values to fit the trend line to
 * @returns Array of trend line y-values with same length as input
 */
function generateTrendLine(values: number[]): number[] {
  const { slope, intercept } = calculateLinearRegression(values);
  return values.map((_, i) => slope * i + intercept);
}

export interface MeasurementProgressChartProps {
  measurements: Measurement[];
  isLoading?: boolean;
  showBestOnly?: boolean;
  onShowBestOnlyChange?: (value: boolean) => void;
  showTrendLine?: boolean;
  onShowTrendLineChange?: (value: boolean) => void;
}

export function MeasurementProgressChart({
  measurements,
  isLoading = false,
  showBestOnly = false,
  onShowBestOnlyChange,
  showTrendLine: controlledShowTrendLine,
  onShowTrendLineChange,
}: MeasurementProgressChartProps) {
  // Internal state for trend line if not controlled externally
  const [internalShowTrendLine, setInternalShowTrendLine] = useState(true);
  const showTrendLine = controlledShowTrendLine ?? internalShowTrendLine;
  const handleTrendLineChange = onShowTrendLineChange ?? setInternalShowTrendLine;

  // Check if measurements have mixed metrics
  const uniqueMetrics = useMemo(() => {
    const metrics = new Set(measurements.map(m => m.metric));
    return Array.from(metrics);
  }, [measurements]);

  const hasMixedMetrics = uniqueMetrics.length > 1;

  // Track the displayed measurements for tooltip lookup
  const displayedMeasurementsRef = useRef<Measurement[]>([]);

  // Prepare sorted and filtered measurements (separate from chart rendering)
  const processedData = useMemo(() => {
    if (measurements.length === 0) {
      return null;
    }

    let sorted = [...measurements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Filter to best per date if showBestOnly is true
    if (showBestOnly) {
      const metric = sorted[0]?.metric || '';
      const lowerIsBetter = isLowerBetter(metric);
      const bestByDate = new Map<string, Measurement>();

      for (const m of sorted) {
        const existing = bestByDate.get(m.date);
        if (!existing) {
          bestByDate.set(m.date, m);
        } else {
          const existingValue = safeParseFloat(existing.value);
          const currentValue = safeParseFloat(m.value);
          const isBetter = lowerIsBetter
            ? currentValue < existingValue
            : currentValue > existingValue;
          if (isBetter) {
            bestByDate.set(m.date, m);
          }
        }
      }

      sorted = Array.from(bestByDate.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    }

    const data = sorted.map(m => safeParseFloat(m.value));
    const metric = sorted[0]?.metric || '';
    const units = sorted[0]?.units || '';

    return { sorted, data, metric, units };
  }, [measurements, showBestOnly]);

  // Calculate trend line data (only when data changes, not when toggle changes)
  const trendData = useMemo(() => {
    if (!processedData || processedData.data.length < 2) {
      return null;
    }
    return generateTrendLine(processedData.data);
  }, [processedData]);

  // Build chart data (recompute when trend line visibility changes)
  const chartData = useMemo(() => {
    if (!processedData) {
      return null;
    }

    const { sorted, data, metric, units } = processedData;

    // Store displayed measurements for tooltip lookup
    displayedMeasurementsRef.current = sorted;

    const labels = sorted.map(m => {
      const date = new Date(m.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Build datasets array with proper typing
    const datasets: ChartDataset<'line', number[]>[] = [
      {
        label: `${getMetricDisplayName(metric)} (${getMetricUnit(metric, units)})`,
        data,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        pointBackgroundColor: sorted.map(m =>
          m.isVerified ? 'rgb(59, 130, 246)' : 'rgb(245, 158, 11)'
        ),
        pointBorderColor: sorted.map(m =>
          m.isVerified ? 'rgb(59, 130, 246)' : 'rgb(245, 158, 11)'
        ),
        pointRadius: 6,
        tension: 0.3,
        order: 1, // Draw data points on top
      },
    ];

    // Add trend line dataset if enabled and we have enough data points
    if (showTrendLine && trendData) {
      datasets.push({
        label: TREND_LINE_LABEL,
        data: trendData,
        borderColor: 'rgb(156, 163, 175)', // Gray-400
        backgroundColor: 'transparent',
        borderDash: [6, 4], // Dashed line
        borderWidth: 2,
        pointRadius: 0, // No points on trend line
        tension: 0, // Straight line
        order: 2, // Draw trend line behind data points
      });
    }

    return {
      labels,
      datasets,
    };
  }, [processedData, showTrendLine, trendData]);

  const chartOptions: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
        },
        tooltip: {
          callbacks: {
            afterLabel: (context) => {
              // Skip verification status for trend line
              if (context.dataset.label === TREND_LINE_LABEL) {
                return '';
              }
              // Use displayed measurements ref for correct index after filtering
              const measurement = displayedMeasurementsRef.current[context.dataIndex];
              return measurement?.isVerified ? 'Official' : 'Self-entered';
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date',
          },
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Value',
          },
        },
      },
    }),
    [] // Static options - tooltip uses ref for measurement lookup
  );

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="chart-loading-skeleton" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Mixed metrics warning
  if (hasMixedMetrics) {
    return (
      <div
        data-testid="measurement-progress-chart"
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
        <p className="text-gray-600">
          Please select a single metric to view the progress chart.
        </p>
      </div>
    );
  }

  // Empty state
  if (measurements.length === 0 || !chartData) {
    return (
      <div
        data-testid="measurement-progress-chart"
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-gray-500">No measurements to display.</p>
      </div>
    );
  }

  return (
    <div data-testid="measurement-progress-chart" className="space-y-4">
      {/* Chart Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Toggle for Best/All - only show if controlled externally */}
        {onShowBestOnlyChange && (
          <div className="flex items-center gap-4">
            <span id="chart-filter-label" className="text-sm font-medium text-gray-700">Show:</span>
            <RadioGroup
              aria-labelledby="chart-filter-label"
              value={showBestOnly ? 'best' : 'all'}
              onValueChange={(value) => onShowBestOnlyChange(value === 'best')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="best" id="show-best" />
                <Label htmlFor="show-best" className="text-sm cursor-pointer">
                  Best per date
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="show-all" />
                <Label htmlFor="show-all" className="text-sm cursor-pointer">
                  All entries
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Trend Line Toggle */}
        {measurements.length >= 2 && (
          <div className="flex items-center gap-2">
            <Switch
              id="show-trend-line"
              checked={showTrendLine}
              onCheckedChange={handleTrendLineChange}
            />
            <Label
              htmlFor="show-trend-line"
              className="text-sm cursor-pointer flex items-center gap-1.5"
            >
              <TrendingUp className="h-4 w-4 text-gray-500" />
              Trend line
            </Label>
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        className="h-80"
        role="img"
        aria-label={`Line chart showing ${getMetricDisplayName(measurements[0]?.metric || '')} progress over time${showTrendLine ? ' with trend line' : ''}`}
      >
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

export default MeasurementProgressChart;
