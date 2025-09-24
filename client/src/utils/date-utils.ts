/**
 * Date Utility Functions
 *
 * Centralized date handling utilities to fix inconsistent date handling
 * across the application. Provides safe date parsing, validation, and
 * formatting functions with proper error handling.
 */

import type { DateParseResult, DateRange } from '@/types/chart-types';

// =============================================================================
// DATE PARSING AND VALIDATION
// =============================================================================

/**
 * Safely parse a date string or Date object with validation
 *
 * @param input - Date string, Date object, or number (timestamp)
 * @returns DateParseResult with success status and parsed date or error
 */
export function safeParseDate(input: string | Date | number | null | undefined): DateParseResult {
  if (!input) {
    return {
      success: false,
      date: null,
      error: 'Input is null or undefined'
    };
  }

  try {
    let date: Date;

    if (input instanceof Date) {
      date = input;
    } else if (typeof input === 'number') {
      date = new Date(input);
    } else if (typeof input === 'string') {
      // Handle various string formats
      const trimmed = input.trim();
      if (trimmed === '') {
        return {
          success: false,
          date: null,
          error: 'Empty string provided'
        };
      }
      date = new Date(trimmed);
    } else {
      return {
        success: false,
        date: null,
        error: 'Invalid input type'
      };
    }

    // Validate the parsed date
    if (isNaN(date.getTime())) {
      return {
        success: false,
        date: null,
        error: 'Invalid date format'
      };
    }

    return {
      success: true,
      date,
      error: undefined
    };
  } catch (error) {
    return {
      success: false,
      date: null,
      error: error instanceof Error ? error.message : 'Unknown parsing error'
    };
  }
}

/**
 * Check if a date is valid
 *
 * @param date - Date object to validate
 * @returns true if date is valid, false otherwise
 */
export function isValidDate(date: Date | null | undefined): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Get current date with time set to start of day (00:00:00)
 *
 * @returns Date object set to start of current day
 */
