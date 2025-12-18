/**
 * Audit Logging Utilities
 *
 * Provides helpers for logging authorization failures and other security events.
 * Uses fire-and-forget pattern to avoid blocking request responses.
 */

import { storage } from '../storage';

/**
 * Context for authorization failure events
 */
export interface AuthorizationFailureContext {
  attemptedOrgId?: string;
  userOrgIds?: string[];
  ipAddress?: string;
  userAgent?: string;
  route?: string;
  method?: string;
}

/**
 * Log an authorization failure event to the security audit log.
 *
 * This function uses a fire-and-forget pattern - it does not await the database
 * operation and does not throw errors. This ensures that audit logging failures
 * do not block or crash the request response.
 *
 * @param userId User ID (undefined for unauthenticated requests)
 * @param action Action attempted (e.g., 'read', 'write', 'delete')
 * @param resource Resource type (e.g., 'athlete', 'team', 'measurement')
 * @param context Additional context about the failure
 *
 * @example
 * ```typescript
 * logAuthorizationFailure(currentUser?.id, 'read', 'athlete', {
 *   attemptedOrgId: athlete.organizationId,
 *   userOrgIds: userOrgIds,
 *   ipAddress: req.ip,
 *   userAgent: req.get('user-agent'),
 *   route: req.path,
 *   method: req.method
 * });
 * ```
 */
export function logAuthorizationFailure(
  userId: string | undefined,
  action: string,
  resource: string,
  context: AuthorizationFailureContext
): void {
  // Build event data from action, resource, and context
  const eventData = {
    action,
    resource,
    ...context,
  };

  // Fire-and-forget: Don't await, don't throw
  storage.createSecurityEvent({
    eventType: 'authorization_failed',
    userId: userId ?? null,
    severity: 'warning',
    eventData: JSON.stringify(eventData),
    ipAddress: context.ipAddress ?? '0.0.0.0', // Required field, use placeholder if missing
    userAgent: context.userAgent ?? null,
  }).catch(err => {
    // Log error to console but don't propagate
    console.error('[security:audit] Failed to log authorization failure:', err);
  });
}
