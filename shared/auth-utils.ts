/**
 * Shared authentication utility functions
 * Used by both client and server for consistent auth logic
 */

/**
 * Check if a user is a site administrator
 *
 * Site admins are identified by multiple fields for legacy compatibility:
 * - isSiteAdmin: boolean true or string "true" (primary)
 * - role: string "site_admin" (legacy)
 * - admin: boolean true (legacy)
 *
 * @param user - User object with potential admin fields
 * @returns true if user is a site admin, false otherwise
 */
export function isSiteAdmin(user: {
  isSiteAdmin?: boolean | string;
  role?: string;
  admin?: boolean;
} | null | undefined): boolean {
  if (!user) return false;

  return user.isSiteAdmin === true ||
         user.isSiteAdmin === 'true' ||
         user.role === 'site_admin' ||
         user.admin === true;
}
