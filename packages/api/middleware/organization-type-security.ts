/**
 * Organization Type Security Middleware
 * 
 * @fileoverview Enhanced security middleware for organization type operations including:
 * - Advanced authorization and access control
 * - Rate limiting with sophisticated patterns
 * - Input sanitization and validation
 * - Audit logging with comprehensive context
 * - Attack detection and prevention
 * 
 * @author AthleteMetrics System
 * @version 1.0.0
 * @since 2025-11-09
 */

import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import crypto from 'crypto';
import { 
  type OrganizationType,
  isValidOrganizationType,
  organizationTypeLookup,
} from '@shared/organization-type-utils';
import { OrganizationTypeError, OrganizationTypeErrorType } from './organization-type-middleware';

/**
 * Security configuration for organization type operations
 */
interface SecurityConfig {
  /** Enable advanced threat detection */
  enableThreatDetection: boolean;
  /** Maximum request payload size in bytes */
  maxPayloadSize: number;
  /** Enable CSRF protection */
  enableCSRFProtection: boolean;
  /** Enable detailed audit logging */
  enableDetailedAuditLog: boolean;
  /** Suspicious activity threshold */
  suspiciousActivityThreshold: number;
}

/**
 * Security configuration constants
 * Extracted from magic numbers for clarity and maintainability
 */
const SECURITY_CONSTANTS = {
  /** Default maximum payload size in bytes (1MB) */
  DEFAULT_MAX_PAYLOAD_SIZE: 1024 * 1024,
  /** Default threshold for suspicious activity detection */
  DEFAULT_SUSPICIOUS_ACTIVITY_THRESHOLD: 10,
  /** Requests per minute threshold for rapid request detection (based on average human API interaction: 1-2 actions per 6 seconds) */
  RAPID_REQUEST_THRESHOLD: 10,
  /** High severity threshold for rapid requests (sustained automation patterns) */
  RAPID_REQUEST_HIGH_THRESHOLD: 30,
  /** Critical severity threshold for rapid requests (likely DDoS or brute force attack) */
  RAPID_REQUEST_CRITICAL_THRESHOLD: 50,
  /** Minimum requests before analyzing failure rate (statistical significance threshold) */
  MIN_REQUESTS_FOR_FAILURE_ANALYSIS: 5,
  /** Failure rate threshold for suspicious activity (70% indicates systematic errors or probing attacks) */
  HIGH_FAILURE_RATE_THRESHOLD: 0.7,
  /** Critical failure rate threshold (90% indicates automated attack or severe misconfiguration) */
  CRITICAL_FAILURE_RATE_THRESHOLD: 0.9,
  /** Time window for analyzing recent requests (1 minute) */
  RECENT_REQUEST_WINDOW_MS: 60 * 1000,
  /** Time window for suspicious activity retention (1 hour) */
  SUSPICIOUS_ACTIVITY_RETENTION_MS: 60 * 60 * 1000,
} as const;

/**
 * Default security configuration
 */
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enableThreatDetection: process.env.NODE_ENV === 'production',
  maxPayloadSize: SECURITY_CONSTANTS.DEFAULT_MAX_PAYLOAD_SIZE,
  enableCSRFProtection: true,
  enableDetailedAuditLog: true,
  suspiciousActivityThreshold: SECURITY_CONSTANTS.DEFAULT_SUSPICIOUS_ACTIVITY_THRESHOLD,
};

/**
 * Security context for organization type operations
 */
interface SecurityContext {
  userId: string;
  userRole: string;
  isSiteAdmin: boolean;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  timestamp: string;
  organizationType?: OrganizationType;
  suspiciousActivity?: SuspiciousActivityIndicator[];
}

/**
 * Suspicious activity indicators
 */
interface SuspiciousActivityIndicator {
  type: 'RAPID_REQUESTS' | 'INVALID_INPUT_PATTERN' | 'PRIVILEGE_ESCALATION' | 'DATA_ENUMERATION';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metadata: Record<string, any>;
}

/**
 * Rate limiting store for tracking user activity patterns
 */
