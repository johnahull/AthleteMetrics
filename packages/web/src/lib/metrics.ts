// Utility functions for measurement metrics
import {
  LOWER_IS_BETTER_METRICS,
  getMetricTypeWithFallback,
  type MetricType,
  type LowerIsBetterMetric
} from "@shared/analytics-types";

// Re-export for backwards compatibility
export { LOWER_IS_BETTER_METRICS, type LowerIsBetterMetric };

/**
 * Get the metric type for a given metric code
 * Uses LOWER_IS_BETTER_METRICS list for known time-based metrics.
 *
 * IMPORTANT: For derived/custom metrics, prefer using the `useAvailableMetrics` hook
 * which fetches metric types directly from the database (siteMetrics table).
 * This function is provided for utility code that cannot use React hooks.
 *
 * @param metric - Metric code (e.g., 'FLY10_TIME', 'HEIGHT', 'TOP_SPEED_CALC')
 * @param metricTypeOverride - Optional override from database (useAvailableMetrics hook)
 * @returns MetricType - 'lower_is_better', 'higher_is_better', or 'tracking'
 */
export function getMetricType(metric: string, metricTypeOverride?: MetricType): MetricType {
  // Use override from database if provided (preferred)
  if (metricTypeOverride) {
    return metricTypeOverride;
  }

  // Use shared fallback logic from analytics-types
  return getMetricTypeWithFallback(metric);
}

/**
 * Check if a metric is a tracking metric (no better/worse direction)
 * @param metric - Metric code (e.g., 'HEIGHT', 'WEIGHT')
 * @returns boolean - true if tracking metric, false otherwise
 */
export function isTrackingMetric(metric: string): boolean {
  return getMetricType(metric) === 'tracking';
}

/**
 * Check if lower values are better for this metric
 * @param metric - Metric code
 * @returns boolean - true if lower is better, false otherwise
 * @deprecated Use getMetricType() instead for more granular control
 */
export function isLowerIsBetter(metric: string): boolean {
  return getMetricType(metric) === 'lower_is_better';
}

/**
 * Join a value and its unit for display: "2.34 s", "28 in", "99.14%".
 * %, inch (") and foot (') marks attach without a space; no unit gives the bare value.
 */
export function formatValueWithUnit(value: string | number, unit?: string | null): string {
  if (!unit || `${value}`.trim() === '') return `${value}`;
  return /^[%"']/.test(unit) ? `${value}${unit}` : `${value} ${unit}`;
}
