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
 * @example
 * ```typescript
 * import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from './constants/rate-limits';
 *
 * const limiter = rateLimit({
 *   windowMs: RATE_LIMIT_WINDOW_MS,
 *   limit: RATE_LIMITS.MUTATION,
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
  ANALYTICS: parseInt(process.env.ANALYTICS_RATE_LIMIT || '50', 10),
} as const;

/**
 * Rate limit window duration in milliseconds
 * @default 900000 (15 minutes, configurable via ANALYTICS_RATE_WINDOW_MS env var)
 */
export const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.ANALYTICS_RATE_WINDOW_MS || '900000',
  10
);
