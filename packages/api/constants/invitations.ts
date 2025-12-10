/**
 * Invitation-related constants
 * Centralized configuration for invitation functionality
 */

/**
 * Maximum number of failed invitation acceptance attempts before locking the invitation
 *
 * @default 10 attempts
 *
 * Rationale: Prevents brute-force attacks while allowing for legitimate user errors
 * (typos, password manager issues, etc.). The threshold of 10 attempts balances
 * security with user experience - legitimate users rarely exceed 3-5 attempts,
 * while automated attacks are effectively blocked before meaningful progress.
 */
export const MAX_INVITATION_ATTEMPTS = 10;