class SecurityRateLimitStore {
  private store = new Map<string, {
    requests: Array<{ timestamp: number; endpoint: string; success: boolean }>;
    suspiciousActivity: SuspiciousActivityIndicator[];
    lastReset: number;
  }>();

  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
  private readonly cleanupInterval = 60 * 1000; // 1 minute
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    // Periodic cleanup of old entries
    this.cleanupIntervalId = setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Destroy the store and clear the cleanup interval
   * Call this when shutting down the application to prevent memory leaks
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.store.clear();
  }

  /**
   * Record a request for rate limiting and pattern analysis
   */
  recordRequest(
    key: string, 
    endpoint: string, 
    success: boolean,
    context: Partial<SecurityContext>
  ): void {
    const now = Date.now();
    
    if (!this.store.has(key)) {
      this.store.set(key, {
        requests: [],
        suspiciousActivity: [],
        lastReset: now,
      });
    }

    const entry = this.store.get(key)!;
    
    // Add request to history
    entry.requests.push({ timestamp: now, endpoint, success });
    
    // Keep only requests within window
    entry.requests = entry.requests.filter(
      req => now - req.timestamp < this.windowMs
    );

    // Analyze for suspicious patterns
    this.analyzeSuspiciousActivity(key, entry, context);
  }

  /**
   * Get current request count for a key
   */
  getRequestCount(key: string): number {
    const entry = this.store.get(key);
    if (!entry) return 0;

    const now = Date.now();
    return entry.requests.filter(
      req => now - req.timestamp < this.windowMs
    ).length;
  }

  /**
   * Get suspicious activity indicators for a key
   */
  getSuspiciousActivity(key: string): SuspiciousActivityIndicator[] {
    const entry = this.store.get(key);
    return entry?.suspiciousActivity || [];
  }

  /**
   * Analyze request patterns for suspicious activity
   */
  private analyzeSuspiciousActivity(
    key: string,
    entry: {
      requests: Array<{ timestamp: number; endpoint: string; success: boolean }>;
      suspiciousActivity: SuspiciousActivityIndicator[];
      lastReset: number;
    },
    context: Partial<SecurityContext>
  ): void {
    const now = Date.now();
    const recentRequests = entry.requests.filter(
      (req: { timestamp: number; endpoint: string; success: boolean }) =>
        now - req.timestamp < SECURITY_CONSTANTS.RECENT_REQUEST_WINDOW_MS
    );

    // Pattern 1: Rapid requests (> threshold per minute)
    if (recentRequests.length > SECURITY_CONSTANTS.RAPID_REQUEST_THRESHOLD) {
      entry.suspiciousActivity.push({
        type: 'RAPID_REQUESTS',
        description: `${recentRequests.length} requests in the last minute`,
        severity: recentRequests.length > SECURITY_CONSTANTS.RAPID_REQUEST_CRITICAL_THRESHOLD ? 'CRITICAL' :
                  recentRequests.length > SECURITY_CONSTANTS.RAPID_REQUEST_HIGH_THRESHOLD ? 'HIGH' : 'MEDIUM',
        metadata: {
          requestCount: recentRequests.length,
          endpoints: [...new Set(recentRequests.map((r: { endpoint: string }) => r.endpoint))],
          timestamp: now,
        },
      });
    }

    // Pattern 2: High failure rate
    const failedRequests = recentRequests.filter((req: { success: boolean }) => !req.success);
    const failureRate = failedRequests.length / recentRequests.length;

    if (recentRequests.length > SECURITY_CONSTANTS.MIN_REQUESTS_FOR_FAILURE_ANALYSIS &&
        failureRate > SECURITY_CONSTANTS.HIGH_FAILURE_RATE_THRESHOLD) {
      entry.suspiciousActivity.push({
        type: 'INVALID_INPUT_PATTERN',
        description: `High failure rate: ${Math.round(failureRate * 100)}%`,
        severity: failureRate > SECURITY_CONSTANTS.CRITICAL_FAILURE_RATE_THRESHOLD ? 'HIGH' : 'MEDIUM',
        metadata: {
          failureRate,
          failedRequests: failedRequests.length,
          totalRequests: recentRequests.length,
          timestamp: now,
        },
      });
    }

    // Clean up old suspicious activity indicators
    entry.suspiciousActivity = entry.suspiciousActivity.filter(
      (indicator: { metadata: { timestamp?: number } }) =>
        now - (indicator.metadata.timestamp || 0) < SECURITY_CONSTANTS.SUSPICIOUS_ACTIVITY_RETENTION_MS
    );
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.store.entries()) {
      // Remove entries with no recent activity
      if (now - entry.lastReset > this.windowMs * 2) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Global security rate limit store
 */
const securityStore = new SecurityRateLimitStore();

/**
 * Cleanup function for graceful shutdown
 * Call this when shutting down the application to prevent memory leaks
 *
 * @example
 * ```typescript
 * process.on('SIGTERM', () => {
 *   shutdownSecurityStore();
 *   process.exit(0);
 * });
 * ```
 */
export function shutdownSecurityStore(): void {
  securityStore.destroy();
}

/**
 * Enhanced rate limiter with security pattern detection
 */
export function createSecurityRateLimit(config: {
  windowMs: number;
  limit: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}) {
  return rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    message: { message: config.message },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => {
      // Skip in development if bypass is enabled
      const isProduction = process.env.NODE_ENV === 'production';
      if (!isProduction && process.env.BYPASS_GENERAL_RATE_LIMIT === 'true') {
        return true;
      }
      return false;
    },
    keyGenerator: (req) => {
      const userId = req.session?.user?.id || 'anonymous';
      const ip = req.ip || 'unknown';
      return `${ip}-${userId}`;
    },
    handler: (req, res) => {
      const key = `${req.ip}-${req.session?.user?.id || 'anonymous'}`;
      
      // Record security event
      securityStore.recordRequest(key, req.path, false, {
        userId: req.session?.user?.id,
        userRole: req.session?.user?.role,
        isSiteAdmin: req.session?.user?.isSiteAdmin || false,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || '',
        requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      });

      res.status(429).json({ 
        error: {
          type: 'RATE_LIMIT_EXCEEDED',
          message: config.message,
          retryAfter: Math.ceil(config.windowMs / 1000),
        }
      });
    },
    // Note: onLimitReached callback (if needed, can be added to express-rate-limit configuration)
  });
}

