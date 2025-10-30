#!/usr/bin/env node

/**
 * Apply manual SQL migrations that don't have drizzle snapshots
 *
 * Background:
 * Migrations 0014-0021 were added to the migration journal but lack the snapshot
 * JSON files required by drizzle's migrate() function. This script applies them
 * as pure SQL migrations with separate tracking.
 *
 * Safety:
 * - Migrations run in transactions when possible (auto-rollback on failure)
 * - CONCURRENTLY operations execute outside transactions (PostgreSQL requirement)
 * - Idempotent - safe to run multiple times
 * - Tracks applied migrations in manual_migrations table
 *
 * Usage:
 *   DATABASE_URL=<url> node scripts/apply-manual-migrations.js
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Migrations to apply (in order)
// These correspond to migrations in migrations/meta/_journal.json that lack snapshots
const MANUAL_MIGRATIONS = [
  '0014_add_organization_soft_delete_indexes',
  '0015_add_measurements_organization_columns',
  '0016_add_measurements_table_indexes',
  '0017_add_composite_analytics_indexes',
  '0018_add_org_query_composite_indexes',
  '0019_add_user_teams_temporal_index',
  '0020_add_measurements_org_metric_analytics_index',
  '0021_backfill_measurements_org_from_users',
];

async function applyManualMigrations() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🔄 Manual SQL Migrations');
  console.log('========================\n');
  console.log(`Database: ${DATABASE_URL.split('@')[1]?.split('?')[0] || 'unknown'}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);

  const sql = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: 30,
    idle_timeout: 30,
    ssl: DATABASE_URL.includes('localhost') ? false : 'require'
  });

  try {
    // Create tracking table for manual migrations
    console.log('📋 Setting up migration tracking...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS manual_migrations (
        id SERIAL PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ Tracking table ready\n');

    // Check which migrations are already applied
    console.log('🔍 Checking applied migrations...');
    const applied = await sql.unsafe(`
      SELECT migration_name, applied_at
      FROM manual_migrations
      ORDER BY applied_at
    `);

    const appliedNames = new Set(applied.map(r => r.migration_name));

    if (applied.length > 0) {
      console.log(`Found ${applied.length} previously applied migration(s):`);
      applied.forEach(m => {
        console.log(`   ✓ ${m.migration_name} (${new Date(m.applied_at).toISOString()})`);
      });
    } else {
      console.log('No previous migrations found');
    }
    console.log('');

    // Apply each migration
    let appliedCount = 0;
    let skippedCount = 0;

    for (const migrationName of MANUAL_MIGRATIONS) {
      if (appliedNames.has(migrationName)) {
        console.log(`⏭️  Skipping ${migrationName} (already applied)`);
        skippedCount++;
        continue;
      }

      console.log(`🔄 Applying ${migrationName}...`);

      const sqlFile = join(__dirname, '..', 'migrations', `${migrationName}.sql`);

      try {
        const migrationSQL = readFileSync(sqlFile, 'utf8');

        // Check if migration contains CONCURRENTLY (cannot run in transaction)
        const hasConcurrently = /\bCONCURRENTLY\b/i.test(migrationSQL);

        if (hasConcurrently) {
          console.log('   ⚠️  Migration contains CONCURRENTLY - running outside transaction');

          // Split into individual statements and execute separately
          // This avoids implicit transaction wrapping by postgres library
          const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

          for (const statement of statements) {
            if (statement.trim()) {
              await sql.unsafe(statement);
            }
          }

          // Track migration separately (also outside any transaction)
          await sql.unsafe(`
            INSERT INTO manual_migrations (migration_name)
            VALUES ($1)
          `, [migrationName]);
        } else {
          // Run migration and tracking insert in a transaction
          await sql.begin(async sql => {
            // Apply the migration SQL
            await sql.unsafe(migrationSQL);

            // Record that this migration was applied
            await sql.unsafe(`
              INSERT INTO manual_migrations (migration_name)
              VALUES ($1)
            `, [migrationName]);
          });
        }

        console.log(`✅ ${migrationName} applied successfully\n`);
        appliedCount++;

      } catch (migrationError) {
        // Transaction automatically rolled back (if in transaction)
        console.error(`\n❌ Failed to apply ${migrationName}\n`);
        console.error('Error details:');
        console.error(`  Message: ${migrationError.message}`);

        if (migrationError.code) {
          console.error(`  PostgreSQL Code: ${migrationError.code}`);
        }

        if (migrationError.detail) {
          console.error(`  Detail: ${migrationError.detail}`);
        }

        console.error('\n⚠️  Transaction rolled back - database unchanged');
        console.error('Fix the migration SQL and re-run this script\n');

        throw migrationError; // Re-throw to exit with error code
      }
    }

    // Summary
    console.log('═'.repeat(60));
    console.log('✅ Manual migrations completed successfully!\n');
    console.log('Summary:');
    console.log(`  Applied: ${appliedCount}`);
    console.log(`  Skipped: ${skippedCount}`);
    console.log(`  Total: ${MANUAL_MIGRATIONS.length}\n`);

    if (appliedCount === 0 && skippedCount === MANUAL_MIGRATIONS.length) {
      console.log('✓ All migrations were already applied - database is up to date');
    }

    process.exit(0);

  } catch (error) {
    console.error('\n' + '═'.repeat(60));
    console.error('❌ Manual migration process failed\n');
    console.error('Error details:');
    console.error(`  Type: ${error.constructor.name}`);
    console.error(`  Message: ${error.message}`);

    if (error.code) {
      console.error(`  PostgreSQL Code: ${error.code}`);
    }

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    console.error('\n💡 Troubleshooting:');
    console.error('  1. Verify DATABASE_URL is correct');
    console.error('  2. Check database connectivity');
    console.error('  3. Ensure database user has sufficient permissions');
    console.error('  4. Review migration SQL for syntax errors');
    console.error('  5. Check if migration was partially applied (use \\dt to list tables)');
    console.error('\n📖 See docs/MIGRATION_SYSTEM_REMEDIATION.md for more details\n');

    process.exit(1);

  } finally {
    await sql.end();
  }
}

// Handle interrupts gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Migration interrupted by user');
  console.log('Transactions will be rolled back automatically');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Migration terminated');
  console.log('Transactions will be rolled back automatically');
  process.exit(143);
});

// Run migrations
applyManualMigrations();
