/**
 * Utility functions for calculating metric trends and statistics
 *
 * Supports trend analysis for performance metrics with:
 * - Trend direction: improving, steady, or declining
 * - Percentage change calculations
 * - Lower-is-better vs higher-is-better metrics
 * - Edge case handling (< 10 measurements, missing data)
 */

import { isLowerBetter } from '@/constants/metrics';

export type TrendDirection = 'improving' | 'steady' | 'declining';

export interface MetricTrendData {
  trend: TrendDirection;
  percentChange: number;
  comparisonText: string;
  recentAverage: number;
  previousAverage: number;
}

interface Measurement {
  value: string | number;
  date: string;
}

/**
 * Calculate trend based on last 5 measurements vs previous 5
 *
 * @param measurements - Array of measurements sorted by date (newest first)
 * @param metric - The metric type (e.g., 'FLY10_TIME', 'VERTICAL_JUMP')
 * @returns Trend data with direction, percentage change, and comparison text
 */
export function calculateMetricTrend(
  measurements: Measurement[],
  metric: string
): MetricTrendData | null {
  // Need at least 2 measurements to calculate trend
  if (measurements.length < 2) {
    return null;
  }

  // Sort measurements by date (newest first)
  const sortedMeasurements = [...measurements].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Split into recent (last 5) and previous (next 5)
  const recentCount = Math.min(5, Math.floor(sortedMeasurements.length / 2));
  const recentMeasurements = sortedMeasurements.slice(0, recentCount);
  const previousMeasurements = sortedMeasurements.slice(
    recentCount,
    recentCount * 2
  );

  // If we don't have previous measurements, compare to overall average
  if (previousMeasurements.length === 0) {
    const recentAvg = calculateAverage(recentMeasurements);
    const overallAvg = calculateAverage(sortedMeasurements);

    const percentChange = calculatePercentChange(overallAvg, recentAvg);
    const trend = determineTrend(percentChange, metric);
    const comparisonText = generateComparisonText(trend, percentChange, metric);

    return {
      trend,
      percentChange: Math.abs(percentChange),
      comparisonText,
      recentAverage: recentAvg,
      previousAverage: overallAvg,
    };
  }

  // Calculate averages
  const recentAvg = calculateAverage(recentMeasurements);
  const previousAvg = calculateAverage(previousMeasurements);

  // Calculate percent change
  const percentChange = calculatePercentChange(previousAvg, recentAvg);

  // Determine trend direction
  const trend = determineTrend(percentChange, metric);

  // Generate comparison text
  const comparisonText = generateComparisonText(trend, percentChange, metric);

  return {
    trend,
    percentChange: Math.abs(percentChange),
    comparisonText,
    recentAverage: recentAvg,
    previousAverage: previousAvg,
  };
}

/**
 * Calculate average value from measurements
 */
function calculateAverage(measurements: Measurement[]): number {
  if (measurements.length === 0) return 0;

  const sum = measurements.reduce((acc, m) => {
    return acc + parseFloat(String(m.value));
  }, 0);

  return sum / measurements.length;
}

/**
 * Calculate percentage change between two values
 */
function calculatePercentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Determine trend direction based on percent change and metric type
 *
 * For "lower is better" metrics: negative % change = improving
 * For "higher is better" metrics: positive % change = improving
 *
 * Steady threshold: < 5% change
 */
function determineTrend(percentChange: number, metric: string): TrendDirection {
  const STEADY_THRESHOLD = 5; // Less than 5% change is considered steady

  if (Math.abs(percentChange) < STEADY_THRESHOLD) {
    return 'steady';
  }

  const lowerIsBetter = isLowerBetter(metric);

  if (lowerIsBetter) {
    // For time-based metrics, negative change is improving
    return percentChange < 0 ? 'improving' : 'declining';
  } else {
    // For distance/height metrics, positive change is improving
    return percentChange > 0 ? 'improving' : 'declining';
  }
}

/**
 * Generate human-readable comparison text
 */
function generateComparisonText(
  trend: TrendDirection,
  percentChange: number,
  metric: string
): string {
  const absChange = Math.abs(percentChange).toFixed(1);

  if (trend === 'steady') {
    return `Steady performance (${absChange}% change)`;
  }

  const direction = trend === 'improving' ? '↑' : '↓';
  const descriptor = trend === 'improving' ? 'better' : 'worse';

  return `${direction} ${absChange}% ${descriptor} than previous period`;
}

/**
 * Get sparkline data points from measurements
 * Returns last N measurements sorted by date (oldest to newest for charting)
 */
export function getSparklineData(
  measurements: Measurement[],
  count: number = 10
): number[] {
  const sortedMeasurements = [...measurements]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-count);

  return sortedMeasurements.map((m) => parseFloat(String(m.value)));
}

/**
 * Get best value for a metric
 */
export function getBestValue(
  measurements: Measurement[],
  metric: string
): number | null {
  if (measurements.length === 0) return null;

  const lowerIsBetter = isLowerBetter(metric);

  const values = measurements.map((m) => parseFloat(String(m.value)));

  return lowerIsBetter ? Math.min(...values) : Math.max(...values);
}
