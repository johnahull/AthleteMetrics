/**
 * CSV Utility Functions
 * Security utilities for CSV handling and formula injection prevention
 */

/**
 * Sanitizes CSV values to prevent formula injection attacks
 * @param value - The value to sanitize
 * @returns Sanitized value safe for CSV export
 *
 * SECURITY: Prevents CSV formula injection by prepending single quote to values
 * that start with formula characters (=, +, -, @, |, %, tab, carriage return)
 */
export function sanitizeCSVValue(value: string): string {
  if (!value || typeof value !== 'string') return value;

  // Remove leading formula characters that could be exploited in Excel/Sheets
  // Formulas start with: = + - @ (and sometimes |, %, \t, \r)
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;

  // If value starts with a formula character, prepend a single quote
  // This makes Excel/Sheets treat it as text instead of a formula
  if (/^[=+\-@|%\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Escapes a value for safe inclusion in CSV format
 * @param value - The value to escape
 * @returns CSV-escaped value
 */
export function escapeCSVValue(value: string): string {
  if (!value) return '';

  const stringValue = String(value);

  // Escape commas, quotes, and newlines
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Sanitizes and escapes a value for CSV export
 * @param value - The value to process
 * @returns Sanitized and escaped value
 */
export function prepareCsvValue(value: any): string {
  const stringValue = String(value || '');
  const sanitized = sanitizeCSVValue(stringValue);
  return escapeCSVValue(sanitized);
}
