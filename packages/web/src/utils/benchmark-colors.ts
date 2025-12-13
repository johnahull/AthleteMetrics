/**
 * Shared utility for benchmark achievement rate color thresholds
 *
 * Used across BenchmarkCard and BenchmarkDashboardWidget components
 * to ensure consistent color coding for achievement rates.
 *
 * WCAG Accessibility: Colors are combined with visual indicators (icons/symbols)
 * to ensure information is conveyed through multiple channels, not color alone.
 */

/**
 * Achievement rate thresholds for color-coding
 */
export const ACHIEVEMENT_RATE_THRESHOLDS = {
  EXCELLENT: 75,  // >= 75% achievement rate
  GOOD: 50,       // >= 50% achievement rate
} as const;

/**
 * Visual indicators for achievement rates (WCAG compliance)
 * Uses symbols that convey meaning beyond color
 */
export const ACHIEVEMENT_RATE_INDICATORS = {
  EXCELLENT: '✓',  // Checkmark for excellent performance
  GOOD: '○',       // Circle for good performance
  NEEDS_IMPROVEMENT: '!',  // Exclamation for needs improvement
} as const;

/**
 * Get Tailwind CSS classes for progress bar based on achievement rate
 *
 * @param rate - Achievement rate percentage (0-100)
 * @returns Object containing bg (background) and text (text color) Tailwind classes
 */
export function getBenchmarkProgressColor(rate: number): {
  bg: string;
  text: string;
} {
  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.EXCELLENT) {
    return {
      bg: 'bg-green-500',
      text: 'text-green-600',
    };
  }

  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.GOOD) {
    return {
      bg: 'bg-yellow-500',
      text: 'text-yellow-600',
    };
  }

  return {
    bg: 'bg-orange-500',
    text: 'text-orange-600',
  };
}

/**
 * Get simple color name based on achievement rate
 *
 * @param rate - Achievement rate percentage (0-100)
 * @returns Color name: 'green', 'yellow', or 'orange'
 */
export function getBenchmarkProgressColorName(rate: number): 'green' | 'yellow' | 'orange' {
  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.EXCELLENT) return 'green';
  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.GOOD) return 'yellow';
  return 'orange';
}

/**
 * Get visual indicator symbol based on achievement rate
 * Used for WCAG accessibility to convey information beyond color
 *
 * @param rate - Achievement rate percentage (0-100)
 * @returns Symbol character: '✓', '○', or '!'
 */
export function getBenchmarkProgressIndicator(rate: number): string {
  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.EXCELLENT) {
    return ACHIEVEMENT_RATE_INDICATORS.EXCELLENT;
  }
  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.GOOD) {
    return ACHIEVEMENT_RATE_INDICATORS.GOOD;
  }
  return ACHIEVEMENT_RATE_INDICATORS.NEEDS_IMPROVEMENT;
}

/**
 * Get accessibility label for achievement rate
 * Provides screen reader-friendly description
 *
 * @param rate - Achievement rate percentage (0-100)
 * @returns Descriptive label for screen readers
 */
export function getBenchmarkProgressLabel(rate: number): string {
  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.EXCELLENT) {
    return 'Excellent achievement rate';
  }
  if (rate >= ACHIEVEMENT_RATE_THRESHOLDS.GOOD) {
    return 'Good achievement rate';
  }
  return 'Needs improvement';
}
