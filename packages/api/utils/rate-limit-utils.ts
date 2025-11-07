import type { Request } from 'express';

/**
 * Determines whether rate limiting should be skipped for a given request.
 *
 * Rate limiting is skipped for:
 * - Localhost requests (development)
 * - Test environment (NODE_ENV=test)
 * - Development/staging with bypass environment variable set
 *
 * Production safeguard: Rate limiting is NEVER bypassed in production environments,
 * regardless of environment variable settings.
 *
 * @param req - Express request object
 * @param rateLimitType - Type of rate limiting ('auth' | 'general' | 'analytics' | 'upload')
 * @returns true if rate limiting should be skipped, false otherwise
 */
export function shouldSkipRateLimiting(
  req: Request,
  rateLimitType: 'auth' | 'general' | 'analytics' | 'upload' = 'general'
): boolean {
  const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  const isTestEnv = process.env.NODE_ENV === 'test';
  const isProduction = process.env.NODE_ENV === 'production';

  // Determine which bypass environment variable to check
  const bypassEnvVar = rateLimitType === 'analytics'
    ? process.env.BYPASS_ANALYTICS_RATE_LIMIT
    : process.env.BYPASS_GENERAL_RATE_LIMIT;

  // Only allow bypass in non-production environments
  const bypassForDev = !isProduction && bypassEnvVar === 'true';

  const shouldSkip = isLocalhost || isTestEnv || bypassForDev;

  // Log rate limit bypasses for security monitoring (except in test env to avoid noise)
  if (shouldSkip && !isTestEnv) {
    console.warn(`⚠️ Rate limiting bypassed for ${rateLimitType}:`, {
      ip: req.ip,
      reason: isLocalhost ? 'localhost' : `BYPASS_${rateLimitType.toUpperCase()}_RATE_LIMIT env var`,
      environment: process.env.NODE_ENV,
      path: req.path
    });
  }

  return shouldSkip;
}
