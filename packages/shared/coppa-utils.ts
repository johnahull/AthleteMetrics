/**
 * COPPA Utilities
 *
 * Shared utilities for COPPA compliance logic. Mirrors the pattern of
 * legal-acceptance.ts — simple, testable, side-effect-free functions.
 *
 * LEGAL NOTE: These functions have legal implications. Age boundary
 * calculations must be exact. A child who turns 13 TODAY is NOT under 13
 * (coppaStatusEnum maps 'not_applicable' for age >= 13).
 */

// ============================================================================
// Constants
// ============================================================================

export const COPPA_AGE_THRESHOLD = 13;

/** 30-day consent token expiry per FTC guidance */
export const CONSENT_TOKEN_EXPIRY_DAYS = 30;

/** COPPA audit trail must be retained for 5 years (FTC enforcement guidance) */
export const COPPA_AUDIT_RETENTION_YEARS = 5;

// ============================================================================
// Age Calculation
// ============================================================================

/**
 * Calculate the age of a person in whole years as of today.
 *
 * Uses the same comparison logic as US age-gating standards:
 * - Age is the number of completed years since birth
 * - A child who turns 13 today has age 13 (NOT under 13)
 * - Leap year handling: Feb 29 birthday → treat birthday as Feb 28 in non-leap years
 *
 * @param birthDate - Date of birth as a string (YYYY-MM-DD) or Date object
 * @returns Age in whole years
 * @throws Error if birthDate is null, undefined, or in the future
 */
export function calculateAge(birthDate: string | Date): number {
  if (birthDate === null || birthDate === undefined) {
    throw new Error('birthDate is required for age calculation');
  }

  // Parse string dates as LOCAL midnight to avoid UTC timezone shifts.
  // new Date("YYYY-MM-DD") is UTC midnight, which in UTC+ timezones resolves
  // to the previous local day — incorrect for date-of-birth age calculations.
  let birth: Date;
  if (birthDate instanceof Date) {
    birth = birthDate;
  } else {
    const parts = (birthDate as string).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      throw new Error(`Invalid birthDate: ${String(birthDate)}`);
    }
    birth = new Date(parts[0], parts[1] - 1, parts[2]); // local midnight
  }

  if (isNaN(birth.getTime())) {
    throw new Error(`Invalid birthDate: ${String(birthDate)}`);
  }

  const today = new Date();

  // Future dates are a data entry error — fail safe (treat as minor)
  if (birth > today) {
    throw new Error(`birthDate cannot be in the future: ${String(birthDate)}`);
  }

  let age = today.getFullYear() - birth.getFullYear();

  // Check if the birthday has occurred yet this year
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Returns true if the person is strictly under 13 years old as of today.
 *
 * LEGAL EXPOSURE: The boundary condition (exactly 13 today) must return false.
 * A person who turns 13 today has had their 13th birthday → not under 13.
 *
 * @param birthDate - Date of birth as a string (YYYY-MM-DD) or Date object
 * @returns true if under 13, false if 13 or older
 * @throws Error if birthDate is null, undefined, or in the future
 */
export function isUnder13(birthDate: string | Date): boolean {
  return calculateAge(birthDate) < COPPA_AGE_THRESHOLD;
}

/**
 * Returns true if the person was under 13 at a specific reference date.
 *
 * Used for retroactive COPPA scans where age-at-collection (e.g. account
 * creation date) matters, not current age. A user who was 12 when they
 * registered but is now 14 was still a minor at the time of data collection.
 *
 * @param birthDate - Date of birth
 * @param referenceDate - The date to calculate age against (e.g. createdAt)
 * @returns true if the person was under 13 at referenceDate
 * @throws Error if birthDate is null/undefined or referenceDate is before birthDate
 */
export function wasUnder13At(birthDate: string | Date, referenceDate: Date): boolean {
  if (birthDate === null || birthDate === undefined) {
    throw new Error('birthDate is required');
  }
  let birth: Date;
  if (birthDate instanceof Date) {
    birth = birthDate;
  } else {
    const parts = (birthDate as string).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      throw new Error(`Invalid birthDate: ${String(birthDate)}`);
    }
    birth = new Date(parts[0], parts[1] - 1, parts[2]); // local midnight
  }
  if (isNaN(birth.getTime())) {
    throw new Error(`Invalid birthDate: ${String(birthDate)}`);
  }
  if (birth > referenceDate) {
    throw new Error('birthDate cannot be after referenceDate');
  }

  let age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getDate())) {
    age--;
  }
  return age < COPPA_AGE_THRESHOLD;
}

// ============================================================================
// Token Expiry
// ============================================================================

/**
 * Calculate the consent token expiry timestamp (30 days from now).
 */
export function getConsentTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + CONSENT_TOKEN_EXPIRY_DAYS);
  return expiry;
}

/**
 * Calculate the audit log retention timestamp (5 years from now).
 */
export function getAuditRetentionDate(): Date {
  const retention = new Date();
  retention.setFullYear(retention.getFullYear() + COPPA_AUDIT_RETENTION_YEARS);
  return retention;
}

// ============================================================================
// COPPA Audit Action Constants
// ============================================================================

export const COPPA_ACTIONS = {
  /** Parent consent email initiated — token created */
  CONSENT_INITIATED: 'coppa_consent_initiated',

  /** Parent confirmed consent via email link */
  CONSENT_CONFIRMED: 'coppa_consent_confirmed',

  /** Parent denied consent via email link */
  CONSENT_DENIED: 'coppa_consent_denied',

  /** Consent revoked after previously being granted */
  CONSENT_REVOKED: 'coppa_consent_revoked',

  /** AI consent separately granted */
  AI_CONSENT_GRANTED: 'coppa_ai_consent_granted',

  /** AI consent separately denied */
  AI_CONSENT_DENIED: 'coppa_ai_consent_denied',

  /** Consent token expired (30 days) */
  TOKEN_EXPIRED: 'coppa_token_expired',

  /** Parent requested re-send of consent email */
  CONSENT_EMAIL_RESENT: 'coppa_consent_email_resent',

  /** Site admin ran retroactive COPPA scan */
  RETROACTIVE_SCAN: 'coppa_retroactive_scan',

  /** Athlete login blocked due to pending consent */
  LOGIN_BLOCKED_PENDING: 'coppa_login_blocked_pending',

  /** Athlete login blocked due to revoked consent */
  LOGIN_BLOCKED_REVOKED: 'coppa_login_blocked_revoked',

  /** Token replay attempt detected (second use of already-used token) */
  TOKEN_REPLAY_ATTEMPT: 'coppa_token_replay_attempt',

  /** Parent requested data export for their child's account */
  DATA_EXPORT_REQUESTED: 'coppa_data_export_requested',

  /** Data export was downloaded (one-time token consumed) */
  DATA_EXPORT_DELIVERED: 'coppa_data_export_delivered',

  /** Parent/admin initiated data deletion request */
  DATA_DELETION_REQUESTED: 'coppa_data_deletion_requested',

  /** Site admin completed cascade data deletion for an athlete */
  DATA_DELETION_COMPLETED: 'coppa_data_deletion_completed',

  /** Data deletion request was rejected by site admin */
  DATA_DELETION_REJECTED: 'coppa_data_deletion_rejected',

  /** Public snapshot access blocked because snapshot contains minor data */
  SNAPSHOT_ACCESS_BLOCKED: 'coppa_snapshot_access_blocked',
} as const;

export type CoppaAction = typeof COPPA_ACTIONS[keyof typeof COPPA_ACTIONS];
