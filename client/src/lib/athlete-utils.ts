/**
 * Utility functions for athlete-related operations
 */

import type { EnhancedUser } from './types/user';

/**
 * Gets the athlete user ID from the user object
 *
 * **Important: athleteId vs user.id**
 *
 * For athlete users, `athleteId` is set equal to `user.id` during authentication.
 * This redundancy exists to:
 * 1. Provide explicit semantic meaning (this ID represents an athlete profile)
 * 2. Support future scenarios where coaches/admins might have linked athlete profiles
 * 3. Make athlete-specific code more readable and self-documenting
 *
 * Currently: `user.athleteId === user.id` for all athlete role users
 * Future: May support `user.athleteId !== user.id` for coaches with athlete profiles
 *
 * @param user - The authenticated user object
 * @returns The athlete user ID, or undefined if user is null
 *
 * @example
 * ```ts
 * const athleteUserId = getAthleteUserId(user);
 * if (athleteUserId) {
 *   // Fetch athlete-specific data
 * }
 * ```
 */
export function getAthleteUserId(user: EnhancedUser | null): string | undefined {
  if (!user) return undefined;
  return user.athleteId || user.id;
}

/**
 * Checks if a user has an athlete profile
 *
 * @param user - The authenticated user object
 * @returns True if the user has an athlete profile
 */
export function hasAthleteProfile(user: EnhancedUser | null): boolean {
  return Boolean(user && (user.athleteId || user.role === 'athlete'));
}
