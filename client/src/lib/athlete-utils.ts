/**
 * Utility functions for athlete-related operations
 */

import type { EnhancedUser } from './types/user';

/**
 * Gets the athlete user ID from the user object
 * Uses athleteId if available, falls back to user.id
 *
 * @param user - The authenticated user object
 * @returns The athlete user ID or undefined if user is null
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
