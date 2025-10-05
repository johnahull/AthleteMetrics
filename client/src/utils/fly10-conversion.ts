/**
 * FLY10_TIME Conversion Utilities
 * Convert between seconds and mph for 10-yard fly time
 */

export const FLY10_YARDS = 10;
export const YARDS_TO_MILES = 1 / 1760;
export const SECONDS_TO_HOURS = 1 / 3600;

/**
 * Convert FLY10_TIME from seconds to mph
 * Formula: mph = (10 yards / 1760 yards/mile) / (seconds / 3600 seconds/hour)
 * Simplifies to: mph = 20.45454545... / seconds
 */
export function fly10ToMph(seconds: number): number {
  if (seconds <= 0 || !isFinite(seconds)) return 0;
  return (FLY10_YARDS * YARDS_TO_MILES) / (seconds * SECONDS_TO_HOURS);
}

/**
 * Format FLY10_TIME value to show both representations
 * @param seconds - Time in seconds
 * @param format - Display format preference ('time-first' shows seconds first, 'speed-first' shows mph first)
 */
export function formatFly10Dual(
  seconds: number,
  format: 'time-first' | 'speed-first' = 'time-first'
): string {
  const mph = fly10ToMph(seconds);

  if (format === 'speed-first') {
    return `${mph.toFixed(2)} mph (${seconds.toFixed(2)}s)`;
  }
  return `${seconds.toFixed(2)}s (${mph.toFixed(2)} mph)`;
}

/**
 * Check if a metric is FLY10_TIME
 *
 * Note: This intentionally only returns true for FLY10_TIME, not TOP_SPEED.
 * While both measure the same thing (speed over 10 yards), the dual display
 * format (seconds + mph) is only appropriate when the primary unit is seconds.
 *
 * - FLY10_TIME charts show: "1.95s (10.5 mph)" - dual display makes sense
 * - TOP_SPEED charts show: "10.5 mph" only - dual display would be confusing
 */
export function isFly10Metric(metric: string): boolean {
  return metric === 'FLY10_TIME';
}
