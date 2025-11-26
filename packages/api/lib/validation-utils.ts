/**
 * Validation utilities for wellness routes
 */

/**
 * Validates that a string is a valid date in YYYY-MM-DD format
 * @param dateStr - The date string to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated date string
 * @throws Error if invalid
 */
export function validateDateString(dateStr: string | undefined | null, fieldName: string): string {
  if (!dateStr) {
    throw new Error(`${fieldName} is required`);
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format`);
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`${fieldName} is not a valid date`);
  }
  return dateStr;
}

/**
 * Validates that all question IDs in an array are valid UUIDs
 * @param ids - Comma-separated string of IDs or undefined
 * @param maxCount - Maximum number of IDs allowed
 * @returns Array of validated question IDs
 */
export function validateQuestionIds(ids: string | undefined, maxCount: number): string[] {
  if (!ids) return [];

  const idArray = ids.split(',').map(id => id.trim()).filter(id => id.length > 0);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const validatedIds = idArray
    .filter(id => uuidRegex.test(id))
    .slice(0, maxCount);

  return validatedIds;
}

/**
 * Validates a date range (start date must be before or equal to end date)
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @param maxDays - Maximum days allowed between start and end
 * @throws Error if invalid range
 */
export function validateDateRange(startDate: string, endDate: string, maxDays: number): void {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw new Error('Start date must be before or equal to end date');
  }

  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > maxDays) {
    throw new Error(`Date range cannot exceed ${maxDays} days`);
  }
}

/**
 * Limits array size to prevent DoS attacks
 * Returns a truncated copy of the array if it exceeds the limit
 * @param arr - The array to limit
 * @param maxSize - Maximum size allowed
 * @param _label - Optional label for logging (unused, but kept for API compatibility)
 */
export function limitArraySize<T>(arr: T[], maxSize: number, _label?: string): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxSize);
}

/**
 * Validates that a string is a valid UUID
 */
export function isValidUUID(str: string | undefined | null): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Sanitizes a string for safe logging (removes potential injection characters)
 */
export function sanitizeForLogging(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[\r\n\t]/g, ' ').slice(0, 500);
}
