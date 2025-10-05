/**
 * CSV utility functions for data export and validation
 */

/**
 * Sanitize CSV value to prevent formula injection attacks
 * Protects against formulas in Excel/Google Sheets
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
 * Validate email format
 */
export function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value.trim());
}

/**
 * Escape CSV field value for proper CSV formatting
 * Handles commas, quotes, and newlines
 */
export function escapeCSVField(field: any): string {
  let value = String(field || '');

  // Sanitize for formula injection first
  value = sanitizeCSVValue(value);

  // Escape commas and quotes for CSV
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
