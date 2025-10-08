/**
 * Mock connect-redis module for tests
 *
 * connect-redis is an optional dependency that may not be installed in test environments.
 * This mock provides a minimal RedisStore class that allows the session middleware to
 * initialize without actual Redis connectivity, falling back to memory-based sessions.
 *
 * Usage: Automatically imported by Vitest when connect-redis is not available.
 */

export class RedisStore {
  constructor() {}
}

export default RedisStore;
