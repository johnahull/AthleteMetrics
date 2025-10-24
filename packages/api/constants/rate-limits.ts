/**
 * Rate limit constants for API endpoints
 * Centralized configuration for all rate limiting thresholds
 *
 * @remarks
 * All limits are applied per 15-minute window (RATE_LIMIT_WINDOW_MS).
 * The window and analytics limit can be customized via environment variables:
 * - ANALYTICS_RATE_LIMIT: Override analytics request limit
 * - ANALYTICS_RATE_WINDOW_MS: Override window duration in milliseconds
 *
 * Rate limiters use standardHeaders: 'draft-7', which sends these response headers:
 * - `RateLimit-Limit` - Maximum requests allowed in the window
 * - `RateLimit-Remaining` - Requests remaining in current window
 * - `RateLimit-Reset` - Unix timestamp when the window resets
 *
 * When rate limit is exceeded, returns HTTP 429 with:
 * - `Retry-After` - Seconds until the rate limit resets
 *
 * Clients can use these headers to implement adaptive throttling and retry logic.
 *
 * @example
 * ```typescript
 * import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from './constants/rate-limits';
 *
 * const limiter = rateLimit({
 *   windowMs: RATE_LIMIT_WINDOW_MS,
 *   limit: RATE_LIMITS.MUTATION,
 *   standardHeaders: 'draft-7', // Enables RateLimit-* headers
 * });
 * ```
 */

export const RATE_LIMITS = {
  /**
   * Standard read operations (team lists, measurement queries)
   * @default 100 requests per 15-minute window
   */
  STANDARD: 100,

  /**
   * High-volume read operations (measurements with filters)
   * @default 200 requests per 15-minute window
   */
  HIGH_VOLUME: 200,

  /**
   * Mutation operations (create, update, archive)
   * @default 20 requests per 15-minute window
   */
  MUTATION: 20,

  /**
   * Delete operations (stricter limit)
   * @default 30 requests per 15-minute window
   */
  DELETE: 30,

  /**
   * Analytics queries (computationally expensive)
   * @default 50 requests per 15-minute window (configurable via ANALYTICS_RATE_LIMIT env var)
   */
  ANALYTICS: (() => {
    const envValue = process.env.ANALYTICS_RATE_LIMIT;
    const parsed = parseInt(envValue || '50', 10);
    if (envValue && (isNaN(parsed) || parsed <= 0)) {
      console.warn(`Invalid ANALYTICS_RATE_LIMIT environment variable: "${envValue}". Using default value of 50.`);
      return 50;
    }
    return parsed > 0 ? parsed : 50;
  })(),
} as const;

/**
 * Rate limit window duration in milliseconds
 * @default 900000 (15 minutes, configurable via ANALYTICS_RATE_WINDOW_MS env var)
 */
export const RATE_LIMIT_WINDOW_MS = (() => {
  const envValue = process.env.ANALYTICS_RATE_WINDOW_MS;
  const parsed = parseInt(envValue || '900000', 10);
  if (envValue && (isNaN(parsed) || parsed <= 0)) {
    console.warn(`Invalid ANALYTICS_RATE_WINDOW_MS environment variable: "${envValue}". Using default value of 900000ms (15 minutes).`);
    return 900000;
  }
  return parsed > 0 ? parsed : 900000;
})();
