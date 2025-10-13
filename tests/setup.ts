/**
 * Global test setup and protection
 *
 * This file runs before any tests and ensures tests never run against production databases.
 *
 * SECURITY: Blocks tests from running against production/staging databases
 */

import { beforeAll } from 'vitest';

beforeAll(() => {
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
    console.error('\nTests MUST run against a local or dedicated test database.');
    console.error('To fix this:');
    console.error('  1. Create a local test database: createdb athletemetrics_test');
    console.error('  2. Set DATABASE_URL to: postgresql://localhost:5432/athletemetrics_test');
    console.error('  3. Or use .env.test file for test-specific configuration');
    console.error('='.repeat(80) + '\n');
    throw new Error(`Cannot run tests against ${matchedPattern} database`);
  }

  // Require explicit test database (localhost or contains "test")
  if (!dbUrl.includes('localhost') && !dbUrl.toLowerCase().includes('test')) {
    const sanitizedUrl = dbUrl.replace(/:[^:@]*@/, ':***@');
    console.error('\n' + '='.repeat(80));
    console.error('⚠️  WARNING: DATABASE_URL does not appear to be a test database');
    console.error('='.repeat(80));
    console.error(`URL: ${sanitizedUrl}`);
    console.error('\nFor safety, DATABASE_URL should include "localhost" or "test".');
    console.error('If this is intentional (e.g., Docker container), you can ignore this warning.');
    console.error('='.repeat(80) + '\n');
  }

  // Validate DATABASE_URL is set
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
      'Tests require a PostgreSQL connection string.'
    );
  }

  // Log validated database (with hidden password)
  const sanitizedUrl = dbUrl.replace(/:[^:@]*@/, ':***@');
  console.log('✅ Test database validated:', sanitizedUrl);
  console.log('   Environment:', process.env.NODE_ENV || 'development');
});
