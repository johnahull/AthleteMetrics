#!/usr/bin/env tsx
/**
 * Database Migration Runner
 *
 * Applies pending migrations from the migrations/ directory to the database.
 * This script is used during deployments to ensure the database schema matches
 * the application code.
 *
 * Usage:
 *   npm run db:migrate
 *   tsx server/migrate.ts
 *
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *
 * Exit Codes:
 *   0 - Success (migrations applied or no pending migrations)
 *   1 - Error (migration failed, invalid configuration, etc.)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('🔄 Starting database migration...\n');

  // Validate environment
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is required');
    console.error('   Set DATABASE_URL to your PostgreSQL connection string');
    process.exit(1);
  }

  // Validate migrations directory
  const migrationsFolder = path.join(__dirname, '..', 'migrations');
  console.log(`📁 Migrations directory: ${migrationsFolder}`);

  // Create database connection specifically for migrations
  // Use a longer timeout for migration operations
  const migrationClient = postgres(DATABASE_URL, {
    max: 1, // Single connection for migrations
    connect_timeout: 30, // 30 seconds for migration connections
    idle_timeout: 0, // Don't close idle connections during migration
    ssl: DATABASE_URL.includes('localhost') || process.env.NODE_ENV === 'test'
      ? false
      : 'require',
  });

  const db = drizzle(migrationClient);

  try {
    console.log('🔍 Checking for pending migrations...\n');

    // Run migrations
    await migrate(db, { migrationsFolder });

    console.log('\n✅ Migration completed successfully!');
    console.log('   Database schema is up to date\n');

    // Exit with success
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed!\n');

    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('\nStack trace:');
      console.error(error.stack);
    } else {
      console.error('Unknown error:', error);
    }

    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Verify DATABASE_URL is correct');
    console.error('   2. Ensure database is accessible');
    console.error('   3. Check migration files in migrations/ directory');
    console.error('   4. Review error message above for details\n');

    // Exit with error
    process.exit(1);

  } finally {
    // Always close the database connection
    try {
      await migrationClient.end();
      console.log('🔌 Database connection closed');
    } catch (closeError) {
      console.warn('⚠️  Warning: Error closing database connection:', closeError);
    }
  }
}

// Run migrations
runMigrations();
