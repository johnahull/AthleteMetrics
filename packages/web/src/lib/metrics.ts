// Utility functions for measurement metrics
import { Clock } from "lucide-react";
import { METRIC_CONFIG, LOWER_IS_BETTER_METRICS, type MetricType, type LowerIsBetterMetric } from "@shared/analytics-types";

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

  // Check METRIC_CONFIG first (may be empty, but kept for compatibility)
  const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  if (config?.metricType) {
    return config.metricType;
  }

  // Fall back to known lower-is-better metrics
  if (LOWER_IS_BETTER_METRICS.includes(metric as any)) {
    return 'lower_is_better';
  }

  // Default to higher_is_better as most performance metrics are higher-is-better
  return 'higher_is_better';
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
 * Get the display name for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns The metric code (fallback behavior after removing hardcoded definitions)
 */
export function getMetricDisplayName(metric: string): string {
  return metric;
}

/**
 * Get the badge variant for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns "secondary" (fallback behavior after removing hardcoded definitions)
 */
export function getMetricBadgeVariant(metric: string): "default" | "secondary" | "destructive" | "outline" {
  return "secondary";
}

/**
 * Get the color class for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns "bg-gray-100 text-gray-800" (fallback behavior after removing hardcoded definitions)
 */
export function getMetricColor(metric: string): string {
  return "bg-gray-100 text-gray-800";
}

/**
 * Get the units for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns Empty string (fallback behavior after removing hardcoded definitions)
 */
export function getMetricUnits(metric: string): string {
  return "";
}

/**
 * Get the icon for a metric
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @returns Clock icon (fallback behavior after removing hardcoded definitions)
 */
export function getMetricIcon(metric: string) {
  return Clock;
}

/**
 * Format a metric value
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 * @param metric - Metric code
 * @param value - The value to format
 * @returns Plain number string (fallback behavior after removing hardcoded definitions)
 */
export function formatMetricValue(metric: string, value: number): string {
  return `${value}`;
}