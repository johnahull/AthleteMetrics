/**
 * Shared utility for benchmark achievement rate color thresholds
 *
 * Used across BenchmarkCard and BenchmarkDashboardWidget components
 * to ensure consistent color coding for achievement rates.
 */

/**
 * Achievement rate thresholds for color-coding
 */
export const ACHIEVEMENT_RATE_THRESHOLDS = {
  EXCELLENT: 75,  // >= 75% achievement rate
  GOOD: 50,       // >= 50% achievement rate
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
