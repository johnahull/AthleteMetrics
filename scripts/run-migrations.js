#!/usr/bin/env node
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

/**
 * Acquire advisory lock to prevent concurrent migrations
 * Returns lock ID if successful, throws error if lock cannot be acquired
 */
async function acquireMigrationLock(client) {
  const MIGRATION_LOCK_ID = 123456789; // Unique ID for migration lock

  console.log('🔒 Acquiring migration lock...');

  const result = await client.unsafe(
    'SELECT pg_try_advisory_lock($1) as locked',
    [MIGRATION_LOCK_ID]
  );

  if (!result[0]?.locked) {
    throw new Error(
      'Another migration is in progress. Cannot run concurrent migrations. ' +
      'Wait for the other migration to complete and try again.'
    );
  }

  console.log('✅ Migration lock acquired');
  return MIGRATION_LOCK_ID;
}

/**
 * Release advisory lock after migration completes
 */
async function releaseMigrationLock(client, lockId) {
  try {
    await client.unsafe('SELECT pg_advisory_unlock($1)', [lockId]);
    console.log('🔓 Migration lock released');
  } catch (error) {
    console.warn('⚠️  Warning: Failed to release migration lock:', error.message);
  }
}

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  const migrationClient = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: 30, // 30 second connection timeout
    idle_timeout: 30,
    max_lifetime: 600, // 10 minute max connection lifetime
    ssl: DATABASE_URL.includes('localhost') ? false : 'require'
  });

  const db = drizzle(migrationClient);
  let lockId = null;

  try {
    // Acquire migration lock to prevent concurrent migrations
    lockId = await acquireMigrationLock(migrationClient);

    // Set PostgreSQL safety timeouts (environment-aware)
    // Statement timeout should be proportional to lock timeout to prevent
    // long-running statements from holding locks and blocking other operations
    const lockTimeout = process.env.NODE_ENV === 'production' ? '2min' : '30s';
    const stmtTimeout = process.env.NODE_ENV === 'production' ? '4min' : '2min';
    await migrationClient.unsafe(`SET lock_timeout = '${lockTimeout}'`);
    await migrationClient.unsafe(`SET statement_timeout = '${stmtTimeout}'`);
    console.log(`🔒 PostgreSQL safety timeouts configured (lock: ${lockTimeout}, statement: ${stmtTimeout})`);

    const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
    console.log(`📁 Migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log('\n✅ Migrations completed successfully');

    // Release lock before exiting
    if (lockId !== null) {
      await releaseMigrationLock(migrationClient, lockId);
      lockId = null; // Prevent double-release in finally block
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed\n');
    console.error('Error details:');
    console.error(`  Type: ${error.constructor.name}`);
    console.error(`  Message: ${error.message}`);

    // Log PostgreSQL-specific error details if available
    if (error.code) {
      console.error(`  PostgreSQL Error Code: ${error.code}`);
    }
    if (error.detail) {
      console.error(`  Detail: ${error.detail}`);
    }
    if (error.hint) {
      console.error(`  Hint: ${error.hint}`);
    }
    if (error.position) {
      console.error(`  Position: ${error.position}`);
    }

    // Log full stack trace for debugging
    console.error('\nStack trace:');
    console.error(error.stack);

    console.error('\n💡 Troubleshooting:');
    console.error('  1. Check migration files in drizzle/migrations/ for syntax errors');
    console.error('  2. Verify database connection is available');
    console.error('  3. Check if schema changes conflict with existing data');
    console.error('  4. Review docs/database-migration-rollback.md for recovery procedures');

    // Release lock on error
    if (lockId !== null) {
      await releaseMigrationLock(migrationClient, lockId);
      lockId = null; // Prevent double-release in finally block
    }

    process.exit(1);
  } finally {
    // Defensive lock release - PostgreSQL advisory locks are session-based and
    // auto-release on disconnect, but explicitly release for cleanliness
    if (lockId !== null) {
      try {
        await releaseMigrationLock(migrationClient, lockId);
      } catch (lockError) {
        console.warn('⚠️  Lock release failed (will auto-release on disconnect):', lockError.message);
      }
    }

    try {
      await migrationClient.end();
    } catch (endError) {
      console.error('Warning: Error closing migration connection:', endError.message);
      // Don't fail if connection closing fails - migration already succeeded/failed
    }
  }
}

runMigrations();
