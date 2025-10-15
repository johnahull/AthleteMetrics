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
    ssl: DATABASE_URL.includes('localhost') ? false : 'require'
  });

  const db = drizzle(migrationClient);

  try {
    const migrationsFolder = path.join(process.cwd(), 'drizzle', 'migrations');
    console.log(`📁 Migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    console.log('\n✅ Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrations();
