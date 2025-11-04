/**
 * Create a site admin user in the database
 * Usage: DATABASE_URL="..." node --loader tsx scripts/create-site-admin.ts
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import bcrypt from 'bcrypt';
import { users } from '../packages/shared/schema';
import { BCRYPT_SALT_ROUNDS } from '../packages/shared/constants';

// Configure WebSocket for Neon serverless
neonConfig.webSocketConstructor = ws;

async function createSiteAdmin() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME || 'Site';
  const lastName = process.env.ADMIN_LAST_NAME || 'Admin';
  const email = process.env.ADMIN_EMAIL || 'admin@athletemetrics.io';

  if (!password) {
    console.error('❌ ADMIN_PASSWORD environment variable is required');
    console.error('   This script does not use default passwords for security reasons.');
    console.error('   Usage: ADMIN_PASSWORD="YourSecurePassword123!" npx tsx scripts/create-site-admin.ts');
    process.exit(1);
  }

  // Validate password strength
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters long');
    process.exit(1);
  }
  if (!/[A-Z]/.test(password)) {
    console.error('❌ Password must contain at least one uppercase letter');
    process.exit(1);
  }
  if (!/[a-z]/.test(password)) {
    console.error('❌ Password must contain at least one lowercase letter');
    process.exit(1);
  }
  if (!/[0-9]/.test(password)) {
    console.error('❌ Password must contain at least one number');
    process.exit(1);
  }

  console.log('🔧 Creating site admin user...');
  console.log(`Username: ${username}`);
  console.log(`Email: ${email}`);

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // Hash the password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Insert the site admin user
    console.log('💾 Creating user record...');
    const [admin] = await db.insert(users).values({
      username,
      password: hashedPassword,
      emails: [email],
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      isSiteAdmin: true,
      isActive: true,
      isEmailVerified: true,
    }).returning();

    console.log('✅ Site admin user created successfully!');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email: ${admin.emails?.[0]}`);
    console.log(`   Full Name: ${admin.fullName}`);
    console.log(`   Site Admin: ${admin.isSiteAdmin}`);
    console.log('');
    console.log('🔑 Login credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating site admin:', error);
    await pool.end();
    process.exit(1);
  }
}

createSiteAdmin();
