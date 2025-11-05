/**
 * Email Validation Utility
 * Provides robust RFC 5322 compliant email validation
 */

/**
 * RFC 5322 compliant email validation regex
 * More robust than simple regex, prevents:
 * - Angle brackets and newlines (injection attacks)
 * - Multiple @ symbols
 * - Invalid domain formats
 * - Leading/trailing dots in local part
 * - Consecutive dots
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

/**
 * Validate email address format
 * @param email The email address to validate
 * @returns true if email is valid, false otherwise
 */
export function isValidEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Check length constraints (RFC 5321)
  if (email.length > 320) {
    return false;
  }

  const [localPart, domain] = email.split('@');

  // Local part should not exceed 64 characters
  if (!localPart || localPart.length > 64) {
    return false;
  }

  // Domain should not exceed 255 characters
  if (!domain || domain.length > 255) {
    return false;
  }

  return EMAIL_REGEX.test(email);
}
