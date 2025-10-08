/**
 * Mock Redis module for tests
 *
 * Redis is an optional dependency that may not be installed in test environments.
 * This mock allows tests to run without Redis by returning null from createClient,
 * which causes the application to fall back to memory-based sessions.
 *
 * Usage: Automatically imported by Vitest when Redis is not available.
 */

export const createClient = () => {
  return null;
};

export default {
  createClient,
};
