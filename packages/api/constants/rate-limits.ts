/**
 * Rate limit constants for API endpoints
 * Centralized configuration for all rate limiting thresholds
 */

export const RATE_LIMITS = {
  /** Standard read operations (team lists, measurement queries) */
  STANDARD: 100,

  /** High-volume read operations (measurements with filters) */
  HIGH_VOLUME: 200,

  /** Mutation operations (create, update, archive) */
  MUTATION: 20,

  /** Delete operations (stricter limit) */
  DELETE: 30,

  /** Analytics queries (computationally expensive) */
  ANALYTICS: parseInt(process.env.ANALYTICS_RATE_LIMIT || '50'),
} as const;

/** Rate limit window duration (15 minutes in milliseconds) */
export const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.ANALYTICS_RATE_WINDOW_MS || '900000'
);
