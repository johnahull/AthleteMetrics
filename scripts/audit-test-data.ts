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
import { sql } from 'drizzle-orm';

interface Organization {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
}

interface User {
  id: string;
  username: string;
  emails: string[] | null;
  is_site_admin: boolean;
}

interface Team {
  id: string;
  name: string;
  level: string | null;
}

interface CountResult {
  count: number;
}

async function auditTestData() {
  console.log('🔍 Scanning database for test data...\n');
  console.log('='.repeat(80));

  try {
    // Find test organizations using raw SQL to avoid schema version issues
    console.log('\n📊 Scanning Organizations...');

    const orgQuery = sql`
      SELECT id, name, description, created_at
      FROM organizations
      WHERE name LIKE '%Test%'
         OR name LIKE '%API%'
         OR name LIKE '%Bulk%'
         OR name LIKE '%Delete%'
         OR name LIKE '%Deactivate%'
         OR name LIKE '%Reactivate%'
         OR name LIKE '%Update%Org%'
    `;

    const testOrgsResult = await db.execute(orgQuery);
    const testOrgs = (Array.isArray(testOrgsResult) ? testOrgsResult : testOrgsResult.rows || []) as Organization[];

    if (testOrgs.length === 0) {
      console.log('   ✅ No test organizations found');
    } else {
      console.log(`   ⚠️  Found ${testOrgs.length} suspicious organizations:`);
      testOrgs.forEach(org => {
        console.log(`      - "${org.name}"`);
        console.log(`        Description: ${org.description || 'none'}`);
        console.log(`        Created: ${org.created_at}`);
        console.log(`        ID: ${org.id}`);
        console.log('');
      });
    }

    // Find test users using raw SQL
    console.log('\n👤 Scanning Users...');

    const userQuery = sql`
      SELECT id, username, emails, is_site_admin
      FROM users
      WHERE username LIKE 'test-%'
         OR username LIKE '%-api-%'
         OR username LIKE '%-creation-%'
         OR username LIKE '%-del-%'
         OR username LIKE '%-admin-%'
         OR username LIKE '%orgadmin%'
         OR username LIKE '%siteadmin%'
         OR username LIKE 'bulk-ops-%'
         OR username LIKE 'dep-user%'
         OR username LIKE 'count-user%'
         OR username LIKE 'meas-user%'
         OR username LIKE 'preserve-user%'
         OR username LIKE 'block-user%'
         OR emails::text LIKE '%@test.com%'
         OR emails::text LIKE '%@example.com%'
    `;

    const testUsersResult = await db.execute(userQuery);
    const testUsers = (Array.isArray(testUsersResult) ? testUsersResult : testUsersResult.rows || []) as User[];

    if (testUsers.length === 0) {
      console.log('   ✅ No test users found');
    } else {
      console.log(`   ⚠️  Found ${testUsers.length} suspicious users:`);
      testUsers.forEach(user => {
        console.log(`      - ${user.username}`);
        console.log(`        Email: ${user.emails?.[0] || 'none'}`);
        console.log(`        Site Admin: ${user.is_site_admin}`);
        console.log(`        ID: ${user.id}`);
        console.log('');
      });
    }

    // Get related data counts
    if (testOrgs.length > 0 || testUsers.length > 0) {
      const testOrgIds = testOrgs.map(o => o.id);

      console.log('\n🏃 Scanning Teams in Test Organizations...');
      if (testOrgIds.length > 0) {
        // Safe: Each ID is parameterized via sql`${id}` before join
        const teamsQuery = sql`
          SELECT id, name, level
          FROM teams
          WHERE organization_id = ANY(ARRAY[${sql.join(testOrgIds.map(id => sql`${id}`), sql`, `)}]::text[])
        `;
        const teamsResult = await db.execute(teamsQuery);
        const testTeams = (Array.isArray(teamsResult) ? teamsResult : teamsResult.rows || []) as Team[];

        if (testTeams.length === 0) {
          console.log('   ✅ No test teams found');
        } else {
          console.log(`   ⚠️  Found ${testTeams.length} teams in test organizations`);
          testTeams.forEach(team => {
            console.log(`      - ${team.name} (${team.level})`);
          });
        }
      } else {
        console.log('   ✅ No test teams to check (no test organizations)');
      }

      console.log('\n📏 Scanning Measurements from Test Users...');
      if (testUsers.length > 0) {
        const testUserIds = testUsers.map(u => u.id);
        const measurementQuery = sql`
          SELECT COUNT(*) as count
          FROM measurements
          WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
        `;
        const measurementResult = await db.execute(measurementQuery);
        const measurementRows = (Array.isArray(measurementResult) ? measurementResult : measurementResult.rows || []) as CountResult[];
        const measurementCount = measurementRows[0]?.count || 0;

        console.log(`   ⚠️  Found ${measurementCount} measurements from test users`);
      } else {
        console.log('   ✅ No measurements to check (no test users)');
      }

      console.log('\n📋 Scanning Audit Logs from Test Users...');
      if (testUsers.length > 0) {
        const testUserIds = testUsers.map(u => u.id);
        const auditQuery = sql`
          SELECT COUNT(*) as count
          FROM audit_logs
          WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
        `;
        const auditResult = await db.execute(auditQuery);
        const auditRows = (Array.isArray(auditResult) ? auditResult : auditResult.rows || []) as CountResult[];
        const auditCount = auditRows[0]?.count || 0;

        console.log(`   ⚠️  Found ${auditCount} audit log entries from test users`);
      } else {
        console.log('   ✅ No audit logs to check (no test users)');
      }

      console.log('\n🔐 Scanning Sessions from Test Users...');
      if (testUsers.length > 0) {
        try {
          const testUserIds = testUsers.map(u => u.id);
          const sessionQuery = sql`
            SELECT COUNT(*) as count
            FROM sessions
            WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
          `;
          const sessionResult = await db.execute(sessionQuery);
          const sessionRows = (Array.isArray(sessionResult) ? sessionResult : sessionResult.rows || []) as CountResult[];
          const sessionCount = sessionRows[0]?.count || 0;

          console.log(`   ⚠️  Found ${sessionCount} active sessions from test users`);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === '42P01') {
            console.log('   ℹ️  Sessions table does not exist in this database (skipping)');
          } else {
            throw error;
          }
        }
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
