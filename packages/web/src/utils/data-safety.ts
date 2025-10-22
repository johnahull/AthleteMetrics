/**
 * Utility functions for safe data handling and type validation
 * Prevents runtime errors from invalid data transformations
 */

/**
 * Safely parse a value to a number, returning a fallback value if invalid
 */
export const parseValue = (value: unknown, fallback: number = 0): number => {
  if (typeof value === 'number') {
    return isNaN(value) ? fallback : value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  return fallback;
};

/**
 * Validates if a date object is valid
 */
export const isValidDate = (date: unknown): date is Date => {
  return date instanceof Date && !isNaN(date.getTime());
};

/**
 * Safely create a Date object from various input types
 */
export const safeDate = (value: unknown): Date | null => {
  if (isValidDate(value)) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isValidDate(date) ? date : null;
  }

  return null;
};

/**
 * Safely compare two dates by their ISO date strings
 */
export const compareDatesByDay = (date1: unknown, date2: unknown): boolean => {
  const d1 = safeDate(date1);
  const d2 = safeDate(date2);

  if (!d1 || !d2) return false;

  return d1.toISOString().split('T')[0] === d2.toISOString().split('T')[0];
};

/**
 * Safely access array elements with bounds checking
 */
export const safeArrayAccess = <T>(array: T[], index: number): T | null => {
  if (!Array.isArray(array) || index < 0 || index >= array.length) {
    return null;
  }
  return array[index];
};

/**
 * Get the first value from an object safely
 */
export const getFirstObjectValue = <T>(obj: Record<string, T>): T | null => {
  if (!obj || typeof obj !== 'object') return null;

  const values = Object.values(obj);
  return safeArrayAccess(values, 0);
};

/**
 * Type guard for checking if a value has a numeric value property
 */
export interface HasValue {
  value: unknown;
}

export const hasValue = (obj: unknown): obj is HasValue => {
  return typeof obj === 'object' && obj !== null && 'value' in obj;
};

/**
 * Type guard for checking if a value has a date property
 */
export interface HasDate {
  date: unknown;
}

export const hasDate = (obj: unknown): obj is HasDate => {
  return typeof obj === 'object' && obj !== null && 'date' in obj;
};