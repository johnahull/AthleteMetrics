/**
 * CI Admin User Creation Script
 *
 * Creates the admin user in the test database before E2E tests run.
 * This script uses the standard postgres library (not Neon serverless)
 * to work with the PostgreSQL container in CI.
 *
 * Usage: DATABASE_URL="..." ADMIN_USER="..." ADMIN_PASSWORD="..." npx tsx scripts/ci-create-admin.ts
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - ADMIN_USER: Admin username (default: 'admin')
 * - ADMIN_PASSWORD: Admin password (required)
 * - ADMIN_EMAIL: Admin email (optional, defaults to empty array)
 */

import * as postgres from 'postgres';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../packages/shared/constants';

// Handle both ESM and CJS exports
const sql = (postgres as any).default || postgres;
const bcryptLib = (bcrypt as any).default || bcrypt;

async function createAdmin() {
  const databaseUrl = process.env.DATABASE_URL;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const email = process.env.ADMIN_EMAIL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!password) {
    console.error('❌ ADMIN_PASSWORD environment variable is required');
    process.exit(1);
  }

  console.log('🔧 Creating admin user for CI...');
  console.log(`   Username: ${username}`);
  console.log(`   Database: ${databaseUrl.replace(/:[^:@]*@/, ':***@')}`);

  // Connect using standard postgres (works with both local PG and containers)
  const client = sql(databaseUrl, {
    max: 1,
    idle_timeout: 10,
  });

  try {
    // Hash the password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcryptLib.hash(password, BCRYPT_SALT_ROUNDS);

    // Generate a UUID for the user
    const userId = crypto.randomUUID();

    // Check if user already exists
    const existingUsers = await client`
      SELECT id, username FROM users WHERE username = ${username}
    `;

    if (existingUsers.length > 0) {
      console.log(`✅ Admin user '${username}' already exists (id: ${existingUsers[0].id})`);
      console.log('   Updating password to match environment variable...');

      // Update password in case it changed
      await client`
        UPDATE users
        SET password = ${hashedPassword},
            is_site_admin = true,
            is_active = true
        WHERE username = ${username}
      `;
      console.log('✅ Admin user password updated');
    } else {
      // Insert new admin user
      console.log('💾 Creating new admin user...');

      const emails = email ? [email] : [];

      await client`
        INSERT INTO users (
          id,
          username,
          password,
          emails,
          first_name,
          last_name,
          full_name,
          is_site_admin,
          is_active,
          is_email_verified,
          created_at
        ) VALUES (
          ${userId},
          ${username},
          ${hashedPassword},
          ${emails},
          'Site',
          'Admin',
          'Site Admin',
          true,
          true,
          true,
          NOW()
        )
      `;

      console.log(`✅ Admin user '${username}' created successfully (id: ${userId})`);
    }

    console.log('');
    console.log('🔑 Login credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    await client.end();
    process.exit(1);
  }
}

createAdmin();
