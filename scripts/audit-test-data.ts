/**
 * Audit Script: Identify Test Data in Database
 *
 * This script scans the database for test data that was accidentally created
 * by running integration tests against production/staging databases.
 *
 * Usage:
 *   tsx scripts/audit-test-data.ts
 *
 * IMPORTANT: This script only READS data - it does not delete anything.
 */

import { db } from '../server/db';
import { organizations, users, teams, measurements, auditLogs, sessions } from '@shared/schema';
import { or, like, sql } from 'drizzle-orm';

async function auditTestData() {
  console.log('🔍 Scanning database for test data...\n');
  console.log('='.repeat(80));

  try {
    // Find test organizations
    console.log('\n📊 Scanning Organizations...');
    const testOrgs = await db.select()
      .from(organizations)
      .where(or(
        // Name patterns
        like(organizations.name, '%Test%'),
        like(organizations.name, '%API%Test%'),
        like(organizations.name, '%Bulk Ops%'),
        like(organizations.name, '%Delete%'),
        like(organizations.name, '%Deactivate%'),
        like(organizations.name, '%Reactivate%'),
        like(organizations.name, '%Update%Org%'),
        // Email patterns
        like(organizations.contactEmail, '%@example.com'),
        like(organizations.contactEmail, '%@test.com'),
        like(organizations.contactEmail, '%-1%@%'),  // Timestamp pattern
      ));

    if (testOrgs.length === 0) {
      console.log('   ✅ No test organizations found');
    } else {
      console.log(`   ⚠️  Found ${testOrgs.length} suspicious organizations:`);
      testOrgs.forEach(org => {
        console.log(`      - "${org.name}"`);
        console.log(`        Email: ${org.contactEmail || 'none'}`);
        console.log(`        Created: ${org.createdAt}`);
        console.log(`        Active: ${org.isActive}`);
        console.log(`        ID: ${org.id}`);
        console.log('');
      });
    }

    // Find test users
    console.log('\n👤 Scanning Users...');
    const testUsers = await db.select()
      .from(users)
      .where(or(
        // Username patterns
        like(users.username, 'test-%'),
        like(users.username, '%-api-%'),
        like(users.username, '%-creation-%'),
        like(users.username, '%-del-%'),
        like(users.username, '%-admin-%'),
        like(users.username, '%orgadmin%'),
        like(users.username, '%siteadmin%'),
        like(users.username, 'bulk-ops-%'),
        like(users.username, 'dep-user%'),
        like(users.username, 'count-user%'),
        like(users.username, 'meas-user%'),
        like(users.username, 'preserve-user%'),
        like(users.username, 'block-user%'),
        // Email patterns (check JSON array)
        sql`emails::text LIKE '%@test.com%'`,
        sql`emails::text LIKE '%@example.com%'`,
        sql`emails::text LIKE '%-${sql.raw('1')}%@%'`,  // Timestamp pattern
      ));

    if (testUsers.length === 0) {
      console.log('   ✅ No test users found');
    } else {
      console.log(`   ⚠️  Found ${testUsers.length} suspicious users:`);
      testUsers.forEach(user => {
        console.log(`      - ${user.username}`);
        console.log(`        Email: ${user.emails?.[0] || 'none'}`);
        console.log(`        Role: ${user.role || 'none'}`);
        console.log(`        Site Admin: ${user.isSiteAdmin}`);
        console.log(`        ID: ${user.id}`);
        console.log('');
      });
    }

    // Get related data counts
    if (testOrgs.length > 0) {
      const testOrgIds = testOrgs.map(o => o.id);

      console.log('\n🏃 Scanning Teams in Test Organizations...');
      const testTeams = await db.select()
        .from(teams)
        .where(sql`organization_id = ANY(${testOrgIds})`);

      if (testTeams.length === 0) {
        console.log('   ✅ No test teams found');
      } else {
        console.log(`   ⚠️  Found ${testTeams.length} teams in test organizations`);
        testTeams.forEach(team => {
          console.log(`      - ${team.name} (${team.level})`);
        });
      }

      console.log('\n📏 Scanning Measurements from Test Users...');
      if (testUsers.length > 0) {
        const testUserIds = testUsers.map(u => u.id);
        const measurementCount = await db.select({ count: sql<number>`count(*)` })
          .from(measurements)
          .where(sql`user_id = ANY(${testUserIds})`);

        console.log(`   ⚠️  Found ${measurementCount[0]?.count || 0} measurements from test users`);
      } else {
        console.log('   ✅ No measurements to check (no test users)');
      }

      console.log('\n📋 Scanning Audit Logs from Test Users...');
      if (testUsers.length > 0) {
        const testUserIds = testUsers.map(u => u.id);
        const auditLogCount = await db.select({ count: sql<number>`count(*)` })
          .from(auditLogs)
          .where(sql`user_id = ANY(${testUserIds})`);

        console.log(`   ⚠️  Found ${auditLogCount[0]?.count || 0} audit log entries from test users`);
      } else {
        console.log('   ✅ No audit logs to check (no test users)');
      }

      console.log('\n🔐 Scanning Sessions from Test Users...');
      if (testUsers.length > 0) {
        const testUserIds = testUsers.map(u => u.id);
        const sessionCount = await db.select({ count: sql<number>`count(*)` })
          .from(sessions)
          .where(sql`user_id = ANY(${testUserIds})`);

        console.log(`   ⚠️  Found ${sessionCount[0]?.count || 0} active sessions from test users`);
      } else {
        console.log('   ✅ No sessions to check (no test users)');
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Organizations: ${testOrgs.length}`);
    console.log(`Users:         ${testUsers.length}`);

    if (testOrgs.length === 0 && testUsers.length === 0) {
      console.log('\n✅ No test data detected in database!');
      console.log('   The database appears clean.');
    } else {
      console.log('\n⚠️  TEST DATA DETECTED!');
      console.log('   Review the data above carefully before proceeding with cleanup.');
      console.log('\n   Next steps:');
      console.log('   1. Verify each item is actually test data (not a real organization/user)');
      console.log('   2. Export a database backup: pg_dump > backup-before-cleanup.sql');
      console.log('   3. Run: CONFIRM_CLEANUP=yes tsx scripts/cleanup-test-data.ts');
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('\n❌ Error during audit:');
    console.error(error);
    process.exit(1);
  }
}

// Main execution
auditTestData()
  .then(() => {
    console.log('\n✅ Audit complete\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:');
    console.error(error);
    process.exit(1);
  });
