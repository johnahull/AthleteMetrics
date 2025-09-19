// Constants for TimeSeriesBoxSwarmChart configuration
export const TIME_SERIES_CHART_CONSTANTS = {
  // Box plot dimensions
  BOX_WIDTH: 0.3,
  CAP_WIDTH_RATIO: 0.5, // Relative to box width

  // Collision detection
  MAX_COLLISION_ITERATIONS: 25,
  LABEL_PADDING: 6,
  TEXT_HEIGHT: 12,

  // Point styling
  POINT_RADIUS: 6,
  JITTER_RANGE: 0.3,

  // Label positioning
  BASE_OFFSET_X: 8,
  LABEL_OFFSET_STRATEGIES: {
    FURTHER_RIGHT: 30,
    FURTHER_LEFT: 20,
    LARGE_SPACING_X: 40,
    LARGE_SPACING_Y: 15,
    VERTICAL_SPACING: 20
  },

  // Chart bounds
  CHART_EDGE_PADDING: {
    RIGHT: 10,
    TOP: 6,
    BOTTOM: 6,
    LEFT: 0
  },

  // Scale bounds
  SCALE_PADDING: 0.5,

  // Text styling
  FONT_SIZE: 10,
  FONT_FAMILY: 'Arial',
  TEXT_BACKGROUND_ALPHA: 0.8,
  TEXT_COLOR_ALPHA: 0.8,
  BACKGROUND_PADDING: 2,

  // Animation
  ANIMATION_DURATION: 750,

  // Layout padding
  LAYOUT_PADDING: 10
} as const;

// Color palette for athletes - extracted from component
export const ATHLETE_COLORS = [
  'rgba(59, 130, 246, 0.8)',    // Blue
  'rgba(16, 185, 129, 0.8)',    // Green
  'rgba(239, 68, 68, 0.8)',     // Red
  'rgba(245, 158, 11, 0.8)',    // Amber
  'rgba(139, 92, 246, 0.8)',    // Purple
  'rgba(236, 72, 153, 0.8)',    // Pink
  'rgba(20, 184, 166, 0.8)',    // Teal
  'rgba(251, 146, 60, 0.8)',    // Orange
  'rgba(124, 58, 237, 0.8)',    // Violet
  'rgba(34, 197, 94, 0.8)'      // Emerald
] as const;

// Box plot component colors
export const BOX_PLOT_COLORS = {
  BOX_BORDER: 'rgba(75, 85, 99, 0.8)',
  BOX_BACKGROUND: 'rgba(75, 85, 99, 0.1)',
  MEDIAN_LINE: 'rgba(75, 85, 99, 1)',
  MEAN_LINE: 'rgba(239, 68, 68, 1)',
  WHISKER: 'rgba(75, 85, 99, 0.6)',
  CAPS: 'rgba(75, 85, 99, 0.8)'
} as const;

// Personal best indicator
export const PERSONAL_BEST = {
  COLOR: 'gold',
  ICON: '⭐',
  SUFFIX: ' (Personal Best)'
} as const;