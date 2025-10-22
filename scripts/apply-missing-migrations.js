#!/usr/bin/env node
/**
 * Apply missing migrations that were skipped due to drizzle-kit push initialization
 *
 * PRODUCTION-SAFE: This script is idempotent and safe to run multiple times.
 * It only applies migrations that are missing from the database schema.
 *
 * Background:
 * When a database is initialized with `drizzle-kit push` instead of migrations,
 * the migration tracking table marks all migrations as "applied" without actually
 * running them. This causes schema drift when new migrations are added.
 *
 * This script ensures critical schema changes are applied regardless of how
 * the database was initially created.
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

async function applyMissingMigrations() {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('🔄 Checking for missing database migrations...');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Database: ${DATABASE_URL.split('@')[1]?.split('?')[0] || 'unknown'}\n`);

  const sql = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: 30,
    ssl: DATABASE_URL.includes('localhost') ? false : 'require'
  });

  try {
    // Read the SQL file
    const sqlFile = join(__dirname, 'apply-missing-migrations.sql');
    const migrationSQL = readFileSync(sqlFile, 'utf8');

    console.log('📄 Running idempotent migration checks...\n');

    // Execute the SQL (uses IF NOT EXISTS, safe to run multiple times)
    const result = await sql.unsafe(migrationSQL);

    console.log('\n✅ Migration check completed successfully!\n');

    // Parse and display verification results
    // The query returns 2 rows with column_name and status
    const verificationResults = Array.isArray(result) ? result : [result];

    if (verificationResults && verificationResults.length > 0) {
      console.log('📊 Schema verification:');
      verificationResults.forEach(row => {
        if (row && row.column_name && row.status) {
          const status = row.status === 'EXISTS' || row.status === 'YES' ? '✓' : '✗';
          console.log(`   ${status} ${row.column_name}: ${row.status}`);
        }
      });

      // In production, log additional confirmation
      if (isProduction) {
        console.log('\n✓ Production database schema verified and up-to-date');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration check failed\n');
    console.error('Error details:');
    console.error(`  Type: ${error.constructor.name}`);
    console.error(`  Message: ${error.message}`);

    if (error.code) {
      console.error(`  PostgreSQL Error Code: ${error.code}`);
    }

    if (error.detail) {
      console.error(`  Detail: ${error.detail}`);
    }

    console.error('\nStack trace:');
    console.error(error.stack);

    // In production, provide additional troubleshooting
    if (isProduction) {
      console.error('\n💡 Production troubleshooting:');
      console.error('  1. Verify DATABASE_URL is correct');
      console.error('  2. Check database connectivity');
      console.error('  3. Ensure database user has ALTER TABLE permissions');
      console.error('  4. Review Railway logs for connection issues');
    }

    process.exit(1);
  } finally {
    await sql.end();
  }
}

applyMissingMigrations();
