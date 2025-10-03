/**
 * React Query Cache Configuration
 * Centralized cache durations for different data types
 *
 * Performance Enhancement: Reduces redundant API calls by implementing
 * strategic cache durations based on data mutability patterns
 */

export const CACHE_DURATIONS = {
  /**
   * Measurement data (5 minutes)
   * - Frequently accessed during analytics sessions
   * - Can be cached for moderate durations
   */
  MEASUREMENTS: 5 * 60 * 1000, // 5 minutes

  /**
   * Teams and Organizations (10 minutes)
   * - Structure data that changes infrequently
   * - Longer cache duration appropriate
   */
  TEAMS: 10 * 60 * 1000, // 10 minutes
  ORGANIZATIONS: 10 * 60 * 1000, // 10 minutes

  /**
   * User and Athlete data (10 minutes)
   * - Profile data that doesn't change frequently
   * - Balance between freshness and performance
   */
  USERS: 10 * 60 * 1000, // 10 minutes
  ATHLETES: 10 * 60 * 1000, // 10 minutes

  /**
   * Analytics data (5 minutes)
   * - Computed results that can be cached
   * - May need refresh for recent measurements
   */
  ANALYTICS: 5 * 60 * 1000, // 5 minutes

  /**
   * Static configuration (1 hour)
   * - Rarely changing data (invitations, stats)
   * - Safe to cache for longer periods
   */
  STATIC: 60 * 60 * 1000, // 1 hour

  /**
   * Dashboard stats (2 minutes)
   * - Quick overview data that should stay relatively fresh
   * - Short cache for better UX
   */
  DASHBOARD: 2 * 60 * 1000, // 2 minutes
} as const;

/**
 * Garbage collection times (time to keep in cache after query becomes inactive)
 * Typically 2x the stale time for better UX on navigation
 */
export const GC_TIMES = {
  MEASUREMENTS: CACHE_DURATIONS.MEASUREMENTS * 2,
  TEAMS: CACHE_DURATIONS.TEAMS * 2,
  ORGANIZATIONS: CACHE_DURATIONS.ORGANIZATIONS * 2,
  USERS: CACHE_DURATIONS.USERS * 2,
  ATHLETES: CACHE_DURATIONS.ATHLETES * 2,
  ANALYTICS: CACHE_DURATIONS.ANALYTICS * 2,
  STATIC: CACHE_DURATIONS.STATIC * 2,
  DASHBOARD: CACHE_DURATIONS.DASHBOARD * 2,
} as const;

/**
 * Helper to get cache config for a specific data type
 */
export function getCacheConfig(type: keyof typeof CACHE_DURATIONS) {
  return {
    staleTime: CACHE_DURATIONS[type],
    gcTime: GC_TIMES[type],
  };
}