/**
 * Input sanitization middleware for organization type operations
 * Prevents injection attacks and validates input format
 */
export function sanitizeOrganizationTypeInput() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const sanitizeString = (value: string): string => {
        if (typeof value !== 'string') return '';

        // Trim and perform initial cleanup
        let cleaned = value
          .trim()
          .replace(/[\x00-\x1F\x7F\x80-\x9F]/g, '') // Remove control characters
          .replace(/[<>\"&]/g, '') // Remove HTML/XML special characters (allow apostrophes)
          .replace(/\.\./g, '') // Remove path traversal attempts
          .replace(/[^\w\s\-'.,]/g, '') // Allow alphanumeric, spaces, hyphens, apostrophes, periods, commas
          .substring(0, 100); // Limit length to prevent DoS

        // Validate against dangerous URL schemes for SSRF protection
        const dangerousPatterns = [
          'javascript:',
          'data:',
          'file:',
          'vbscript:',
          'ftp:',
          'gopher:',
          'dict:',
          'ldap:',
        ];

        const lowerValue = cleaned.toLowerCase();
        if (dangerousPatterns.some(pattern => lowerValue.includes(pattern))) {
          return '';
        }

        return cleaned;
      };

      const sanitizeArray = (value: any[]): string[] => {
        if (!Array.isArray(value)) return [];
        
        return value
          .filter(item => typeof item === 'string')
          .map(sanitizeString)
          .slice(0, 20); // Limit array size
      };

      // Sanitize parameters
      if (req.params) {
        Object.keys(req.params).forEach(key => {
          if (typeof req.params[key] === 'string') {
            req.params[key] = sanitizeString(req.params[key]);
          }
        });
      }

      // Sanitize query parameters
      if (req.query) {
        Object.keys(req.query).forEach(key => {
          const value = req.query[key];
          if (typeof value === 'string') {
            req.query[key] = sanitizeString(value);
          } else if (Array.isArray(value)) {
            req.query[key] = sanitizeArray(value);
          }
        });
      }

      // Sanitize body (for POST/PATCH requests)
      if (req.body && typeof req.body === 'object') {
        const sanitizeObject = (obj: any): any => {
          if (Array.isArray(obj)) {
            return obj.map(sanitizeObject);
          } else if (obj && typeof obj === 'object') {
            const sanitized: any = {};
            Object.keys(obj).forEach(key => {
              const value = obj[key];
              if (typeof value === 'string') {
                sanitized[key] = sanitizeString(value);
              } else if (Array.isArray(value)) {
                sanitized[key] = sanitizeArray(value);
              } else if (typeof value === 'boolean' || typeof value === 'number') {
                sanitized[key] = value;
              } else if (value && typeof value === 'object') {
                sanitized[key] = sanitizeObject(value);
              }
            });
            return sanitized;
          }
          return obj;
        };

        req.body = sanitizeObject(req.body);
      }

      next();
    } catch (error) {
      next(new OrganizationTypeError(
        OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
        'Invalid input format',
        400
      ));
    }
  };
}

/**
 * Storage interface for authorization queries
 */
interface AuthorizationStorage {
  getUserOrganizations(userId: string): Promise<Array<{ organizationId: string }>>;
}

/**
 * Advanced authorization middleware for organization type operations
 * Implements fine-grained access control with context awareness
 */
export function advancedOrganizationTypeAuthorization(options: {
  requiredPermissions: string[];
  allowSiteAdmin?: boolean;
  requireOwnOrganization?: boolean;
  auditAction?: string;
  /** Storage instance required if requireOwnOrganization is true */
  storage?: AuthorizationStorage;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.session?.user;
      if (!user) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
          'Authentication required',
          401
        );
      }

      const context: SecurityContext = {
        userId: user.id,
        userRole: user.role || 'athlete',
        isSiteAdmin: user.isSiteAdmin || false,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || '',
        requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      // Site admins bypass most checks if allowed
      if (options.allowSiteAdmin && context.isSiteAdmin) {
        req.securityContext = context;
        return next();
      }

      // Check role-based permissions
      const hasRequiredRole = options.requiredPermissions.includes(context.userRole);
      if (!hasRequiredRole) {
        // Log privilege escalation attempt
        console.warn('Privilege escalation attempt detected:', {
          ...context,
          requiredPermissions: options.requiredPermissions,
          attemptedAccess: req.path,
        });

        throw new OrganizationTypeError(
          OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
          `Insufficient permissions. Required roles: ${options.requiredPermissions.join(', ')}`,
          403,
          { requiredPermissions: options.requiredPermissions, userRole: context.userRole }
        );
      }

      // Check organization-specific access if required
      if (options.requireOwnOrganization) {
        const requestedOrgId = req.params.id || req.body?.organizationId;
        if (requestedOrgId && options.storage) {
          // Verify user has access to the requested organization
          const userOrganizations = await options.storage.getUserOrganizations(context.userId);
          const hasAccess = userOrganizations.some(
            (uo: { organizationId: string }) => uo.organizationId === requestedOrgId
          );

          if (!hasAccess) {
            throw new OrganizationTypeError(
              OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
              `You don't have access to this organization`,
              403,
              { requestedOrgId, userId: context.userId }
            );
          }
        }
      }

      // Record successful authorization
      const key = `${context.ipAddress}-${context.userId}`;
      securityStore.recordRequest(key, req.path, true, context);

      // Attach security context to request
      req.securityContext = context;

      next();
    } catch (error) {
      if (error instanceof OrganizationTypeError) {
        next(error);
      } else {
        next(new OrganizationTypeError(
          OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
          'Authorization check failed',
          500
        ));
      }
    }
  };
}

