/**
 * Utility functions for athlete-related operations
 */

import type { EnhancedUser } from './types/user';

/**
 * Gets the athlete user ID from the user object
 *
 * **Important: athleteId vs user.id**
 *
 * For athlete users, `athleteId` is set equal to `user.id` during authentication
 * (see auth-routes.ts:50). This creates an explicit semantic distinction between
 * "user identity" and "athlete profile identity".
 *
 * **Current Behavior:**
 * - Athlete role users: `user.athleteId === user.id` (set during login)
 * - Other roles: `user.athleteId` is undefined
 * - Fallback: Uses `user.id` when `athleteId` is not set
 *
 * **Why this design exists:**
 * 1. **Semantic clarity**: Code reading `athleteId` explicitly signals "athlete profile operations"
 * 2. **Future extensibility**: Supports scenarios where coaches/admins have linked athlete profiles
 *    (e.g., a coach who was previously an athlete, `athleteId !== user.id`)
 * 3. **Code documentation**: Makes athlete-specific logic self-documenting
 *
 * **Usage patterns:**
 * - Sidebar links: `user?.athleteId || user?.id` (sidebar.tsx:87)
 * - API calls: `getAthleteUserId(user)` (standardized utility)
 * - Authorization: Always use this utility to ensure consistent ID resolution
 *
 * @param user - The authenticated user object
 * @returns The athlete user ID, or undefined if user is null
 *
 * @example
 * ```ts
 * // Fetch athlete-specific data
 * const athleteUserId = getAthleteUserId(user);
 * if (athleteUserId) {
 *   const response = await fetch(`/api/athletes/${athleteUserId}`);
 * }
 *
 * // Authorization check
 * if (getAthleteUserId(user) !== requestedAthleteId) {
 *   throw new Error('Access denied');
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
