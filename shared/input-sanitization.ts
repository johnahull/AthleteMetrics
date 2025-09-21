/**
 * Input sanitization utilities for protecting against injection attacks
 * and ensuring data integrity across the application
 */

/**
 * Sanitizes search terms to prevent SQL injection and other attacks
 * @param input Raw search input from user
 * @returns Sanitized search term safe for database queries
 */
export function sanitizeSearchTerm(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Trim whitespace
  let sanitized = input.trim();

  // Limit length to prevent DoS attacks
  const MAX_SEARCH_LENGTH = 100;
  if (sanitized.length > MAX_SEARCH_LENGTH) {
    sanitized = sanitized.substring(0, MAX_SEARCH_LENGTH);
  }

  // Remove or escape potentially dangerous characters
  // Remove SQL wildcards that could be used maliciously
  sanitized = sanitized.replace(/[%_]/g, '');

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  // Remove potentially dangerous SQL keywords (case-insensitive)
  const dangerousPatterns = [
    /\b(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|EXEC|EXECUTE)\b/gi,
    /--/g, // SQL comments
    /\/\*/g, // SQL block comments start
    /\*\//g, // SQL block comments end
    /;/g, // Statement terminators
  ];

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Normalize multiple spaces to single spaces
  sanitized = sanitized.replace(/\s+/g, ' ');

  return sanitized.trim();
}

/**
 * Validates that a search term meets basic criteria
 * @param searchTerm Sanitized search term
 * @returns true if valid, false otherwise
 */
export function validateSearchTerm(searchTerm: string): boolean {
  // Minimum length check (prevent empty or very short searches that could be expensive)
  const MIN_SEARCH_LENGTH = 0; // Allow empty searches for "show all"
  const MAX_SEARCH_LENGTH = 100;

  if (searchTerm.length < MIN_SEARCH_LENGTH || searchTerm.length > MAX_SEARCH_LENGTH) {
    return false;
  }

  // Check for remaining suspicious patterns after sanitization
  const suspiciousPatterns = [
    /[<>'"&]/g, // HTML/XML injection attempts
    /javascript:/gi, // JavaScript protocol
    /data:/gi, // Data protocol
    /vbscript:/gi, // VBScript protocol
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(searchTerm)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes general text input (names, descriptions, etc.)
 * @param input Raw text input from user
 * @param options Sanitization options
 * @returns Sanitized text safe for storage and display
 */
export function sanitizeTextInput(
  input: string | null | undefined,
  options: {
    maxLength?: number;
    allowSpecialChars?: boolean;
    preserveNewlines?: boolean;
  } = {}
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const {
    maxLength = 255,
    allowSpecialChars = false,
    preserveNewlines = false
  } = options;

  let sanitized = input.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove null bytes and most control characters
  if (preserveNewlines) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  // Remove potentially dangerous patterns
  if (!allowSpecialChars) {
    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Remove JavaScript protocols
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:/gi, '');
    sanitized = sanitized.replace(/vbscript:/gi, '');
  }

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');

  return sanitized.trim();
}

/**
 * Sanitizes email input
 * @param input Raw email input from user
 * @returns Sanitized email or empty string if invalid
 */
export function sanitizeEmail(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const sanitized = input.trim().toLowerCase();

  // Basic email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(sanitized) || sanitized.length > 254) {
    return '';
  }

  return sanitized;
}

/**
 * Sanitizes numeric input
 * @param input Raw numeric input from user
 * @param options Validation options
 * @returns Sanitized number or null if invalid
 */
export function sanitizeNumericInput(
  input: string | number | null | undefined,
  options: {
    min?: number;
    max?: number;
    allowFloat?: boolean;
  } = {}
): number | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }

  const { min, max, allowFloat = true } = options;

  let num: number;

  if (typeof input === 'string') {
    // Remove non-numeric characters except decimal point and minus sign
    const cleaned = input.replace(/[^0-9.-]/g, '');
    num = allowFloat ? parseFloat(cleaned) : parseInt(cleaned, 10);
  } else {
    num = input;
  }

  // Check if valid number
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  // Check bounds
  if (min !== undefined && num < min) {
    return null;
  }

  if (max !== undefined && num > max) {
    return null;
  }

  return num;
}