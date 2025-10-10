/**
 * Setup file for integration tests
 * Configures test environment and database
 *
 * NOTE: Integration tests require a PostgreSQL database.
 * Set DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD
 * environment variables before running tests.
 */

// Set test environment variables BEFORE any imports
// These will be overridden by actual env vars in CI/CD
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123456789';

// DATABASE_URL must be provided - no default
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable must be set for integration tests. ' +
    'Use a PostgreSQL database URL (e.g., postgresql://user:pass@localhost:5432/testdb)'
  );
}

import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  // Suppress console logs during tests except for errors
  const originalConsoleLog = console.log;
  console.log = () => {}; // Suppress normal logs
  console.error = originalConsoleLog; // Keep errors visible
});

afterAll(async () => {
  // Cleanup is handled by individual test files
});