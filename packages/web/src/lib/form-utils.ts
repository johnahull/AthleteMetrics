/**
 * Shared form utilities for consistent data handling across forms
 */

/**
 * Normalize a string value for comparison by trimming whitespace (including Unicode) and converting empty strings to null
 * @param val - The string value to normalize
 * @returns The normalized value (trimmed string or null)
 */
export const normalizeString = (val: string | null | undefined): string | null => {
  if (!val) return null;

  // Remove ALL Unicode whitespace (not just ASCII)
  // This includes: spaces, tabs, newlines, zero-width spaces, non-breaking spaces, etc.
  const trimmed = val
    .replace(/^[\s\uFEFF\xA0\u200B-\u200D\u2028\u2029]+/, '')  // Leading whitespace
    .replace(/[\s\uFEFF\xA0\u200B-\u200D\u2028\u2029]+$/, ''); // Trailing whitespace

  return trimmed || null;
};
