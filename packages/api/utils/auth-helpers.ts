/**
 * Shared authentication helper utilities
 */

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  athleteId?: string;
  isSiteAdmin?: boolean;
  primaryOrganizationId?: string;
  emailVerified?: boolean;
}

/**
 * Check if user is a site admin
 */
export function isSiteAdmin(user: SessionUser | undefined): boolean {
  return user?.isSiteAdmin === true;
}
