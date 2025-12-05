/**
 * Dashboard Timeframe Utilities
 * Shared utilities for timeframe filtering with rolling comparison periods
 */

export type TimeframePreset = '7d' | '30d' | '90d' | '180d' | '1y' | 'ytd' | 'all';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ComparisonPeriods {
  current: DateRange;
  prior: DateRange;
  label: string;
  comparisonLabel: string;
}

/**
 * Earliest measurement date in the system (platform launch date)
 * Used for "All Time" timeframe preset
 */
export const PLATFORM_LAUNCH_DATE = new Date(Date.UTC(2020, 0, 1));

export const TIMEFRAME_PRESETS: Array<{ value: TimeframePreset | 'custom'; label: string }> = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: '180d', label: 'Last 180 Days' },
  { value: '1y', label: 'Last 1 Year' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

/**
 * Get the start of the current quarter (Q1: Jan, Q2: Apr, Q3: Jul, Q4: Oct)
 * Uses UTC to avoid timezone issues
 */
function getQuarterStartUTC(year: number, month: number): Date {
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return new Date(Date.UTC(year, quarterStartMonth, 1));
}

/**
 * Calculate date range for a preset timeframe
 * Uses UTC to ensure consistent date calculations regardless of timezone
 */
export function getPresetDateRange(preset: TimeframePreset): DateRange {
  const now = new Date();
  // Use UTC for consistent date calculations
  const todayUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  const end = todayUTC;
  let start: Date;

  switch (preset) {
    case '7d':
      start = new Date(todayUTC);
      start.setUTCDate(start.getUTCDate() - 7);
      break;

    case '30d':
      start = new Date(todayUTC);
      start.setUTCDate(start.getUTCDate() - 30);
      break;

    case '90d':
      start = new Date(todayUTC);
      start.setUTCDate(start.getUTCDate() - 90);
      break;

    case '180d':
      start = new Date(todayUTC);
      start.setUTCDate(start.getUTCDate() - 180);
      break;

    case '1y':
      start = new Date(todayUTC);
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;

    case 'ytd':
      // Year to Date: Jan 1 to today
      start = new Date(Date.UTC(todayUTC.getUTCFullYear(), 0, 1));
      break;

    case 'all':
      // All Time: Platform launch date to today
      start = new Date(PLATFORM_LAUNCH_DATE);
      break;

    default:
      // Default to last 30 days
      start = new Date(todayUTC);
      start.setUTCDate(start.getUTCDate() - 30);
  }

  return { start, end };
}

/**
 * Calculate comparison periods for rolling comparison
 * Prior period has the same duration as current period, immediately preceding it
 */
export function calculateComparisonPeriods(start: Date, end: Date): ComparisonPeriods {
  // Use UTC components from input dates (they may already be in UTC)
  const currentStart = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  ));
  const currentEnd = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate()
  ));

  // Calculate duration in milliseconds
  const durationMs = currentEnd.getTime() - currentStart.getTime();

  // Prior period ends the day before current period starts
  const priorEnd = new Date(currentStart.getTime() - (24 * 60 * 60 * 1000));

  // Prior period starts same duration before prior end
  const priorStart = new Date(priorEnd.getTime() - durationMs);

  return {
    current: {
      start: currentStart,
      end: currentEnd,
    },
    prior: {
      start: priorStart,
      end: priorEnd,
    },
    label: formatDateRange(currentStart, currentEnd),
    comparisonLabel: formatDateRange(priorStart, priorEnd),
  };
}

/**
 * Format date range as human-readable string
 * Examples:
 * - Same month: "Nov 1 - 30, 2024"
 * - Different month, same year: "Oct 15 - Nov 15, 2024"
 * - Different years: "Dec 25, 2023 - Jan 5, 2024"
 * - Single day: "Nov 29, 2024"
 */
export function formatDateRange(start: Date, end: Date): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Use UTC methods since dates are in UTC
  const startMonth = monthNames[start.getUTCMonth()];
  const startDay = start.getUTCDate();
  const startYear = start.getUTCFullYear();

  const endMonth = monthNames[end.getUTCMonth()];
  const endDay = end.getUTCDate();
  const endYear = end.getUTCFullYear();

  // Single day
  if (start.getTime() === end.getTime()) {
    return `${startMonth} ${startDay}, ${startYear}`;
  }

  // Same month and year
  if (start.getUTCMonth() === end.getUTCMonth() && startYear === endYear) {
    return `${startMonth} ${startDay} - ${endDay}, ${startYear}`;
  }

  // Different months, same year
  if (startYear === endYear) {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${startYear}`;
  }

  // Different years
  return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
}
