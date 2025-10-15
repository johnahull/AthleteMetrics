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

  try {
    // Set PostgreSQL safety timeouts
    await migrationClient.unsafe('SET lock_timeout = \'30s\'');
    await migrationClient.unsafe('SET statement_timeout = \'5min\'');
    console.log('🔒 PostgreSQL safety timeouts configured');

    const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
    console.log(`📁 Migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log('\n✅ Migrations completed successfully');
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

    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrations();
