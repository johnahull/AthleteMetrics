/**
 * Pagination constants for API queries
 * Centralized configuration for pagination limits and defaults
 *
 * @remarks
 * These limits prevent expensive database scans and ensure consistent
 * pagination behavior across all API endpoints.
 *
 * @example
 * ```typescript
 * import { PAGINATION } from './constants/pagination';
 *
 * const limit = Math.min(filters?.limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
 * const offset = Math.min(filters?.offset || 0, PAGINATION.MAX_OFFSET);
 * ```
 */

export const PAGINATION = {
  /**
   * Default number of records per page for measurement queries
   * @default 1000
   */
  DEFAULT_LIMIT: 1000,

  /**
   * Maximum number of records per page for measurement queries
   * Increased from 10k to 20k to support comprehensive chart data with all historical dates
   * @default 20000
   */
  MAX_LIMIT: 20000,

  /**
   * Maximum offset for pagination
   * Capped at 10k to prevent expensive database scans on deep pagination
   * @default 10000
   */
  MAX_OFFSET: 10000,

  /**
   * Maximum records for analytics queries
   * Used for performance-intensive statistical calculations
   * @default 10000
   */
  ANALYTICS_LIMIT: 10000,
} as const;
