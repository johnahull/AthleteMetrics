#!/usr/bin/env node
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Global state for emergency cleanup
let globalLockId = null;
let globalClient = null;

/**
 * Emergency cleanup handler for SIGTERM/SIGINT
 * Releases advisory lock before process termination
 */
async function emergencyCleanup(signal) {
  console.error(`\n⚠️  Received ${signal} - emergency cleanup...`);
  if (globalLockId && globalClient) {
    try {
      // Race against 1-second timeout for cleanup
      await Promise.race([
        releaseMigrationLock(globalClient, globalLockId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
      ]);
      console.error('✅ Emergency lock release successful');
    } catch (error) {
      console.error('⚠️  Emergency lock release failed:', error.message);
      console.error('   Lock will auto-release on connection close');
    }
  }
  process.exit(128 + (signal === 'SIGTERM' ? 15 : 9));
}

// Install signal handlers BEFORE any async operations
process.on('SIGTERM', () => emergencyCleanup('SIGTERM'));
process.on('SIGINT', () => emergencyCleanup('SIGINT'));

/**
 * Acquire advisory lock to prevent concurrent migrations
 * Returns lock IDs if successful, throws error if lock cannot be acquired
 * Uses database-specific lock IDs to prevent cross-environment conflicts
 */
async function acquireMigrationLock(client) {
  // Extract database name from DATABASE_URL for unique lock ID
  const dbName = DATABASE_URL.match(/\/([^/?]+)(\?|$)/)?.[1] || 'unknown';

  // Use consistent application identifier
  const LOCK_CLASS_ID = 2024;

  // Generate unique lock ID based on database name (prevents cross-environment conflicts)
  const dbHash = createHash('sha256').update(dbName).digest('hex');
  const LOCK_OBJ_ID = parseInt(dbHash.substring(0, 8), 16) % 2147483647;

  console.log('🔒 Acquiring migration lock...');
  console.log(`   Database: ${dbName}`);
  console.log(`   Lock ID: ${LOCK_CLASS_ID}.${LOCK_OBJ_ID}`);

  const result = await client.unsafe(
    'SELECT pg_try_advisory_lock($1, $2) as locked',
    [LOCK_CLASS_ID, LOCK_OBJ_ID]
  );

  if (!result[0]?.locked) {
    throw new Error(
      'Another migration is in progress. Cannot run concurrent migrations. ' +
      'Wait for the other migration to complete and try again.'
    );
  }

  // VERIFY: Double-check we actually hold the lock (prevents race condition)
  const verification = await client.unsafe(
    'SELECT count(*) as lock_count FROM pg_locks WHERE locktype = $1 AND classid = $2 AND objid = $3 AND pid = pg_backend_pid()',
    ['advisory', LOCK_CLASS_ID, LOCK_OBJ_ID]
  );

  if (verification[0]?.lock_count !== '1') {
    throw new Error('Lock acquisition verification failed - race condition detected');
  }

  console.log('✅ Migration lock acquired and verified');
  return { classId: LOCK_CLASS_ID, objId: LOCK_OBJ_ID };
}

/**
 * Release advisory lock after migration completes
 */
async function releaseMigrationLock(client, lockIds) {
  try {
    await client.unsafe('SELECT pg_advisory_unlock($1, $2)', [lockIds.classId, lockIds.objId]);
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

  // Store globals for emergency cleanup
  globalClient = migrationClient;

  try {
    // Acquire migration lock to prevent concurrent migrations
    lockId = await acquireMigrationLock(migrationClient);
    globalLockId = lockId; // Store for emergency cleanup

    // Set PostgreSQL safety timeouts (environment-aware)
    // CRITICAL: statement_timeout MUST be less than lock_timeout to prevent
    // long-running statements from holding locks and blocking other operations.
    // Production: Longer lock timeout (5min) for deploy contention, shorter statement (3min) to limit lock hold time
    // Development: Shorter lock timeout (1min) for faster feedback, very short statement (30s) for quick iterations
    const lockTimeout = process.env.NODE_ENV === 'production' ? '5min' : '1min';
    const stmtTimeout = process.env.NODE_ENV === 'production' ? '3min' : '30s';

    // FIX: Use parameterized queries to prevent SQL injection
    await migrationClient.unsafe('SET lock_timeout = $1', [lockTimeout]);
    await migrationClient.unsafe('SET statement_timeout = $1', [stmtTimeout]);
    console.log(`🔒 PostgreSQL safety timeouts configured (lock: ${lockTimeout}, statement: ${stmtTimeout})`);

    const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
    console.log(`📁 Migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log('\n✅ Migrations completed successfully');

    // Release lock before exiting
    if (lockId !== null) {
      await releaseMigrationLock(migrationClient, lockId);
      lockId = null; // Prevent double-release in finally block
      globalLockId = null; // Clear global
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
      globalLockId = null; // Clear global
    }

    process.exit(1);
  } finally {
    // Defensive lock release - PostgreSQL advisory locks are session-based and
    // auto-release on disconnect, but explicitly release for cleanliness
    if (lockId !== null) {
      try {
        await releaseMigrationLock(migrationClient, lockId);
        globalLockId = null; // Clear global after release
      } catch (lockError) {
        console.warn('⚠️  Lock release failed (will auto-release on disconnect):', lockError.message);
      }
    }

    try {
      await migrationClient.end();
      globalClient = null; // Clear global after connection closed
    } catch (endError) {
      console.error('Warning: Error closing migration connection:', endError.message);
      // Don't fail if connection closing fails - migration already succeeded/failed
    }
  }
}

runMigrations();
