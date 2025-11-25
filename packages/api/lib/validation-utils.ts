/**
 * Validation Utilities for API Input Sanitization
 * Prevents SQL injection, XSS, and invalid data issues
 */

/**
 * Validates a date string in YYYY-MM-DD format
 * @param dateStr - Date string to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validated date string
 * @throws Error if date is invalid
 */
export function validateDateString(dateStr: string | undefined, fieldName: string = 'date'): string {
  if (!dateStr) {
    return new Date().toISOString().split('T')[0];
  }

  // Validate YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid ${fieldName} format. Expected YYYY-MM-DD, got: ${dateStr}`);
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName} value: ${dateStr}`);
  }

  // Check if date is reasonable (not in far future or past)
  const year = date.getFullYear();
  if (year < 2020 || year > 2100) {
    throw new Error(`${fieldName} year out of reasonable range: ${year}`);
  }

  return dateStr;
}

/**
 * Validates and sanitizes question IDs array
 * Prevents SQL injection via questionIds parameter
 * @param questionIdsParam - Comma-separated question IDs
 * @param maxCount - Maximum number of question IDs allowed
 * @returns Array of validated question IDs
 */
export function validateQuestionIds(
  questionIdsParam: string | undefined,
  maxCount: number = 50
): string[] | undefined {
  if (!questionIdsParam) {
    return undefined;
  }

  const questionIds = (questionIdsParam as string)
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  // Validate each question ID format (alphanumeric, underscore, hyphen only)
  const invalidIds = questionIds.filter(id => !/^[a-zA-Z0-9_-]{1,100}$/.test(id));
  if (invalidIds.length > 0) {
    throw new Error(`Invalid question ID format: ${invalidIds.join(', ')}`);
  }

  // Limit count to prevent DoS
  if (questionIds.length > maxCount) {
    throw new Error(`Too many question IDs. Maximum ${maxCount} allowed, got ${questionIds.length}`);
  }

  return questionIds.length > 0 ? questionIds : undefined;
}

/**
 * Validates date range and ensures it's not too large
 * @param startDate - Start date string
 * @param endDate - End date string
 * @param maxDays - Maximum days allowed in range
 * @returns Validated date range
 * @throws Error if date range is invalid or too large
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  maxDays: number = 365
): { startDate: string; endDate: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw new Error('startDate cannot be after endDate');
  }

  const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff > maxDays) {
    throw new Error(`Date range cannot exceed ${maxDays} days. Requested: ${daysDiff} days`);
  }

  return { startDate, endDate };
}

/**
 * Validates UUID format
 * @param uuid - UUID string to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validated UUID
 * @throws Error if UUID is invalid
 */
export function validateUUID(uuid: string, fieldName: string = 'id'): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(uuid)) {
    throw new Error(`Invalid ${fieldName} format. Expected UUID, got: ${uuid}`);
  }

  return uuid;
}

/**
 * Validates and limits array size
 * Prevents memory exhaustion from large arrays
 * @param arr - Array to validate
 * @param maxSize - Maximum array size allowed
 * @param fieldName - Name of the field for error messages
 * @returns Validated array (sliced to maxSize if needed)
 */
export function limitArraySize<T>(
  arr: T[],
  maxSize: number,
  fieldName: string = 'array'
): T[] {
  if (arr.length > maxSize) {
    console.warn(`${fieldName} size ${arr.length} exceeds maximum ${maxSize}, limiting results`);
    return arr.slice(0, maxSize);
  }
  return arr;
}
