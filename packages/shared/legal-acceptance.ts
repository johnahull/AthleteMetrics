/**
 * Legal Acceptance Utilities
 *
 * Provides utilities for handling privacy policy and terms of service acceptance.
 * All legal acceptance flows use these helpers to ensure consistency.
 */

/**
 * Generate the current legal version timestamp.
 *
 * Note: This represents the date/time when the user accepted the terms,
 * NOT the version of the policy document itself. For actual policy versions,
 * see LAST_UPDATED constants in privacy-policy.tsx and terms-of-service.tsx.
 *
 * @returns Current timestamp in YYYY-MM-DD format
 */
export function getCurrentLegalVersion(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Validate that a legal acceptance timestamp is valid and reasonable.
 *
 * Checks:
 * - Timestamp is a valid ISO 8601 date string
 * - Date is not in the future
 * - Date is within the last hour (prevents backdating)
 *
 * @param timestamp - ISO 8601 timestamp string
 * @returns true if valid, false otherwise
 */
export function validateLegalAcceptanceTimestamp(timestamp: string): boolean {
  // Check if it's a valid date string
  const acceptedDate = new Date(timestamp);
  if (isNaN(acceptedDate.getTime())) {
    return false;
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Reject future dates or dates older than 1 hour
  if (acceptedDate > now || acceptedDate < oneHourAgo) {
    return false;
  }

  return true;
}

/**
 * Error message for invalid legal acceptance timestamp
 */
export const INVALID_TIMESTAMP_MESSAGE = "Invalid legal acceptance timestamp. Please try again.";

/**
 * Error message for missing legal acceptance
 */
export const MISSING_ACCEPTANCE_MESSAGE = "You must accept the Terms of Service and Privacy Policy to continue";