/**
 * Comprehensive audit logging middleware for organization type operations
 */
export function auditOrganizationTypeOperation(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Capture original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    
    let responseBody: any;
    let responseStatus = 200;

    // Override response methods to capture response data with type guards
    res.send = function(body) {
      // Only capture response body if it's a valid type for logging
      if (body !== null && body !== undefined) {
        if (typeof body === 'string' || typeof body === 'object') {
          responseBody = body;
        }
      }
      responseStatus = res.statusCode;
      return originalSend.call(this, body);
    };

    res.json = function(body) {
      // Only capture response body if it's a valid object for logging
      if (body !== null && body !== undefined && typeof body === 'object') {
        responseBody = body;
      }
      responseStatus = res.statusCode;
      return originalJson.call(this, body);
    };

    // Continue to next middleware
    next();

    // Log after response is sent
    res.on('finish', async () => {
      const endTime = Date.now();
      const duration = endTime - startTime;

      const context = req.securityContext || {
        userId: req.session?.user?.id || 'anonymous',
        userRole: req.session?.user?.role || 'unknown',
        isSiteAdmin: req.session?.user?.isSiteAdmin || false,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || '',
        requestId: req.headers['x-request-id'] as string || crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      // Determine if operation was successful
      const success = responseStatus >= 200 && responseStatus < 400;
      
      // Extract organization type from request if present
      const organizationType = req.params.orgType || 
                             req.body?.orgType || 
                             req.query?.orgType;

      // Check for suspicious activity
      const key = `${context.ipAddress}-${context.userId}`;
      const suspiciousActivity = securityStore.getSuspiciousActivity(key);

      const auditEntry = {
        action,
        userId: context.userId,
        userRole: context.userRole,
        isSiteAdmin: context.isSiteAdmin,
        organizationType: isValidOrganizationType(organizationType) ? organizationType : undefined,
        
        // Request details
        method: req.method,
        path: req.path,
        query: req.query,
        params: req.params,
        
        // Response details
        statusCode: responseStatus,
        success,
        duration,
        
        // Security context
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        
        // Suspicious activity indicators
        suspiciousActivity: suspiciousActivity.length > 0 ? suspiciousActivity : undefined,
        
        // Error details (if applicable)
        error: !success ? {
          message: responseBody?.error?.message || responseBody?.message,
          type: responseBody?.error?.type,
        } : undefined,
        
        timestamp: new Date().toISOString(),
      };

      try {
        // Log to console (in production, this would go to a structured logging system)
        console.log('Organization Type Audit:', JSON.stringify(auditEntry, null, 2));
        
        // In production, send to audit logging service
        // await auditService.createAuditLog(auditEntry);
        
      } catch (logError) {
        console.error('Failed to create audit log:', logError);
      }
    });
  };
}

