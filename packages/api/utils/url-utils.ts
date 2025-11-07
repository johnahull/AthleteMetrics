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
 * @param token - Invitation token (must be valid UUID v4 format)
 * @returns Complete invitation URL
 * @throws Error if token format is invalid (not a UUID)
 */
export function generateInvitationLink(req: Request, token: string): string {
  // Validate token format - must be UUID v4 (36 characters: 8-4-4-4-12 hex digits with hyphens)
  // Example: 550e8400-e29b-41d4-a716-446655440000
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(token)) {
    throw new Error('Invalid token format: token must be a valid UUID v4');
  }

  // URL-encode token to handle special characters safely (defensive programming)
  const encodedToken = encodeURIComponent(token);

  return `${getBaseUrl(req)}/accept-invitation?token=${encodedToken}`;
}
