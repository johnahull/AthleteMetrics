/**
 * Shared form utilities for consistent data handling across forms
 */

/**
 * Normalize a string value for comparison by trimming whitespace and converting empty strings to null
 * @param val - The string value to normalize
 * @returns The normalized value (trimmed string or null)
 */
export const normalizeString = (val: string | null | undefined): string | null => {
  return val?.trim() || null;
};
