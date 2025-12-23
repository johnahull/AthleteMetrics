/**
 * Metric Constants
 *
 * Centralized configuration for performance metrics including display names,
 * units, and helper functions. This eliminates duplication across components.
 */

import { LOWER_IS_BETTER_METRICS } from '@shared/analytics-types';

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
// METRIC OPTIMIZATION DIRECTION
// =============================================================================

/**
 * Whether lower values are better for each metric.
 * Used for determining improvement vs decline in progression indicators.
 * @deprecated Use database (site_metrics table) via useMetricConfig hook
 */
export const METRIC_LOWER_IS_BETTER: Record<string, boolean> = {};

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
 * @returns true if lower is better, false if higher is better
 */
export function isLowerBetter(metric: string): boolean {
  // Check deprecated static config first
  const configValue = METRIC_LOWER_IS_BETTER[metric];
  if (configValue !== undefined) {
    return configValue;
  }
  // Fall back to known lower-is-better metrics list
  if (LOWER_IS_BETTER_METRICS.includes(metric as typeof LOWER_IS_BETTER_METRICS[number])) {
    return true;
  }
  // Default: higher is better (most performance metrics)
  return false;
}

/**
 * Determine if a value change represents improvement
 * @param metric - The metric code
 * @param oldValue - Previous measurement value
 * @param newValue - New measurement value
 * @returns 'improved' | 'declined' | 'unchanged'
 */
export function getProgressionStatus(
  metric: string,
  oldValue: number,
  newValue: number
): 'improved' | 'declined' | 'unchanged' {
  if (oldValue === newValue) return 'unchanged';

  const lowerIsBetter = isLowerBetter(metric);
  const improved = lowerIsBetter ? newValue < oldValue : newValue > oldValue;

  return improved ? 'improved' : 'declined';
}
