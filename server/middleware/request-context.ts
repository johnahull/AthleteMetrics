/**
 * Request context middleware
 *
 * Adds request-specific context including:
 * - Request ID for tracing
 * - User information from session
 * - Timing information
 * - Request metadata
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

// Extend Express Request to include our context
declare global {
  namespace Express {
    interface Request {
      id: string;
      startTime: number;
      context: {
        userId?: string;
        organizationId?: string;
        role?: string;
        isSiteAdmin: boolean;
        ip: string;
        userAgent?: string;
      };
    }
  }
}

/**
 * Add request ID and timing
 */
export function addRequestId(req: Request, res: Response, next: NextFunction) {
  req.id = randomUUID();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.id);

  next();
}

/**
 * Add request context from session and request
 */
export function addRequestContext(req: Request, res: Response, next: NextFunction) {
  const ip = (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.socket.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();

  const userAgent = req.headers['user-agent'];

  req.context = {
    userId: req.session?.user?.id,
    organizationId: req.session?.user?.primaryOrganizationId,
    role: req.session?.user?.role,
    isSiteAdmin: req.session?.user?.isSiteAdmin === true,
    ip,
    userAgent,
  };

  next();
}

/**
 * Log request start
 */
export function logRequestStart(req: Request, res: Response, next: NextFunction) {
  logger.debug(`→ ${req.method} ${req.path}`, {
    requestId: req.id,
    userId: req.context?.userId,
    organizationId: req.context?.organizationId,
    ip: req.context?.ip,
    userAgent: req.context?.userAgent,
  });

  next();
}

/**
 * Log request completion
 */
export function logRequestEnd(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;

  res.send = function (data: any) {
    const duration = Date.now() - req.startTime;

    logger.logResponse(
      req.method,
      req.path,
      res.statusCode,
      duration,
      {
        requestId: req.id,
        userId: req.context?.userId,
        organizationId: req.context?.organizationId,
      }
    );

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Combined request context middleware
 */
export const requestContext = [
  addRequestId,
  addRequestContext,
  logRequestStart,
  logRequestEnd,
];
