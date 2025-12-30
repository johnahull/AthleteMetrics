/**
 * Legal Acceptance Utilities
 *
 * Provides utilities for handling privacy policy and terms of service acceptance.
 * All legal acceptance flows use these helpers to ensure consistency.
 */

/**
 * Generate a timestamp for when legal terms were accepted.
 *
 * This represents the date/time when the user accepted the terms,
 * NOT the version of the policy document itself. For actual policy versions,
 * see LAST_UPDATED constants in privacy-policy.tsx and terms-of-service.tsx.
 *
 * @returns Current timestamp in YYYY-MM-DD format for auditing purposes
 * @throws Error if date format generation fails
 */
export function getLegalAcceptanceTimestamp(): string {
  const date = new Date().toISOString().split('T')[0];

  // Validate format before returning (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Failed to generate valid legal acceptance timestamp');
  }

  return date;
}

/**
 * Validation window for legal acceptance timestamps (15 minutes)
 *
 * Rationale:
 * - Allows for slow form completion (5-10 minutes)
 * - Accounts for network delays (30-60 seconds)
 * - Tolerates reasonable clock skew between client/server (1-2 minutes)
 * - Still prevents replay attacks (old timestamps rejected)
 * - Based on industry standards for form submission windows
 *
 * Security considerations:
 * - Prevents backdating of legal acceptance
 * - Mitigates replay attack vectors
 * - Balances UX (legitimate slow users) with security (attack prevention)
 */
const LEGAL_ACCEPTANCE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Validate that a legal acceptance timestamp is valid and reasonable.
 *
 * Checks:
 * - Timestamp is a valid ISO 8601 date string
 * - Date is not in the future
 * - Date is within the last 15 minutes (prevents backdating and replay attacks)
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
  const validWindowStart = new Date(now.getTime() - LEGAL_ACCEPTANCE_WINDOW_MS);

  // Reject future dates or dates older than validation window
  if (acceptedDate > now || acceptedDate < validWindowStart) {
    return false;
  }

  return true;
}

/**
 * Error message for invalid legal acceptance timestamp
 * Generic message to avoid revealing timing details for security
 */
export const INVALID_TIMESTAMP_MESSAGE = "Invalid legal acceptance. Please refresh the page and try again.";

/**
 * Error message for missing legal acceptance
 */
export const MISSING_ACCEPTANCE_MESSAGE = "You must accept the Terms of Service and Privacy Policy to continue";

/**
 * Audit log action for legal acceptance tracking
 */
export const AUDIT_ACTION_LEGAL_ACCEPTED = 'legal_accepted' as const;
