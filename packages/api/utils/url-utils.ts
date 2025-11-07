import type { Request } from 'express';

/**
 * Current token format version.
 * Change this constant if the token format is migrated in the future (e.g., to UUID v7 or custom format).
 * This provides a single source of truth for token validation strategy.
 */
const TOKEN_VERSION = 'v4' as const;

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
 * @param token - Invitation token (must be valid UUID v4 format per TOKEN_VERSION constant)
 * @returns Complete invitation URL
 * @throws Error if token format is invalid (not a UUID)
 *
 * @remarks
 * This function requires UUID v4 format specifically (not v1, v3, v5, etc.) because:
 * - v4 uses random generation, providing cryptographic security for invitation tokens
 * - Random tokens prevent enumeration attacks (unlike v1's timestamp-based generation)
 * - The validation ensures tokens are generated securely by the server, not user-provided
 * - This adds defense-in-depth against potential injection or manipulation attempts
 *
 * Future token format changes:
 * - To migrate to a different token format (e.g., UUID v7 for time-sortable tokens),
 *   update the TOKEN_VERSION constant and modify the validation logic accordingly.
 * - Consider backward compatibility if changing token format for existing users.
 */
export function generateInvitationLink(req: Request, token: string): string {
  // Validate token format based on TOKEN_VERSION constant
  // Currently enforcing UUID v4: 36 characters in 8-4-4-4-12 hex digit pattern with hyphens
  // Example: 550e8400-e29b-41d4-a716-446655440000
  // The '4' in the 3rd group indicates v4, and [89ab] in the 4th group indicates the variant bits
  if (TOKEN_VERSION === 'v4') {
    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4Pattern.test(token)) {
      throw new Error(`Invalid token format: token must be a valid UUID ${TOKEN_VERSION}`);
    }
  }
  // Future versions can add additional validation branches here
  // Example: if (TOKEN_VERSION === 'v7') { ... }

  // URL-encode token to handle special characters safely (defensive programming)
  const encodedToken = encodeURIComponent(token);

  return `${getBaseUrl(req)}/accept-invitation?token=${encodedToken}`;
}
