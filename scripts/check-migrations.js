#!/usr/bin/env node
import postgres from 'postgres';

const prodUrl = process.env.RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL || process.env.PRODUCTION_PUBLIC_DATABASE_URL;
const stagingUrl = process.env.RAILWAY_STAGING_PUBLIC_DATABASE_URL || process.env.STAGING_PUBLIC_DATABASE_URL;

async function checkMigrations(dbUrl, name) {
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });

  try {
    console.log(`\n📊 ${name.toUpperCase()} MIGRATIONS:`);
    const migrations = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    console.log(`Total: ${migrations.length}\n`);
    migrations.forEach((m, i) => {
      const date = new Date(Number(m.created_at)).toISOString().split('T')[0];
      console.log(`  ${i+1}. ${m.hash} (${date})`);
    });
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  } finally {
    await sql.end();
  }
}

async function main() {
  if (prodUrl) {
    await checkMigrations(prodUrl, 'production');
  } else {
    console.log('❌ RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL not set');
  }

  if (stagingUrl) {
    await checkMigrations(stagingUrl, 'staging');
  } else {
    console.log('❌ RAILWAY_STAGING_PUBLIC_DATABASE_URL not set');
  }
}

main().catch(console.error);
