/**
 * Chart Configuration Constants
 * Centralized configuration for all chart components to improve maintainability
 * and allow easy customization of chart appearance and behavior.
 */

// =============================================================================
// COLOR SCHEMES
// =============================================================================

export const CHART_COLORS = {
  // Primary data series colors
  PRIMARY: 'rgba(59, 130, 246, 1)',      // Blue
  PRIMARY_ALPHA: 'rgba(59, 130, 246, 0.6)',
  PRIMARY_LIGHT: 'rgba(59, 130, 246, 0.2)',
  PRIMARY_STRONG: 'rgba(59, 130, 246, 0.8)',

  // Secondary/highlight colors
  HIGHLIGHT: 'rgba(16, 185, 129, 1)',    // Green
  HIGHLIGHT_ALPHA: 'rgba(16, 185, 129, 0.8)',

  // Alert/average colors
  AVERAGE: 'rgba(239, 68, 68, 1)',       // Red
  AVERAGE_ALPHA: 'rgba(239, 68, 68, 0.6)',

  // Gray/neutral colors
  NEUTRAL: 'rgba(107, 114, 128, 1)',     // Gray
  NEUTRAL_ALPHA: 'rgba(107, 114, 128, 0.8)',
  NEUTRAL_LIGHT: 'rgba(107, 114, 128, 0.1)',

  // Multi-series colors for different athletes/teams
  SERIES: [
    'rgba(59, 130, 246, 1)',   // Blue
    'rgba(16, 185, 129, 1)',   // Green
    'rgba(239, 68, 68, 1)',    // Red
    'rgba(245, 158, 11, 1)',   // Amber
    'rgba(139, 92, 246, 1)',   // Purple
    'rgba(236, 72, 153, 1)',   // Pink
  ],

  // Performance quadrant colors
  QUADRANTS: {
    ELITE: 'rgba(16, 185, 129, 0.1)',      // Green
    GOOD: 'rgba(245, 158, 11, 0.1)',       // Yellow/Amber
    NEEDS_WORK: 'rgba(239, 68, 68, 0.1)',  // Red
    NEUTRAL: 'rgba(156, 163, 175, 0.1)',   // Gray
  },

  // Personal best indicator
  PERSONAL_BEST: 'rgba(255, 215, 0, 1)',   // Gold

  // Border colors
  WHITE: '#fff',
  TRANSPARENT: 'transparent',
} as const;

// =============================================================================
// POINT AND LINE STYLING
// =============================================================================

export const CHART_STYLING = {
  // Point sizes
  POINT_RADIUS: {
    SMALL: 3,
    DEFAULT: 5,
    LARGE: 8,
    HIGHLIGHTED: 8,
    PERSONAL_BEST: 6,
  },

  POINT_HOVER_RADIUS: {
    SMALL: 5,
    DEFAULT: 7,
    LARGE: 10,
    HIGHLIGHTED: 10,
  },

  // Border widths
  BORDER_WIDTH: {
    THIN: 1,
    DEFAULT: 2,
    THICK: 3,
  },

  // Line styling
  LINE_TENSION: 0.1,
  DASHED_LINE: [5, 5],
  DOTTED_LINE: [3, 3],

  // Box plot specific
  BOX_WIDTH: 0.4,
  OUTLIER_MULTIPLIER: 1.5, // IQR multiplier for outliers

  // Chart sizing
  CHART_HEIGHT: {
    SMALL: 200,
    DEFAULT: 400,
    LARGE: 600,
  },

  // Performance thresholds
  CORRELATION_THRESHOLDS: {
    WEAK: 0.3,
    MODERATE: 0.5,
    STRONG: 0.7,
  },
} as const;

// =============================================================================
// STATISTICAL PERCENTILES
// =============================================================================

export const PERCENTILES = {
  P5: 5,
  P10: 10,
  P25: 25,
  P50: 50,   // Median
  P75: 75,
  P90: 90,
  P95: 95,
} as const;

// =============================================================================
// LABEL AND COLLISION DETECTION
// =============================================================================

