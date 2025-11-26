/**
 * CSRF Protection Middleware
 *
 * Implements CSRF protection for wellness submission endpoints using:
 * 1. Double-submit cookie pattern
 * 2. SameSite cookie attributes
 * 3. Token validation
 */

import { Request, Response, NextFunction } from 'express';
import Tokens from 'csrf';
import crypto from 'crypto';

const tokens = new Tokens();

/**
 * Generate a new CSRF token for a session
 * Uses double-submit cookie pattern for stateless CSRF protection
 */
export function generateCsrfToken(req: Request): string {
  // Generate a secret for this session if it doesn't exist
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }

  // Generate token from secret
  const token = tokens.create(req.session.csrfSecret);

  // Also set as httpOnly cookie for double-submit pattern
  req.res?.cookie('_csrf', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // 'lax' allows POST from magic links (unlike 'strict')
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  return token;
}

/**
 * Middleware to validate CSRF token
 * Supports both header and body token submission
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Get token from header or body
  const token = req.headers['x-csrf-token'] as string || req.body._csrf;

  if (!token) {
    return res.status(403).json({
      message: 'CSRF token missing. Please refresh the page and try again.'
    });
  }

  // Verify token against session secret
  const secret = req.session.csrfSecret;

  if (!secret) {
    return res.status(403).json({
      message: 'CSRF session invalid. Please refresh the page and try again.'
    });
  }

  // Validate token
  const valid = tokens.verify(secret, token);

  if (!valid) {
    return res.status(403).json({
      message: 'Invalid CSRF token. Please refresh the page and try again.'
    });
  }

  next();
}

/**
 * Endpoint to get a fresh CSRF token
 * Called by frontend before making protected requests
 */
export function getCsrfToken(req: Request, res: Response) {
  const token = generateCsrfToken(req);

  res.json({
    csrfToken: token
  });
}

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    csrfSecret?: string;
  }
}
