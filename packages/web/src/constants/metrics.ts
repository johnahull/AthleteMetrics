/**
 * Metric Constants
 *
 * Centralized configuration for performance metrics including display names,
 * units, and helper functions. This eliminates duplication across components.
 */

// =============================================================================
// METRIC DISPLAY NAMES
// =============================================================================

/**
 * Human-readable display names for metric types
 */
export const METRIC_DISPLAY_NAMES: Record<string, string> = {
  FLY10_TIME: '10-Yard Fly',
  VERTICAL_JUMP: 'Vertical Jump',
  AGILITY_505: '5-0-5 Agility',
  AGILITY_5105: '5-10-5 Agility',
  T_TEST: 'T-Test',
  DASH_40YD: '40-Yard Dash',
  TOP_SPEED: 'Top Speed',
  RSI: 'Reactive Strength Index',
};

// =============================================================================
// METRIC UNITS
// =============================================================================

/**
 * Standard units for each metric type
 */
export const METRIC_UNITS: Record<string, string> = {
  FLY10_TIME: 'seconds',
  VERTICAL_JUMP: 'inches',
  AGILITY_505: 'seconds',
  AGILITY_5105: 'seconds',
  T_TEST: 'seconds',
  DASH_40YD: 'seconds',
  TOP_SPEED: 'mph',
  RSI: '',
};

/**
 * Short unit abbreviations for display
 */
export const METRIC_UNIT_ABBREVIATIONS: Record<string, string> = {
  FLY10_TIME: 's',
  VERTICAL_JUMP: 'in',
  AGILITY_505: 's',
  AGILITY_5105: 's',
  T_TEST: 's',
  DASH_40YD: 's',
  TOP_SPEED: 'mph',
  RSI: '',
};

// =============================================================================
// METRIC OPTIMIZATION DIRECTION
// =============================================================================

/**
 * Whether lower values are better for each metric.
 * Used for determining improvement vs decline in progression indicators.
 */
export const METRIC_LOWER_IS_BETTER: Record<string, boolean> = {
  FLY10_TIME: true,      // Faster time = better
  VERTICAL_JUMP: false,  // Higher jump = better
  AGILITY_505: true,     // Faster time = better
  AGILITY_5105: true,    // Faster time = better
  T_TEST: true,          // Faster time = better
  DASH_40YD: true,       // Faster time = better
  TOP_SPEED: false,      // Higher speed = better
  RSI: false,            // Higher RSI = better
};

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
  return METRIC_LOWER_IS_BETTER[metric] ?? true;
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
