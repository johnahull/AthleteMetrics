/**
 * Setup file for integration tests
 * Configures test environment and database
 */

// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-integration.db';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'password123456789';

import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {

  // Suppress console logs during tests except for errors
  const originalConsoleLog = console.log;
  console.log = () => {}; // Suppress normal logs
  console.error = originalConsoleLog; // Keep errors visible
});

afterAll(async () => {
  // Cleanup test database
  try {
    const fs = await import('fs');
    if (fs.existsSync('./test-integration.db')) {
      fs.unlinkSync('./test-integration.db');
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});