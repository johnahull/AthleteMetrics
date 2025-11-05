/**
 * Shared date utilities for validation and parsing
 */

import { DATE_CONSTANTS } from './constants';
import { z } from 'zod';

/**
 * Parses a date filter value and extracts the date-only portion (YYYY-MM-DD)
 *
 * @param dateString - Either YYYY-MM-DD or ISO datetime string
 * @returns YYYY-MM-DD string suitable for PostgreSQL DATE column comparison
 * @throws Error if date format is invalid
 *
 * @example
 * parseDateFilter('2024-03-15') // returns '2024-03-15'
 * parseDateFilter('2024-03-15T12:00:00.000Z') // returns '2024-03-15'
 */
export function parseDateFilter(dateString: string): string {
  // Try parsing as YYYY-MM-DD first
  if (DATE_CONSTANTS.DATE_ONLY_REGEX.test(dateString)) {
    // Validate it's a real date
    const parsed = new Date(dateString + DATE_CONSTANTS.START_OF_DAY);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date value: ${dateString}`);
    }
    return dateString;
  }

  // Try parsing as ISO datetime and extract date part
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${dateString}`);
  }

  const dateOnly = parsed.toISOString().split('T')[0];

  // Additional validation that result is YYYY-MM-DD format
  if (!DATE_CONSTANTS.DATE_ONLY_REGEX.test(dateOnly)) {
    throw new Error(`Date parsing resulted in invalid format: ${dateOnly}`);
  }

  return dateOnly;
}

/**
 * Zod schema for validating date strings in YYYY-MM-DD or ISO datetime formats
 * Accepts both formats and validates that the date is parseable
 *
 * Usage:
 * ```typescript
 * const schema = z.object({
 *   dateFrom: dateStringSchema.optional(),
 *   dateTo: dateStringSchema.optional(),
 * });
 * ```
 */
export const dateStringSchema = z.string().refine((val) => {
  try {
    parseDateFilter(val);
    return true;
  } catch {
    return false;
  }
}, { message: "Invalid date format. Expected YYYY-MM-DD or ISO datetime." });
