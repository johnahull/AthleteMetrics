/**
 * Shared test utilities for unit and integration tests
 */

/**
 * Generates a unique suffix for test data to prevent collisions in parallel test execution.
 *
 * Format: `${timestamp}_${random}` where:
 * - timestamp: Last 6 digits of current timestamp (reduces collision risk while staying compact)
 * - random: 3-5 character alphanumeric string (uppercase)
 *
 * @param options Configuration options for suffix generation
 * @param options.compact If true, generates shorter format without underscore (e.g., "123456ABC")
 * @returns Unique suffix string suitable for test data codes
 *
 * @example
 * const suffix = generateTestUniqueSuffix(); // "123456_ABC"
 * const compactSuffix = generateTestUniqueSuffix({ compact: true }); // "123456ABC"
 */
export function generateTestUniqueSuffix(options: { compact?: boolean } = {}): string {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits
  const randomPart = Math.random()
    .toString(36)
    .substring(2, 5)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return options.compact
    ? `${timestamp}${randomPart}` // e.g., "123456ABC" (fits varchar(20))
    : `${timestamp}_${randomPart}`; // e.g., "123456_ABC" (default)
}
