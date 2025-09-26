/**
 * Shared chart color constants for consistent styling across all chart components
 */

export const CHART_COLORS = [
  'rgba(59, 130, 246, 1)',    // Blue
  'rgba(16, 185, 129, 1)',    // Green
  'rgba(239, 68, 68, 1)',     // Red
  'rgba(245, 158, 11, 1)',    // Amber
  'rgba(139, 92, 246, 1)',    // Purple
  'rgba(236, 72, 153, 1)',    // Pink
  'rgba(20, 184, 166, 1)',    // Teal
  'rgba(251, 113, 133, 1)',   // Rose
  'rgba(168, 85, 247, 1)',    // Violet
  'rgba(34, 197, 94, 1)'      // Emerald
] as const;

export const CHART_BACKGROUND_COLORS = CHART_COLORS.map(color =>
  color.replace('1)', '0.6)')
);

export const CHART_HIGHLIGHT_COLORS = CHART_COLORS.map(color =>
  color.replace('1)', '0.8)')
);

/**
 * Get a color by index, cycling through available colors
 */
export const getChartColor = (index: number): string => {
  return CHART_COLORS[index % CHART_COLORS.length];
};

/**
 * Get a background color by index, cycling through available colors
 */
export const getChartBackgroundColor = (index: number): string => {
  return CHART_BACKGROUND_COLORS[index % CHART_BACKGROUND_COLORS.length];
};

/**
 * Get a highlight color by index, cycling through available colors
 */
export const getChartHighlightColor = (index: number): string => {
  return CHART_HIGHLIGHT_COLORS[index % CHART_HIGHLIGHT_COLORS.length];
};