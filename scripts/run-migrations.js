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
      // SECURITY FIX: Increase timeout from 1s to 5s for cloud database latency
      // Railway/Neon databases may need more time for lock release under load
      await Promise.race([
        releaseMigrationLock(globalClient, globalLockId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      console.error('✅ Emergency lock release successful');
    } catch (error) {
      console.error('⚠️  Emergency lock release failed:', error.message);
      console.error('   Lock will auto-release on connection close');
    }
  }
  process.exit(128 + (signal === 'SIGTERM' ? 15 : 2));
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

  // SECURITY FIX: Include NODE_ENV in lock ID hash to prevent collision
  // Even if staging/production share a database server, they'll have different locks
  const nodeEnv = process.env.NODE_ENV || 'development';
  const lockSeed = `${dbName}-${nodeEnv}`;

  // Generate unique lock ID based on database name + environment (prevents cross-environment conflicts)
  const dbHash = createHash('sha256').update(lockSeed).digest('hex');
  const LOCK_OBJ_ID = parseInt(dbHash.substring(0, 8), 16) % 2147483647;

  console.log('🔒 Acquiring migration lock...');
  console.log(`   Database: ${dbName}`);
  console.log(`   Lock ID: ${LOCK_CLASS_ID}.${LOCK_OBJ_ID}`);

  // SECURITY: Wrap lock acquisition and verification in a transaction to prevent TOCTOU race condition
  // This ensures atomicity - either we get the lock AND verify it, or we fail
  await client.unsafe('BEGIN');
  const result = await client.unsafe('SELECT pg_try_advisory_lock($1, $2) as locked', [LOCK_CLASS_ID, LOCK_OBJ_ID]);

  if (!result[0]?.locked) {
    await client.unsafe('ROLLBACK');
    throw new Error(
      'Another migration is in progress. Cannot run concurrent migrations. ' +
      'Wait for the other migration to complete and try again.'
    );
  }

  // VERIFY: Double-check we actually hold the lock (prevents race condition)
  // This happens within the same transaction, ensuring atomicity
  const verification = await client.unsafe(
    'SELECT count(*) as lock_count FROM pg_locks WHERE locktype = $1 AND classid = $2 AND objid = $3 AND pid = pg_backend_pid()',
    ['advisory', LOCK_CLASS_ID, LOCK_OBJ_ID]
  );

  const lockCount = parseInt(verification[0]?.lock_count) || 0;
  if (lockCount !== 1) {
    await client.unsafe('ROLLBACK');
    throw new Error(`Lock acquisition verification failed - expected 1 lock, found ${lockCount}`);
  }

  // Commit the transaction - lock is now held outside transaction scope
  await client.unsafe('COMMIT');

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
  console.log(`📂 Current working directory: ${process.cwd()}`);
  console.log(`📂 Script directory: ${__dirname}`);

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

    // SET commands don't support parameterized values, but these values are safe (hardcoded strings)
    await migrationClient.unsafe(`SET lock_timeout = '${lockTimeout}'`);
    await migrationClient.unsafe(`SET statement_timeout = '${stmtTimeout}'`);
    console.log(`🔒 PostgreSQL safety timeouts configured (lock: ${lockTimeout}, statement: ${stmtTimeout})`);

    // Use __dirname to resolve migrations folder relative to script location
    // This ensures it works regardless of where the script is executed from
    // This must match the 'out' path in drizzle.config.ts ('drizzle/migrations')
    const migrationsFolder = path.join(__dirname, '..', 'drizzle', 'migrations');
    console.log(`📁 Migrations folder: ${migrationsFolder}`);

    // Import fs for file operations
    const fs = await import('fs');

    // Check if schema already exists (database was created via drizzle-kit push)
    // If tables exist but __drizzle_migrations tracking table is empty/missing,
    // we need to initialize the tracking table without re-running migrations
    console.log('🔍 Checking if database schema already exists...');
    const schemaCheck = await migrationClient.unsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      ) as schema_exists
    `);

    const schemaExists = schemaCheck[0]?.schema_exists;
    console.log(`   Schema exists: ${schemaExists ? 'YES' : 'NO'}`);

    // Check if migration tracking table exists
    const trackingCheck = await migrationClient.unsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
      ) as tracking_exists
    `);

    const trackingExists = trackingCheck[0]?.tracking_exists;
    console.log(`   Migration tracking exists: ${trackingExists ? 'YES' : 'NO'}`);

    // Check if tracking table is empty (even if it exists structurally)
    let trackingIsEmpty = false;
    if (trackingExists) {
      const countCheck = await migrationClient.unsafe(`
        SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations
      `);
      const migrationCount = parseInt(countCheck[0]?.count) || 0;
      trackingIsEmpty = migrationCount === 0;
      console.log(`   Migrations tracked: ${migrationCount}`);
    }

    // Check if migration 0000 (base schema) is already tracked
    let migration0000Tracked = false;
    if (trackingExists && !trackingIsEmpty) {
      const migration0000Check = await migrationClient.unsafe(`
        SELECT EXISTS (
          SELECT 1 FROM drizzle.__drizzle_migrations
          WHERE hash = '0000_overjoyed_calypso'
        ) as migration_0000_exists
      `);
      migration0000Tracked = migration0000Check[0]?.migration_0000_exists;
      console.log(`   Migration 0000 tracked: ${migration0000Tracked ? 'YES' : 'NO'}`);
    }

    // If schema exists but tracking is missing or empty, initialize tracking table
    // This handles databases created via drizzle-kit push
    // IMPORTANT: Also initialize if migration 0000 is missing from tracking (schema exists via db:push)
    if (schemaExists && trackingExists && !trackingIsEmpty && migration0000Tracked) {
      console.log('📋 Database has existing migration tracking - checking for new migrations...');
      // Continue to normal migration flow below - drizzle will handle incremental migrations
    } else if (schemaExists && (!trackingExists || trackingIsEmpty || !migration0000Tracked)) {
      if (!migration0000Tracked && trackingExists && !trackingIsEmpty) {
        console.log('⚠️  Database schema exists but migration 0000 is not tracked');
        console.log('   This indicates the database was created via drizzle-kit push before migrations existed');
      } else {
        console.log('⚠️  Database schema exists but migration tracking is missing');
        console.log('   This indicates the database was created via drizzle-kit push');
      }
      console.log('   Initializing/updating migration tracking table...');

      // Create drizzle schema and tracking table
      await migrationClient.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
      await migrationClient.unsafe(`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `);

      // Read migration journal to get all migration hashes
      const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

      // Check if journal file exists before trying to read it
      if (!fs.existsSync(journalPath)) {
        console.error(`❌ Migration journal file not found: ${journalPath}`);
        console.error('   This file is required for initializing migration tracking');
        console.error('   Possible causes:');
        console.error('   1. Migrations folder not properly copied to deployment');
        console.error('   2. Running from wrong directory');
        console.error('   3. Migration files corrupted or missing');
        throw new Error(`Migration journal file not found: ${journalPath}`);
      }

      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

      // Mark all migrations as applied
      console.log(`   Marking ${journal.entries.length} migrations as applied...`);
      for (const entry of journal.entries) {
        // Use tag as hash (Drizzle uses migration file name as identifier)
        await migrationClient.unsafe(`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [entry.tag, entry.when]);
        console.log(`     ✓ ${entry.tag}`);
      }

      console.log('✅ Migration tracking initialized - all existing migrations marked as applied');
      console.log('✅ No migrations to apply - database is up to date');

      // Release lock before exiting
      if (lockId !== null) {
        await releaseMigrationLock(migrationClient, lockId);
        lockId = null;
        globalLockId = null;
      }

      process.exit(0);
    }

    // VALIDATION: Check migrations folder exists and has migrations before attempting migration
    // This prevents confusing errors if folder is missing or empty
    if (!fs.existsSync(migrationsFolder)) {
      console.warn('⚠️  Migrations folder does not exist - no migrations to apply');
      console.log('   This is normal for fresh setups');
      console.log('   Generate migrations with: npm run db:generate');
      // Don't throw error - this is valid for fresh setups
      // Just release lock and exit successfully
      if (lockId !== null) {
        await releaseMigrationLock(migrationClient, lockId);
        lockId = null;
        globalLockId = null;
      }
      process.exit(0);
    }

    // Check if migrations folder has any migration files
    const metaFolder = `${migrationsFolder}/meta`;
    const journalFile = `${metaFolder}/_journal.json`;

    if (!fs.existsSync(journalFile)) {
      console.warn('⚠️  No migrations found - migrations folder is empty');
      console.log('   This is normal if schema has not changed');
      console.log('   Generate migrations with: npm run db:generate');
      console.log('✅ No migrations to apply - database is up to date');
      // Don't throw error - empty migrations folder is valid
      // Just release lock and exit successfully
      if (lockId !== null) {
        await releaseMigrationLock(migrationClient, lockId);
        lockId = null;
        globalLockId = null;
      }
      process.exit(0);
    }

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

      // SECURITY FIX: Catch statement timeout (error code 57014) and release lock
      // Without this, lock would remain held until connection closes
      if (error.code === '57014') {
        console.error('⚠️  Statement timeout exceeded - this is a safety mechanism');
        console.error('   The migration operation took too long and was canceled');
        console.error('   Consider breaking the migration into smaller steps or increasing timeout');
      }
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
    console.error('  1. Check migration files in migrations/ for syntax errors');
    console.error('  2. Verify database connection is available');
    console.error('  3. Check if schema changes conflict with existing data');
    console.error('  4. Review docs/database-migration-rollback.md for recovery procedures');

    // CRITICAL: Release lock on error (including statement timeout)
    // This ensures the lock doesn't remain held, blocking future migrations
    if (lockId !== null) {
      try {
        await releaseMigrationLock(migrationClient, lockId);
        lockId = null; // Prevent double-release in finally block
        globalLockId = null; // Clear global
      } catch (lockError) {
        console.error('⚠️  Failed to release lock after error:', lockError.message);
        console.error('   Lock will auto-release when connection closes');
      }
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
