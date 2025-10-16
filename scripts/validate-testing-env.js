#!/usr/bin/env node

/**
 * Database Isolation Validation Script
 *
 * Ensures the testing environment is using a separate database from production/staging.
 * This prevents accidental data corruption or loss during testing deployments.
 *
 * Usage: node scripts/validate-testing-env.js
 *
 * Exit codes:
 *   0 - Validation passed (safe to deploy)
 *   1 - Validation failed (database isolation issue detected)
 */

const PRODUCTION_DB_PATTERNS = [
  /athletemetrics[_-]?prod/i,
  /athletemetrics$/i, // Default production database name
  /production/i,
  /main[_-]?db/i
];

const STAGING_DB_PATTERNS = [
  /athletemetrics[_-]?staging/i,
  /staging/i,
  /stg[_-]?db/i
];

// Production hostname patterns to detect production database servers
const PRODUCTION_HOST_PATTERNS = [
  /\.prod\./i,
  /production.*\.railway\.app/i,
  /aws-.*-prod/i,
  /azure.*prod/i,
  /gcp.*prod/i
];

// Required environment variables for the application to function
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'ADMIN_USER',
  'ADMIN_PASS'
];

function validateDatabaseIsolation() {
  const databaseUrl = process.env.DATABASE_URL;
  const nodeEnv = process.env.NODE_ENV;

  // Skip validation if not in testing environment
  if (nodeEnv !== 'testing') {
    console.log(`ℹ️  Skipping database isolation validation (NODE_ENV=${nodeEnv})`);
    return true;
  }

  console.log('🔍 Validating database isolation for testing environment...\n');

  // Check if DATABASE_URL is set
  if (!databaseUrl) {
    console.error('❌ VALIDATION FAILED: DATABASE_URL environment variable is not set');
    console.error('   Please configure a database for your testing environment.\n');
    console.error('   Run: railway add  # Then select PostgreSQL\n');
    return false;
  }

  // Extract database name and hostname from connection string
  // Format: postgresql://user:pass@host:port/database_name?options
  const dbNameMatch = databaseUrl.match(/\/([^/?]+)(?:\?|$)/);
  const databaseName = dbNameMatch ? dbNameMatch[1] : '';

  const hostMatch = databaseUrl.match(/\/\/[^@]+@([^:/]+)/);
  const hostname = hostMatch ? hostMatch[1] : '';

  console.log(`   Database URL: ${databaseUrl.substring(0, 30)}...`);
  console.log(`   Database Host: ${hostname}`);
  console.log(`   Database Name: ${databaseName}`);
  console.log(`   Environment: ${nodeEnv}\n`);

  // Check database name against production patterns
  for (const pattern of PRODUCTION_DB_PATTERNS) {
    if (pattern.test(databaseName)) {
      console.error('❌ VALIDATION FAILED: Testing environment appears to be using a PRODUCTION database');
      console.error(`   Database name "${databaseName}" matches production pattern: ${pattern}\n`);
      console.error('   🚨 DANGER: Deploying to testing could corrupt production data!\n');
      console.error('   To fix this:');
      console.error('   1. Create a separate database for testing:');
      console.error('      railway add --environment testing  # Select PostgreSQL');
      console.error('   2. Or manually set DATABASE_URL to a testing-specific database:');
      console.error('      railway variables --set "DATABASE_URL=postgresql://...athletemetrics_testing"\n');
      return false;
    }
  }

  // Check hostname against production patterns (prevents bypass via query params)
  for (const pattern of PRODUCTION_HOST_PATTERNS) {
    if (pattern.test(hostname) || pattern.test(databaseUrl)) {
      console.error('❌ VALIDATION FAILED: Testing environment appears to be using a PRODUCTION database server');
      console.error(`   Database host "${hostname}" matches production pattern: ${pattern}\n`);
      console.error('   🚨 DANGER: Deploying to testing could corrupt production data!\n');
      console.error('   To fix this:');
      console.error('   1. Create a separate database for testing:');
      console.error('      railway add --environment testing  # Select PostgreSQL');
      console.error('   2. Or manually set DATABASE_URL to a testing-specific database server\n');
      return false;
    }
  }

  // Check against staging patterns
  for (const pattern of STAGING_DB_PATTERNS) {
    if (pattern.test(databaseName)) {
      console.error('⚠️  WARNING: Testing environment appears to be using a STAGING database');
      console.error(`   Database name "${databaseName}" matches staging pattern: ${pattern}\n`);
      console.error('   Recommendation: Create a dedicated testing database for better isolation:');
      console.error('      railway add --environment testing  # Select PostgreSQL\n');
      // This is a warning, not a hard failure
      console.log('   Continuing deployment (this is not a production database)...\n');
      return true;
    }
  }

  // Check required environment variables
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ VALIDATION FAILED: Missing required environment variables');
    console.error(`   Missing: ${missingVars.join(', ')}\n`);
    console.error('   To fix this:');
    console.error('   1. Set missing variables in Railway testing environment:');
    console.error('      railway variables --environment testing');
    console.error('   2. See RAILWAY_TESTING_SETUP.md for required variable values\n');
    return false;
  }

  // Validation passed
  console.log('✅ Database isolation validation PASSED');
  console.log(`   Database "${databaseName}" appears to be isolated for testing`);
  console.log(`✅ All required environment variables are set\n`);
  return true;
}

// Run validation
const isValid = validateDatabaseIsolation();

// Exit with appropriate code
process.exit(isValid ? 0 : 1);
