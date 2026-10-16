/**
 * Metric Constants
 *
 * Centralized configuration for performance metrics including display names,
 * units, and helper functions. This eliminates duplication across components.
 */

import { isLowerBetterType, type MetricType } from '@shared/analytics-types';

// =============================================================================
// METRIC DISPLAY NAMES
// =============================================================================

/**
 * Human-readable display names for metric types
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 */
export const METRIC_DISPLAY_NAMES: Record<string, string> = {};

// =============================================================================
// METRIC UNITS
// =============================================================================

/**
 * Standard units for each metric type
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 */
export const METRIC_UNITS: Record<string, string> = {};

/**
 * Short unit abbreviations for display
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 */
export const METRIC_UNIT_ABBREVIATIONS: Record<string, string> = {};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the human-readable display name for a metric
 * @param metric - The metric code (e.g., 'FLY10_TIME')
 * @returns The display name (e.g., '10-Yard Fly') or the metric code if not found
 */
export function getMetricDisplayName(metric: string): string {
  return METRIC_DISPLAY_NAMES[metric] || metric;
}

/**
 * Get the unit for a metric
 * @param metric - The metric code
 * @param fallback - Optional fallback value if metric not found
 * @returns The unit string or fallback
 */
export function getMetricUnit(metric: string, fallback?: string): string {
  return METRIC_UNITS[metric] || fallback || '';
}

/**
 * Get the unit abbreviation for a metric
 * @param metric - The metric code
 * @param fallback - Optional fallback value if metric not found
 * @returns The unit abbreviation or fallback
 */
export function getMetricUnitAbbreviation(metric: string, fallback?: string): string {
  return METRIC_UNIT_ABBREVIATIONS[metric] || fallback || '';
}

/**
 * Check if lower values are better for a metric
 * @param metric - The metric code
 * @param metricType - The metric's type from the metric list; without it see resolveMetricType
 * @returns true if lower is better, false if higher is better
 */
export function isLowerBetter(metric: string, metricType?: MetricType): boolean {
  return isLowerBetterType(metric, metricType);
}

/**
 * Determine if a value change represents improvement
 * @param metric - The metric code
 * @param oldValue - Previous measurement value
 * @param newValue - New measurement value
 * @param metricType - The metric's type from the metric list; without it the built-in list decides
 * @returns 'improved' | 'declined' | 'unchanged'
 */
export function getProgressionStatus(
  metric: string,
  oldValue: number,
  newValue: number,
  metricType?: MetricType
): 'improved' | 'declined' | 'unchanged' {
  if (oldValue === newValue) return 'unchanged';

  const lowerIsBetter = isLowerBetter(metric, metricType);
  const improved = lowerIsBetter ? newValue < oldValue : newValue > oldValue;

  return improved ? 'improved' : 'declined';
}
