/**
 * CSRF Protection Routes
 *
 * Provides CSRF token generation and validation middleware
 */

import type { Express, Request, Response, NextFunction } from "express";
import csrf from "csrf";

// Create CSRF tokens instance
const csrfTokens = new csrf();

/**
 * CSRF protection middleware
 * Validates CSRF tokens for state-changing requests
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET requests (safe operations)
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  // Skip CSRF for certain API endpoints that use other authentication
  // Note: req.path is relative to the mount point, so '/api' prefix is not included
  // - /login and /register: Pre-authentication endpoints
  // - /invitations/:token/accept: Public endpoint for new users without sessions
  //   Token format restricted to alphanumeric, dash, and underscore to prevent path traversal
  // - /import/photo, /import/parse-csv, /import/:type: File upload endpoints that use multipart/form-data
  //   SECURITY: Only specific multipart endpoints bypass CSRF, not all /import/* routes
  const skipCsrfPaths = ['/login', '/register', '/import/photo', '/import/parse-csv'];
  const skipCsrfPatterns = [
    /^\/invitations\/[a-zA-Z0-9_-]+\/accept$/,
    /^\/import\/(athletes|measurements)$/  // Dynamic import type endpoints (multipart only)
  ];

  const pathWithoutApi = req.path.replace(/^\/api/, '');
  if (skipCsrfPaths.includes(pathWithoutApi) || skipCsrfPatterns.some(pattern => pattern.test(pathWithoutApi))) {
    return next();
  }

  // Check for CSRF token in headers or body
  const token = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || req.body._csrf;

  if (!token) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  // Validate CSRF token
  const secret = (req.session as any)?.csrfSecret;
  if (!secret) {
    return res.status(403).json({ error: 'Invalid session' });
  }

  try {
    if (!csrfTokens.verify(secret, token as string)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  } catch (error) {
    return res.status(403).json({ error: 'CSRF token validation failed' });
  }

  next();
};

/**
 * Register CSRF routes
 */
export function registerCsrfRoutes(app: Express) {
  /**
   * Generate CSRF token endpoint
   * GET /api/csrf-token
   */
  app.get('/api/csrf-token', (req: Request, res: Response) => {
    const secret = csrfTokens.secretSync();
    const token = csrfTokens.create(secret);

    // Store secret in session
    (req.session as any).csrfSecret = secret;

    // Add header to track route source
    res.setHeader('X-Route-Source', 'csrf-routes');

    res.json({ csrfToken: token });
  });
}
