#!/usr/bin/env node
/**
 * Manually apply migration 0005 to production database
 * This is needed because the migration was marked as applied but never actually run
 */
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL || process.env.PRODUCTION_PUBLIC_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Use RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL or PRODUCTION_PUBLIC_DATABASE_URL');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

async function main() {
  try {
    console.log('🔍 Checking if deleted_at column already exists...');

    const columnCheck = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'deleted_at'
    `;

    if (columnCheck.length > 0) {
      console.log('✅ deleted_at column already exists! No action needed.');
      await sql.end();
      process.exit(0);
    }

    console.log('⚠️  deleted_at column missing - applying migration 0005...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '0005_add_user_soft_delete.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n🔄 Applying migration...\n');

    // Apply migration
    await sql.unsafe(migrationSQL);

    console.log('✅ Migration 0005 applied successfully!');
    console.log('\n🔍 Verifying...');

    const verifyCheck = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'deleted_at'
    `;

    if (verifyCheck.length > 0) {
      console.log('✅ Verification passed!');
      console.log(`   Column: ${verifyCheck[0].column_name}`);
      console.log(`   Type: ${verifyCheck[0].data_type}`);
      console.log(`   Nullable: ${verifyCheck[0].is_nullable}`);
    } else {
      console.log('❌ Verification failed - column not found after migration');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
