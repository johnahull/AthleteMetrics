/**
 * Audit Logging Utilities
 *
 * Provides helpers for logging authorization failures and other security events.
 * Uses fire-and-forget pattern to avoid blocking request responses.
 */

import { storage } from '../storage';
import { isIP } from 'net';

/**
 * Sanitize a string field to prevent log injection attacks.
 * Removes newlines, null bytes, and control characters that could be used
 * to inject malicious data into JSON logs.
 *
 * @param value String to sanitize
 * @returns Sanitized string or undefined if input is undefined
 */
function sanitizeLogField(value: string | undefined): string | undefined {
  if (!value) return value;
  // Remove newlines, null bytes, and all control characters (0x00-0x1F, 0x7F-0x9F)
  return value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
}

/**
 * Normalize an IP address to a consistent format.
 * Handles IPv6-mapped IPv4 addresses and validates IP format using Node.js built-in isIP().
 * Returns '0.0.0.0' for invalid or missing IPs to prevent log corruption.
 *
 * @param ip IP address to normalize
 * @returns Normalized IP address or '0.0.0.0' for invalid input
 */
function normalizeIpAddress(ip: string | undefined): string {
  if (!ip) return '0.0.0.0';

  // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
  const ipv4Mapped = ip.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (ipv4Mapped) {
    const extractedIp = ipv4Mapped[1];
    // Validate extracted IPv4 using isIP()
    if (isIP(extractedIp)) return extractedIp;
  }

  // Validate IPv4 and IPv6 formats using Node.js built-in isIP()
  // isIP() returns 4 for IPv4, 6 for IPv6, 0 for invalid
  if (isIP(ip)) return ip;

  console.warn('[security:audit] Invalid IP format:', ip);
  return '0.0.0.0';
}

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
  // Apply sanitization to prevent log injection attacks
  const eventData = {
    action,
    resource,
    attemptedOrgId: context.attemptedOrgId,
    userOrgIds: context.userOrgIds,
    ipAddress: sanitizeLogField(context.ipAddress),
    userAgent: sanitizeLogField(context.userAgent),
    route: sanitizeLogField(context.route),
    method: context.method,
  };

  // Fire-and-forget: Don't await, don't throw
  storage.createSecurityEvent({
    eventType: 'authorization_failed',
    userId: userId ?? null,
    severity: 'warning',
    eventData: JSON.stringify(eventData),
    ipAddress: normalizeIpAddress(sanitizeLogField(context.ipAddress)), // Sanitize before normalization
    userAgent: sanitizeLogField(context.userAgent) ?? null,
  }).catch(err => {
    // Log error to console but don't propagate
    console.error('[security:audit] Failed to log authorization failure:', err);
  });
}
