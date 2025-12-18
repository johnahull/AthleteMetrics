/**
 * Request Cache Middleware
 *
 * Attaches a request-scoped cache (Map) to each incoming request.
 * This enables caching of expensive operations within a single request lifecycle,
 * reducing redundant database queries and API calls.
 *
 * Use Case: getUserOrganizations() is called 8+ times per request in some routes.
 * With request caching, we can reduce this to 1 DB query per user per request.
 *
 * Cache Scope: Per-request (not shared across requests)
 * Cache Lifecycle: Created on request start, garbage collected after response
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that attaches an empty Map to req.cache for request-scoped caching
 */
export function requestCacheMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Attach empty cache Map to request
  req.cache = new Map<string, unknown>();

  // Continue to next middleware
  next();
}