export const LABEL_CONFIG = {
  // Maximum number of labels to show (performance limit)
  MAX_LABELS: 20,

  // Collision detection
  MIN_LABEL_SPACING: 12, // Minimum pixels between labels
  LABEL_FONT_SIZE: 12,
  LABEL_PADDING: 4,

  // Label positioning
  LABEL_OFFSET: {
    X: 5,
    Y: -5,
  },
} as const;

// =============================================================================
// ANIMATION AND INTERACTION
// =============================================================================

export const ANIMATION_CONFIG = {
  DURATION: 300,
  EASING: 'easeInOut',

  // Hover effects
  HOVER_TRANSITION: 150,
} as const;

// =============================================================================
// CHART TYPE SPECIFIC CONFIGS
// =============================================================================

export const SCATTER_CONFIG = {
  MIN_POINTS_FOR_REGRESSION: 2,
  CHART_PADDING: 0.1, // 10% padding around data bounds
} as const;

export const BOX_PLOT_CONFIG = {
  OUTLIER_RADIUS: 3,
  WHISKER_WIDTH: 0.2,
} as const;

export const DISTRIBUTION_CONFIG = {
  MAX_BINS: 20,
  MIN_BIN_COUNT: 5,
} as const;

// =============================================================================
// RESPONSIVE BREAKPOINTS
// =============================================================================

export const RESPONSIVE_CONFIG = {
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,

  // Reduced sizing for mobile
  MOBILE_POINT_RADIUS: 3,
  MOBILE_FONT_SIZE: 10,
} as const;

// =============================================================================
// ACCESSIBILITY
// =============================================================================

export const ACCESSIBILITY_CONFIG = {
  // High contrast mode colors
  HIGH_CONTRAST: {
    PRIMARY: '#000000',
    SECONDARY: '#0066CC',
    ACCENT: '#FF6600',
    BACKGROUND: '#FFFFFF',
  },

  // WCAG compliant color combinations
  WCAG_COLORS: {
    TEXT_ON_LIGHT: '#1F2937',   // Gray-800
    TEXT_ON_DARK: '#F9FAFB',    // Gray-50
    FOCUS_RING: '#3B82F6',      // Blue-500
  },
} as const;

// =============================================================================
// ALGORITHM CONSTANTS
// =============================================================================

export const ALGORITHM_CONFIG = {
  // Random shuffle algorithms
  RANDOM_SHUFFLE_CENTER: 0.5, // Used in Math.random() - 0.5 for balanced shuffling

  // Percentile calculations
  PERCENTILE_DIVISOR: 100, // Used in (p / 100) * (length - 1) calculations

  // Data limits and validation
  AGE_VALIDATION: {
    MIN_AGE: 10,
    MAX_AGE: 25,
  },

  // Search result limits
  SEARCH_RESULT_LIMIT: 100, // Maximum search results to prevent performance issues

  // Jitter calculations for data visualization
  JITTER_FACTOR: 0.5, // Used in (Math.random() - 0.5) * jitterRange

  // Label collision detection configuration
  COLLISION_DETECTION: {
    MAX_LABELS: 20, // Maximum number of labels to render for performance
    PADDING: 6, // Minimum padding between labels in pixels
    TEXT_HEIGHT: 12, // Standard text height for collision calculations
    GRID_SIZE: 50, // Grid cell size for spatial indexing (pixels)
    MAX_ITERATIONS: 5, // Maximum attempts to resolve collisions per label
  },
} as const;

// =============================================================================
// EXPORT ALL CONFIGS
// =============================================================================

export const CHART_CONFIG = {
  SCATTER: {
    CHART_PADDING: 0.1
  },
  COLORS: CHART_COLORS,
  STYLING: CHART_STYLING,
  PERCENTILES,
  LABELS: LABEL_CONFIG,
  ANIMATION: ANIMATION_CONFIG,
  SCATTER: SCATTER_CONFIG,
  BOX_PLOT: BOX_PLOT_CONFIG,
  DISTRIBUTION: DISTRIBUTION_CONFIG,
  RESPONSIVE: RESPONSIVE_CONFIG,
  ACCESSIBILITY: ACCESSIBILITY_CONFIG,
  ALGORITHM: ALGORITHM_CONFIG,
} as const;

export default CHART_CONFIG;