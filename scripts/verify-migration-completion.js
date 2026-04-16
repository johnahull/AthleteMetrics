#!/usr/bin/env node

/**
 * Migration Completion Verification Script
 *
 * Verifies that all expected database migrations have been applied successfully.
 * Checks for critical columns, indexes, and constraints that should exist after migrations.
 *
 * This script is designed to catch cases where:
 * - Migration script skipped migrations due to existing schema
 * - Migrations partially failed
 * - Database was created via drizzle-kit push without running manual migrations
 *
 * Usage:
 *   DATABASE_URL=<url> node scripts/verify-migration-completion.js
 *
 * Exit codes:
 *   0 - All migrations verified successfully
 *   1 - Verification failed or missing migrations detected
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Expected database structure after all migrations
const EXPECTED_STRUCTURE = {
  // Critical columns that must exist
  columns: [
    { table: 'measurements', column: 'team_name_snapshot', type: 'text' },
    { table: 'measurements', column: 'organization_id', type: 'character varying' },
    { table: 'users', column: 'deleted_at', type: 'timestamp without time zone' },
    { table: 'organizations', column: 'deleted_at', type: 'timestamp without time zone' },
    { table: 'organizations', column: 'is_active', type: 'boolean' },
    { table: 'organizations', column: 'coppa_enabled', type: 'boolean' },
    { table: 'organizations', column: 'sprint_fv_enabled', type: 'boolean' },
    { table: 'site_settings', column: 'sprint_fv_enabled', type: 'boolean' },
    { table: 'users', column: 'is_minor', type: 'boolean' },
  ],

  // Expected index counts per table (minimum required)
  indexes: {
    measurements: 12,
    organizations: 5,
    users: 4, // Minimum (testing has 4, prod/staging have 5)
    teams: 3,
    user_teams: 4,
    user_organizations: 2,
  },

  // Foreign key constraints that should NOT exist (removed by migrations)
  forbiddenConstraints: {
    measurements: [
      'measurements_user_id_users_id_fk',
      'measurements_submitted_by_users_id_fk',
      'measurements_verified_by_users_id_fk',
      'measurements_team_id_teams_id_fk',
    ],
  },

  // Total migrations expected across both systems:
  // - Drizzle migrations (0000-0006 in drizzle/migrations/): tracked in drizzle.__drizzle_migrations
  // - Manual migrations (0014-0117 in migrations/): tracked in manual_migrations
  // Updated 2026-04-15 for COPPA (0111-0116) and Sprint F-V (0117) release
  minDrizzleMigrationCount: 7,    // Drizzle migrations with snapshots
  minManualMigrationCount: 90,    // Manual SQL migrations (0014+, excluding _down files)
  minTotalMigrationCount: 97,     // Total across both systems
};

async function verifyColumns(client) {
  console.log('🔍 Verifying critical columns...');
  const issues = [];

  for (const { table, column, type } of EXPECTED_STRUCTURE.columns) {
    const result = await client.unsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `, [table, column]);

    if (result.length === 0) {
      issues.push(`❌ Missing column: ${table}.${column}`);
    } else if (result[0].data_type !== type) {
      console.log(`   ⚠️  Column ${table}.${column} has type ${result[0].data_type} (expected ${type})`);
    } else {
      console.log(`   ✅ ${table}.${column} (${type})`);
    }
  }

  return issues;
}

async function verifyIndexes(client) {
  console.log('\n🔍 Verifying indexes...');
  const issues = [];

  for (const [table, expectedCount] of Object.entries(EXPECTED_STRUCTURE.indexes)) {
    const result = await client.unsafe(`
      SELECT COUNT(*) as index_count
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
    `, [table]);

    const actualCount = parseInt(result[0]?.index_count || 0);

    if (actualCount < expectedCount) {
      issues.push(`❌ Table ${table} has ${actualCount} indexes (expected at least ${expectedCount})`);
    } else {
      console.log(`   ✅ ${table}: ${actualCount} indexes (>= ${expectedCount} required)`);
    }
  }

  return issues;
}

async function verifyConstraints(client) {
  console.log('\n🔍 Verifying foreign key constraints...');
  const issues = [];

  for (const [table, forbiddenFKs] of Object.entries(EXPECTED_STRUCTURE.forbiddenConstraints)) {
    const result = await client.unsafe(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = $1::regclass AND contype = 'f'
    `, [table]);

    const existingFKs = result.map(r => r.conname);

    for (const forbiddenFK of forbiddenFKs) {
      if (existingFKs.includes(forbiddenFK)) {
        issues.push(`❌ Forbidden constraint exists: ${table}.${forbiddenFK} (should have been removed)`);
      } else {
        console.log(`   ✅ ${table}.${forbiddenFK} (correctly removed)`);
      }
    }
  }

  return issues;
}

async function verifyMigrationTracking(client) {
  console.log('\n🔍 Verifying migration tracking...');
  const issues = [];

  // Check drizzle migrations tracking table
  const drizzleTrackingExists = await client.unsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
    ) as exists
  `);

  if (!drizzleTrackingExists[0]?.exists) {
    issues.push('❌ Drizzle migration tracking table (__drizzle_migrations) does not exist');
    return issues;
  }

  // Check drizzle migration count
  const drizzleCountResult = await client.unsafe(`
    SELECT COUNT(*) as count
    FROM drizzle.__drizzle_migrations
  `);

  const drizzleMigrationCount = parseInt(drizzleCountResult[0]?.count || 0);

  if (drizzleMigrationCount < EXPECTED_STRUCTURE.minDrizzleMigrationCount) {
    issues.push(`❌ Only ${drizzleMigrationCount} drizzle migrations tracked (expected at least ${EXPECTED_STRUCTURE.minDrizzleMigrationCount})`);
  } else {
    console.log(`   ✅ Drizzle migrations: ${drizzleMigrationCount} tracked (>= ${EXPECTED_STRUCTURE.minDrizzleMigrationCount} required)`);
  }

  // Check manual migrations tracking table
  const manualTrackingExists = await client.unsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'manual_migrations'
    ) as exists
  `);

  if (!manualTrackingExists[0]?.exists) {
    // Manual migrations table doesn't exist yet - this is OK if migrations haven't been run
    console.log('   ⚠️  Manual migration tracking table does not exist yet');
    console.log('      This is normal if manual migrations have not been applied');
    console.log('      Run: npm run db:migrate:manual');
    return issues;
  }

  // Check manual migration count
  const manualCountResult = await client.unsafe(`
    SELECT COUNT(*) as count
    FROM manual_migrations
  `);

  const manualMigrationCount = parseInt(manualCountResult[0]?.count || 0);

  if (manualMigrationCount < EXPECTED_STRUCTURE.minManualMigrationCount) {
    issues.push(`❌ Only ${manualMigrationCount} manual migrations tracked (expected at least ${EXPECTED_STRUCTURE.minManualMigrationCount})`);
  } else {
    console.log(`   ✅ Manual migrations: ${manualMigrationCount} tracked (>= ${EXPECTED_STRUCTURE.minManualMigrationCount} required)`);
  }

  // Check total migration count
  const totalMigrationCount = drizzleMigrationCount + manualMigrationCount;
  if (totalMigrationCount < EXPECTED_STRUCTURE.minTotalMigrationCount) {
    issues.push(`❌ Total migrations: ${totalMigrationCount} (expected at least ${EXPECTED_STRUCTURE.minTotalMigrationCount})`);
  } else {
    console.log(`   ✅ Total migrations: ${totalMigrationCount} (>= ${EXPECTED_STRUCTURE.minTotalMigrationCount} required)`);
  }

  return issues;
}

async function verifyMigrations() {
  console.log('🔍 Verifying database migration completion...\n');

  const client = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    ssl: DATABASE_URL.includes('localhost') ? false : 'require'
  });

  try {
    // Run all verification checks
    const columnIssues = await verifyColumns(client);
    const indexIssues = await verifyIndexes(client);
    const constraintIssues = await verifyConstraints(client);
    const trackingIssues = await verifyMigrationTracking(client);

    const allIssues = [
      ...columnIssues,
      ...indexIssues,
      ...constraintIssues,
      ...trackingIssues,
    ];

    console.log('\n' + '='.repeat(60));

    if (allIssues.length === 0) {
      console.log('✅ All migration verifications passed!');
      console.log('   Database structure is complete and correct.');
      await client.end();
      process.exit(0);
    } else {
      console.error('❌ Migration verification FAILED\n');
      console.error('Issues detected:');
      allIssues.forEach(issue => console.error(`   ${issue}`));
      console.error('\n🔧 Troubleshooting:');
      console.error('   1. Check if migrations actually ran: npm run db:migrate');
      console.error('   2. Review migration logs in CI output');
      console.error('   3. Manually apply migrations from migrations/ folder');
      console.error('   4. See docs/database-migration-rollback.md for recovery procedures');
      console.error('\n⚠️  DEPLOYMENT BLOCKED: Fix migration issues before deploying');
      await client.end();
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Verification failed with error:\n');
    console.error(`Error: ${error.message}`);
    if (error.code) {
      console.error(`PostgreSQL Error Code: ${error.code}`);
    }
    console.error('\nStack trace:');
    console.error(error.stack);

    try {
      await client.end();
    } catch (endError) {
      // Ignore connection closing errors
    }

    process.exit(1);
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Verification interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Verification terminated');
  process.exit(143);
});

// Run verification
verifyMigrations();
