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
 * @param token - Invitation token
 * @returns Complete invitation URL
 */
export function generateInvitationLink(req: Request, token: string): string {
  return `${getBaseUrl(req)}/accept-invitation?token=${token}`;
}