/**
 * Security monitoring middleware for detecting attack patterns
 */
export function monitorSecurityThreats() {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = req.securityContext || {
      userId: req.session?.user?.id || 'anonymous',
      isSiteAdmin: req.session?.user?.isSiteAdmin || false,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('user-agent') || '',
      timestamp: new Date().toISOString(),
    };

    const key = `${context.ipAddress}-${context.userId}`;
    const suspiciousActivity = securityStore.getSuspiciousActivity(key);

    // Check for critical security threats
    const criticalThreats = suspiciousActivity.filter(
      activity => activity.severity === 'CRITICAL'
    );

    if (criticalThreats.length > 0) {
      // In production, this would trigger security alerts
      console.error('CRITICAL SECURITY THREAT DETECTED:', {
        context,
        threats: criticalThreats,
        requestPath: req.path,
        timestamp: new Date().toISOString(),
      });

      // Could block the request or require additional verification
      // For now, we'll log and continue
    }

    next();
  };
}

/**
 * Payload size validation middleware
 */
export function validatePayloadSize(maxSize: number = DEFAULT_SECURITY_CONFIG.maxPayloadSize) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      throw new OrganizationTypeError(
        OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
        `Payload too large. Maximum size: ${maxSize} bytes`,
        413
      );
    }

    next();
  };
}

/**
 * CSRF protection for organization type operations
 */
export function organizationTypeCSRFProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for GET requests
    if (req.method === 'GET') {
      return next();
    }

    // Check for CSRF token in headers
    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;
    const sessionCSRF = (req.session as any)?.csrfToken;

    // Use timing-safe comparison to prevent timing attacks
    // Both tokens must be strings and same length for timingSafeEqual
    if (!csrfToken || !sessionCSRF) {
      throw new OrganizationTypeError(
        OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
        'Invalid CSRF token',
        403
      );
    }

    // Convert to buffers for timing-safe comparison
    const tokenBuffer = Buffer.from(String(csrfToken));
    const sessionBuffer = Buffer.from(String(sessionCSRF));

    // Check length first (different lengths mean different tokens)
    // Then use timing-safe comparison for same-length tokens
    if (tokenBuffer.length !== sessionBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, sessionBuffer)) {
      throw new OrganizationTypeError(
        OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
        'Invalid CSRF token',
        403
      );
    }

    next();
  };
}

/**
 * Security headers middleware for organization type routes
 */
export function setSecurityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Only send detailed error information in development
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('X-Powered-By', ''); // Hide server information
    }

    next();
  };
}

/**
 * Type augmentation for Express Request to include security context
 */
declare module 'express' {
  interface Request {
    securityContext?: SecurityContext;
  }
}

export { SecurityContext, SuspiciousActivityIndicator, SecurityConfig };