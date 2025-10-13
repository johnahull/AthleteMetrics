/**
 * Setup file for integration tests
 * Configures test environment and database
 *
 * NOTE: Integration tests require a PostgreSQL database.
 * Set DATABASE_URL, SESSION_SECRET, ADMIN_USER, ADMIN_EMAIL, and ADMIN_PASSWORD
 * environment variables before running tests.
 */

// Set test environment variables BEFORE any imports
// These will be overridden by actual env vars in CI/CD
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123456789';

// DATABASE_URL validation with production/staging protection
const dbUrl = process.env.DATABASE_URL || '';

// Block production and staging databases
const forbiddenPatterns = [
  'railway.app',      // Railway production/staging
  'neon.tech',        // Neon production/staging
  'supabase.co',      // Supabase production/staging
  'amazonaws.com',    // AWS RDS
  'cloudflare.com',   // Cloudflare D1
  'planetscale',      // PlanetScale
  'prod',             // Any URL containing "prod"
  'production',       // Any URL containing "production"
  'staging',          // Any URL containing "staging"
];

// Check if DATABASE_URL matches any forbidden pattern
const matchedPattern = forbiddenPatterns.find(pattern =>
  dbUrl.toLowerCase().includes(pattern.toLowerCase())
);

if (matchedPattern) {
  const sanitizedUrl = dbUrl.replace(/:[^:@]*@/, ':***@'); // Hide password
  console.error('\n' + '='.repeat(80));
  console.error('🚫 CRITICAL ERROR: Production/Staging Database Detected');
  console.error('='.repeat(80));
  console.error(`DATABASE_URL contains forbidden pattern: "${matchedPattern}"`);
  console.error(`URL: ${sanitizedUrl}`);
  console.error('\nIntegration tests MUST run against a local or dedicated test database.');
  console.error('To fix this:');
  console.error('  1. Create a local test database: createdb athletemetrics_test');
  console.error('  2. Set DATABASE_URL to: postgresql://localhost:5432/athletemetrics_test');
  console.error('  3. Or use .env.test file for test-specific configuration');
  console.error('='.repeat(80) + '\n');
  throw new Error(`Cannot run tests against ${matchedPattern} database`);
}

// Require DATABASE_URL to be set
if (!dbUrl) {
  throw new Error(
    'DATABASE_URL environment variable must be set for integration tests. ' +
    'Use a PostgreSQL database URL (e.g., postgresql://user:pass@localhost:5432/testdb)'
  );
}

// Warn if DATABASE_URL doesn't look like a test database
if (!dbUrl.includes('localhost') && !dbUrl.toLowerCase().includes('test')) {
  const sanitizedUrl = dbUrl.replace(/:[^:@]*@/, ':***@');
  console.warn('\n' + '='.repeat(80));
  console.warn('⚠️  WARNING: DATABASE_URL does not appear to be a test database');
  console.warn('='.repeat(80));
  console.warn(`URL: ${sanitizedUrl}`);
  console.warn('\nFor safety, DATABASE_URL should include "localhost" or "test".');
  console.warn('If this is intentional (e.g., Docker container), you can ignore this warning.');
  console.warn('='.repeat(80) + '\n');
}

// Log validated database (with hidden password)
const sanitizedUrl = dbUrl.replace(/:[^:@]*@/, ':***@');
console.log('✅ Integration test database validated:', sanitizedUrl);
console.log('   Environment:', process.env.NODE_ENV || 'test');

import { beforeAll, afterAll } from 'vitest';
import { closeDatabase } from '../../server/db.js';

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(async () => {
  // Suppress console logs during tests except for errors
  console.log = () => {}; // Suppress normal logs
  console.error = originalConsoleError; // Keep errors visible
});

afterAll(async () => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;

  // Close database connection to prevent leaks
  try {
    await closeDatabase();
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
});