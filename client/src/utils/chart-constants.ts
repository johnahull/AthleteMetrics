/**
 * Shared chart constants for consistent styling across all chart components
 * Consolidates color definitions to prevent duplication
 */

// Athlete colors for distinguishing between different athletes
export const ATHLETE_COLORS = [
  'rgba(59, 130, 246, 1)',    // Blue
  'rgba(16, 185, 129, 1)',    // Green
  'rgba(239, 68, 68, 1)',     // Red
  'rgba(245, 158, 11, 1)',    // Amber
  'rgba(139, 92, 246, 1)',    // Purple
  'rgba(236, 72, 153, 1)',    // Pink
  'rgba(20, 184, 166, 1)',    // Teal
  'rgba(251, 146, 60, 1)',    // Orange
  'rgba(124, 58, 237, 1)',    // Violet
  'rgba(34, 197, 94, 1)'      // Emerald
] as const;

// Metric colors for general chart usage
export const METRIC_COLORS = [
  'rgba(59, 130, 246, 1)',    // Blue
  'rgba(16, 185, 129, 1)',    // Green
  'rgba(239, 68, 68, 1)',     // Red
  'rgba(245, 158, 11, 1)',    // Amber
  'rgba(139, 92, 246, 1)',    // Violet
  'rgba(236, 72, 153, 1)',    // Pink
  'rgba(34, 197, 94, 1)',     // Emerald
  'rgba(251, 113, 133, 1)'    // Rose
] as const;

// Line styles for distinguishing metrics in multi-line charts
export const METRIC_STYLES = [
  { dash: [], opacity: 1, name: 'Solid' },
  { dash: [10, 5], opacity: 1, name: 'Dashed' },
  { dash: [2, 2], opacity: 1, name: 'Dotted' },
  { dash: [10, 5, 2, 5], opacity: 1, name: 'Dash-Dot' },
  { dash: [10, 5, 2, 5, 2, 5], opacity: 1, name: 'Dash-Dot-Dot' },
  { dash: [20, 5], opacity: 1, name: 'Long Dash' }
] as const;

// Default selection count for athlete selector
export const DEFAULT_SELECTION_COUNT = 3;

// Normalized value constants for chart calculations
export const NORMALIZED_MEAN_VALUE = 50;
export const NORMALIZED_MIN_VALUE = 0;
export const NORMALIZED_MAX_VALUE = 100;

/**
 * Get an athlete color by index, cycling through available colors
 */
export const getAthleteColor = (index: number): string => {
  return ATHLETE_COLORS[index % ATHLETE_COLORS.length];
};

/**
 * Get a metric color by index, cycling through available colors
 */
export const getMetricColor = (index: number): string => {
  return METRIC_COLORS[index % METRIC_COLORS.length];
};

/**
 * Get a metric style by index, cycling through available styles
 */
export const getMetricStyle = (index: number) => {
  return METRIC_STYLES[index % METRIC_STYLES.length];
};