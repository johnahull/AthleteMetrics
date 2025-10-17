/**
 * Shared password requirements constants
 * Used for validation on both client and server
 */

export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requiresLowercase: true,
  requiresUppercase: true,
  requiresNumber: true,
  requiresSpecialChar: true,
} as const;

export const PASSWORD_REGEX = {
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  number: /[0-9]/,
  specialChar: /[^a-zA-Z0-9]/,
} as const;

/**
 * Validates a password against all requirements
 * @param password - The password to validate
 * @returns Object with validation result and error messages
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Handle null/undefined
  if (!password) {
    return {
      valid: false,
      errors: ['Password is required']
    };
  }

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
  }

  if (PASSWORD_REQUIREMENTS.requiresLowercase && !PASSWORD_REGEX.lowercase.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requiresUppercase && !PASSWORD_REGEX.uppercase.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requiresNumber && !PASSWORD_REGEX.number.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD_REQUIREMENTS.requiresSpecialChar && !PASSWORD_REGEX.specialChar.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Gets a human-readable description of password requirements
 * @returns String describing password requirements
 */
export function getPasswordRequirementsText(): string {
  const parts: string[] = [];

  parts.push(`at least ${PASSWORD_REQUIREMENTS.minLength} characters`);

  if (PASSWORD_REQUIREMENTS.requiresUppercase || PASSWORD_REQUIREMENTS.requiresLowercase) {
    if (PASSWORD_REQUIREMENTS.requiresUppercase && PASSWORD_REQUIREMENTS.requiresLowercase) {
      parts.push('uppercase and lowercase letters');
    } else if (PASSWORD_REQUIREMENTS.requiresUppercase) {
      parts.push('uppercase letters');
    } else {
      parts.push('lowercase letters');
    }
  }

  if (PASSWORD_REQUIREMENTS.requiresNumber) {
    parts.push('numbers');
  }

  if (PASSWORD_REQUIREMENTS.requiresSpecialChar) {
    parts.push('special characters');
  }

  return 'Must be ' + parts.join(', ');
}
