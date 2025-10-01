/**
 * Audit logging middleware
 *
 * Logs sensitive operations for compliance and security monitoring.
 * Automatically tracks who did what, when, and from where.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AuditableAction {
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
}

/**
 * Audit log middleware - logs after successful response
 */
export function auditLog(getAuditInfo: (req: Request) => AuditableAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;

    res.send = function (data: any) {
      // Only log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const auditInfo = getAuditInfo(req);

          logger.audit(auditInfo.action, {
            requestId: req.id,
            userId: req.context?.userId,
            organizationId: req.context?.organizationId,
            role: req.context?.role,
            ip: req.context?.ip,
            userAgent: req.context?.userAgent,
            resourceType: auditInfo.resourceType,
            resourceId: auditInfo.resourceId,
            ...auditInfo.details,
          });
        } catch (error) {
          // Don't fail the request if audit logging fails
          logger.error('Audit logging failed', {
            requestId: req.id,
            path: req.path,
          }, error as Error);
        }
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Pre-defined audit actions for common operations
 */
export const AuditActions = {
  // User management
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_MFA_ENABLED: 'user.mfa_enabled',
  USER_MFA_DISABLED: 'user.mfa_disabled',

  // Organization management
  ORG_CREATED: 'organization.created',
  ORG_UPDATED: 'organization.updated',
  ORG_DELETED: 'organization.deleted',
  ORG_USER_ADDED: 'organization.user_added',
  ORG_USER_REMOVED: 'organization.user_removed',
  ORG_ROLE_CHANGED: 'organization.role_changed',

  // Team management
  TEAM_CREATED: 'team.created',
  TEAM_UPDATED: 'team.updated',
  TEAM_DELETED: 'team.deleted',
  TEAM_ARCHIVED: 'team.archived',
  TEAM_MEMBER_ADDED: 'team.member_added',
  TEAM_MEMBER_REMOVED: 'team.member_removed',

  // Measurement management
  MEASUREMENT_CREATED: 'measurement.created',
  MEASUREMENT_UPDATED: 'measurement.updated',
  MEASUREMENT_DELETED: 'measurement.deleted',
  MEASUREMENT_VERIFIED: 'measurement.verified',
  MEASUREMENT_BULK_IMPORT: 'measurement.bulk_import',

  // Invitations
  INVITATION_SENT: 'invitation.sent',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_REVOKED: 'invitation.revoked',

  // Security events
  ACCESS_DENIED: 'security.access_denied',
  INVALID_TOKEN: 'security.invalid_token',
  RATE_LIMIT_EXCEEDED: 'security.rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',

  // Data exports
  DATA_EXPORTED: 'data.exported',
  ANALYTICS_ACCESSED: 'analytics.accessed',
} as const;

/**
 * Helper to create audit middleware for common patterns
 */
export function createAuditMiddleware(
  action: string,
  getResourceInfo?: (req: Request) => { resourceType?: string; resourceId?: string; details?: Record<string, any> }
) {
  return auditLog((req) => {
    const resourceInfo = getResourceInfo?.(req) || {};
    return {
      action,
      ...resourceInfo,
    };
  });
}

/**
 * Audit sensitive query parameters or body data
 */
export function auditDataAccess(dataType: string) {
  return auditLog((req) => ({
    action: AuditActions.ANALYTICS_ACCESSED,
    resourceType: dataType,
    details: {
      query: req.query,
      filters: req.body?.filters,
    },
  }));
}

/**
 * Security event logging middleware
 */
export function logSecurityEvent(event: string, getDetails?: (req: Request) => Record<string, any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const details = getDetails?.(req) || {};

    logger.security(event, {
      requestId: req.id,
      userId: req.context?.userId,
      organizationId: req.context?.organizationId,
      ip: req.context?.ip,
      userAgent: req.context?.userAgent,
      path: req.path,
      method: req.method,
      ...details,
    });

    next();
  };
}
