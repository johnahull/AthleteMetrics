/**
 * Centralized error message sanitization utilities
 * Prevents exposing internal error details to users
 */

/**
 * Sanitizes error messages to prevent information leakage
 * Returns user-friendly error messages based on error patterns
 *
 * @param error - The error object or message to sanitize
 * @param defaultMessage - Default message if no pattern matches
 * @returns User-friendly error message
 */
export function sanitizeErrorMessage(
  error: Error | string | unknown,
  defaultMessage: string = "An error occurred. Please try again."
): string {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Pattern matching for common error types
  if (errorMessage.toLowerCase().includes('unique') ||
      errorMessage.toLowerCase().includes('already exists') ||
      errorMessage.toLowerCase().includes('duplicate')) {
    return "This value already exists. Please choose a different one.";
  }

  if (errorMessage.toLowerCase().includes('validation') ||
      errorMessage.toLowerCase().includes('invalid')) {
    return "Invalid input. Please check your entries and try again.";
  }

  if (errorMessage.toLowerCase().includes('permission') ||
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('access denied')) {
    return "You don't have permission to perform this action.";
  }

  if (errorMessage.toLowerCase().includes('not found')) {
    return "The requested resource was not found.";
  }

  if (errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('timeout')) {
    return "Network error. Please check your connection and try again.";
  }

  // Return default message for unknown errors
  return defaultMessage;
}

/**
 * Sanitizes username-related errors to prevent enumeration
 * Returns generic message regardless of whether username exists
 *
 * @param error - The error object
 * @returns Generic error message
 */
export function sanitizeUsernameError(error: Error | string | unknown): string {
  return "Unable to complete request. Please check your input and try again.";
}