export function getCurrentDateStartOfDay(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Get current date with time set to end of day (23:59:59.999)
 *
 * @returns Date object set to end of current day
 */
export function getCurrentDateEndOfDay(): Date {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

// =============================================================================
// DATE COMPARISON AND FILTERING
// =============================================================================

/**
 * Check if a date falls within a date range (inclusive)
 *
 * @param date - Date to check
 * @param range - Date range with start and end dates
 * @returns true if date is within range, false otherwise
 */
export function isDateInRange(date: Date, range: DateRange): boolean {
  if (!isValidDate(date) || !isValidDate(range.start) || !isValidDate(range.end)) {
    return false;
  }

  const dateTime = date.getTime();
  const startTime = range.start.getTime();
  const endTime = range.end.getTime();

  return dateTime >= startTime && dateTime <= endTime;
}

/**
 * Filter an array of data points by date range
 *
 * @param data - Array of objects with date property
 * @param start - Start date (inclusive)
 * @param end - End date (inclusive)
 * @param dateKey - Key name for the date property (defaults to 'date')
 * @returns Filtered array containing only items within the date range
 */
export function filterByDateRange<T extends Record<string, any>>(
  data: T[],
  start: Date | string | null,
  end: Date | string | null,
  dateKey: string = 'date'
): T[] {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const startResult = safeParseDate(start);
  const endResult = safeParseDate(end);

  if (!startResult.success || !endResult.success) {
    console.warn('Invalid date range provided to filterByDateRange:', { start, end });
    return data; // Return all data if date range is invalid
  }

  return data.filter(item => {
    const itemDateResult = safeParseDate(item[dateKey]);
    if (!itemDateResult.success || !itemDateResult.date) {
      return false;
    }

    return isDateInRange(itemDateResult.date, {
      start: startResult.date!,
      end: endResult.date!
    });
  });
}

// =============================================================================
// DATE FORMATTING
// =============================================================================

/**
 * Format date for consistent display
 *
 * @param date - Date to format
 * @param options - Intl.DateTimeFormatOptions for customization
 * @returns Formatted date string or empty string if invalid
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }
): string {
  const parseResult = safeParseDate(date);

  if (!parseResult.success || !parseResult.date) {
    return '';
  }

  try {
    return parseResult.date.toLocaleDateString('en-US', options);
  } catch (error) {
    console.warn('Error formatting date:', error);
    return '';
  }
}

/**
 * Format date for chart axis labels
 *
 * @param date - Date to format
 * @returns Short date format suitable for chart axes
 */
export function formatDateForChart(date: Date | string | number | null | undefined): string {
  return formatDate(date, {
    month: 'short',
    day: 'numeric',
    year: '2-digit'
  });
}

/**
 * Format date as ISO string with timezone handling
 *
 * @param date - Date to format
 * @returns ISO string or empty string if invalid
 */
export function formatDateISO(date: Date | string | number | null | undefined): string {
  const parseResult = safeParseDate(date);

  if (!parseResult.success || !parseResult.date) {
    return '';
  }

  try {
    return parseResult.date.toISOString();
  } catch (error) {
    console.warn('Error formatting date to ISO:', error);
    return '';
  }
}

// =============================================================================
// DATE CALCULATIONS
// =============================================================================

/**
 * Add days to a date safely
 *
 * @param date - Base date
 * @param days - Number of days to add (can be negative)
 * @returns New date with days added, or null if input is invalid
 */
export function addDays(date: Date | string | number | null | undefined, days: number): Date | null {
  const parseResult = safeParseDate(date);

  if (!parseResult.success || !parseResult.date) {
    return null;
  }

  const newDate = new Date(parseResult.date);
  newDate.setDate(newDate.getDate() + days);

  return newDate;
}

/**
 * Get the difference between two dates in days
 *
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of days between dates, or null if either date is invalid
 */
export function getDaysDifference(
  date1: Date | string | number | null | undefined,
  date2: Date | string | number | null | undefined
): number | null {
  const parse1 = safeParseDate(date1);
  const parse2 = safeParseDate(date2);

  if (!parse1.success || !parse2.success || !parse1.date || !parse2.date) {
    return null;
  }

  const timeDiff = parse1.date.getTime() - parse2.date.getTime();
  return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
}

/**
 * Get start of day for any date
 *
 * @param date - Date to get start of day for
 * @returns New date set to start of day, or null if invalid
 */
export function getStartOfDay(date: Date | string | number | null | undefined): Date | null {
  const parseResult = safeParseDate(date);

  if (!parseResult.success || !parseResult.date) {
    return null;
  }

  const startOfDay = new Date(parseResult.date);
  startOfDay.setHours(0, 0, 0, 0);

  return startOfDay;
}

/**
 * Get end of day for any date
 *
 * @param date - Date to get end of day for
 * @returns New date set to end of day, or null if invalid
 */
export function getEndOfDay(date: Date | string | number | null | undefined): Date | null {
  const parseResult = safeParseDate(date);

  if (!parseResult.success || !parseResult.date) {
    return null;
  }

  const endOfDay = new Date(parseResult.date);
  endOfDay.setHours(23, 59, 59, 999);

  return endOfDay;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Get current year
 *
 * @returns Current year as number
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Create a date range for the current year
 *
 * @returns DateRange object spanning the current year
 */
export function getCurrentYearRange(): DateRange {
  const currentYear = getCurrentYear();
  return {
    start: new Date(currentYear, 0, 1), // January 1st
    end: new Date(currentYear, 11, 31, 23, 59, 59, 999) // December 31st end of day
  };
}

/**
 * Create a date range for a specific year
 *
 * @param year - Year to create range for
 * @returns DateRange object spanning the specified year
 */
export function getYearRange(year: number): DateRange {
  return {
    start: new Date(year, 0, 1), // January 1st
    end: new Date(year, 11, 31, 23, 59, 59, 999) // December 31st end of day
  };
}

/**
 * Ensure a date is not in the future (for validation)
 *
 * @param date - Date to validate
 * @param maxDate - Maximum allowed date (defaults to current date)
 * @returns true if date is not in the future, false otherwise
 */
export function isNotInFuture(
  date: Date | string | number | null | undefined,
  maxDate: Date = new Date()
): boolean {
  const parseResult = safeParseDate(date);

  if (!parseResult.success || !parseResult.date) {
    return false;
  }

  return parseResult.date.getTime() <= maxDate.getTime();
}