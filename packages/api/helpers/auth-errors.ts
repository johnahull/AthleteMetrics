/**
 * Authentication/Authorization Error Utilities
 *
 * Provides consistent error message handling across all routes.
 * In production, detailed error messages are hidden to prevent information leakage.
 * In development, detailed messages are shown for debugging.
 */

/**
 * Get appropriate authorization error message based on environment.
 * In production, returns generic "Access denied" to prevent information leakage.
 * In development, returns the detailed message for debugging.
 *
 * @param detailedMessage Detailed message for development environments
 * @returns Error message appropriate for current environment
 */
export function getAuthorizationError(detailedMessage: string): string {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  return isDevelopment ? detailedMessage : 'Access denied';
}

/**
 * Standard authorization error messages for org access validation.
 * Use these constants for consistency across routes.
 */
export const AUTH_ERRORS = {
  NOT_AUTHENTICATED: 'User not authenticated',
  NO_ORG_MEMBERSHIP: 'Access denied - no organization membership',
  ORG_ACCESS_DENIED: 'Access denied - you don\'t have permission to access this organization',
  ATHLETE_ORG_MISMATCH: 'Access denied - athlete not in your organization',
  TEAM_ORG_MISMATCH: 'Access denied - team belongs to different organization',
  MEASUREMENT_ACCESS_DENIED: 'Access denied - measurement belongs to athlete from a different organization',
} as const;
