import type { Request } from 'express';

/**
 * Gets the base URL for the application, removing any trailing slash
 * to ensure consistent URL generation.
 *
 * @param req - Express request object
 * @returns Base URL without trailing slash
 */
export function getBaseUrl(req: Request): string {
  return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

/**
 * Generates a complete invitation acceptance link for the given token.
 *
 * @param req - Express request object
 * @param token - Invitation token (UUID format)
 * @returns Complete invitation URL
 * @throws Error if token format is invalid
 */
export function generateInvitationLink(req: Request, token: string): string {
  // Validate token format - must be UUID or alphanumeric with hyphens/underscores
  const tokenPattern = /^[a-zA-Z0-9_-]+$/;
  if (!tokenPattern.test(token)) {
    throw new Error('Invalid token format: token must contain only alphanumeric characters, hyphens, and underscores');
  }

  // URL-encode token to handle special characters safely
  const encodedToken = encodeURIComponent(token);

  return `${getBaseUrl(req)}/accept-invitation?token=${encodedToken}`;
}
