/**
 * Cleanup Script: Remove Test Data from Database
 *
 * This script PERMANENTLY DELETES test data that was accidentally created
 * by running integration tests against production/staging databases.
 *
 * ⚠️  WARNING: THIS SCRIPT DELETES DATA! USE WITH EXTREME CAUTION! ⚠️
 *
 * Usage:
 *   1. Run audit first: tsx scripts/audit-test-data.ts
 *   2. Export backup: pg_dump $DATABASE_URL > backup-before-cleanup.sql
 *   3. Run cleanup: CONFIRM_CLEANUP=yes tsx scripts/cleanup-test-data.ts
 *
 * SAFETY FEATURES:
 * - Requires CONFIRM_CLEANUP=yes environment variable
 * - Shows preview and requires manual confirmation
 * - Deletes in correct order to respect foreign key constraints
 * - Provides detailed progress output
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import * as readline from 'readline';

// Safety check: Require explicit confirmation
if (process.env.CONFIRM_CLEANUP !== 'yes') {
  console.error('\n' + '='.repeat(80));
  console.error('⚠️  SAFETY CHECK FAILED');
  console.error('='.repeat(80));
  console.error('\nThis script PERMANENTLY DELETES data from the database.');
  console.error('To proceed, you must explicitly confirm by setting:');
  console.error('\n  CONFIRM_CLEANUP=yes tsx scripts/cleanup-test-data.ts\n');
  console.error('='.repeat(80) + '\n');
  process.exit(1);
}

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (type 'DELETE' to confirm): `, (answer) => {
      rl.close();
      resolve(answer === 'DELETE');
    });
  });
}

async function cleanupTestData() {
  console.log('\n' + '='.repeat(80));
  console.log('🧹 TEST DATA CLEANUP SCRIPT');
  console.log('='.repeat(80));
  console.log('\n⚠️  WARNING: This will PERMANENTLY DELETE data!\n');

  try {
    // Step 1: Find test organizations using raw SQL
    console.log('📊 Finding test organizations...');
    const orgQuery = sql`
      SELECT id, name
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
    const testOrgs = (Array.isArray(testOrgsResult) ? testOrgsResult : testOrgsResult.rows || []) as Array<{
      id: string;
      name: string;
    }>;

    // Step 2: Find test users using raw SQL
    console.log('👤 Finding test users...');
    const userQuery = sql`
      SELECT id, username, emails
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
    const testUsers = (Array.isArray(testUsersResult) ? testUsersResult : testUsersResult.rows || []) as Array<{
      id: string;
      username: string;
      emails: string[] | null;
    }>;

    if (testOrgs.length === 0 && testUsers.length === 0) {
      console.log('\n✅ No test data found. Database is clean!');
      console.log('='.repeat(80) + '\n');
      return;
    }

    // Show preview
    console.log('\n' + '='.repeat(80));
    console.log('PREVIEW: Data to be deleted');
    console.log('='.repeat(80));

    if (testOrgs.length > 0) {
      console.log(`\n📊 ${testOrgs.length} Organizations:`);
      testOrgs.forEach(org => {
        console.log(`   - ${org.name}`);
      });
    }

    if (testUsers.length > 0) {
      console.log(`\n👤 ${testUsers.length} Users:`);
      testUsers.forEach(user => {
        console.log(`   - ${user.username} (${user.emails?.[0] || 'no email'})`);
      });
    }

    console.log('\n' + '='.repeat(80));

    // Require manual confirmation (unless SKIP_CONFIRMATION is set for automation)
    if (process.env.SKIP_CONFIRMATION !== 'yes') {
      console.log('\n⚠️  FINAL CONFIRMATION REQUIRED');
      const confirmed = await promptConfirmation(
        `\nYou are about to delete ${testOrgs.length} organizations and ${testUsers.length} users.`
      );

      if (!confirmed) {
        console.log('\n❌ Cleanup cancelled by user');
        console.log('='.repeat(80) + '\n');
        return;
      }
    } else {
      console.log('\n⚠️  SKIP_CONFIRMATION=yes detected - proceeding automatically');
    }

    console.log('\n🗑️  Starting cleanup...\n');

    // Step 3: Delete test organizations and related data
    const testOrgIds = testOrgs.map(o => o.id);
    const testUserIds = testUsers.map(u => u.id);

    // FIRST: Delete ALL user-team relationships for teams in test organizations
    // (This must happen before deleting teams due to foreign key constraints)
    if (testOrgIds.length > 0) {
      console.log('🔗 Deleting all user-team relationships for teams in test organizations...');
      const deleteAllUserTeamsQuery = sql`
        DELETE FROM user_teams
        WHERE team_id IN (
          SELECT id FROM teams WHERE organization_id = ANY(ARRAY[${sql.join(testOrgIds.map(id => sql`${id}`), sql`, `)}]::text[])
        )
        RETURNING user_id
      `;
      const deletedAllUserTeamsResult = await db.execute(deleteAllUserTeamsQuery);
      const deletedAllUserTeams = Array.isArray(deletedAllUserTeamsResult) ? deletedAllUserTeamsResult : deletedAllUserTeamsResult.rows || [];
      console.log(`   ✓ Deleted ${deletedAllUserTeams.length} user-team relationships\n`);
    }

    // SECOND: Process each organization
    for (const orgId of testOrgIds) {
      const org = testOrgs.find(o => o.id === orgId);
      console.log(`📦 Processing: ${org?.name}`);

      // Get users in this organization
      const orgUsersQuery = sql`
        SELECT user_id
        FROM user_organizations
        WHERE organization_id = ${orgId}
      `;
      const orgUsersResult = await db.execute(orgUsersQuery);
      const orgUsers = (Array.isArray(orgUsersResult) ? orgUsersResult : orgUsersResult.rows || []) as Array<{ user_id: string }>;
      const userIds = orgUsers.map(u => u.user_id);

      if (userIds.length > 0) {
        // Delete measurements
        const deleteMeasurementsQuery = sql`
          DELETE FROM measurements
          WHERE user_id = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::text[])
          RETURNING id
        `;
        const deletedMeasurementsResult = await db.execute(deleteMeasurementsQuery);
        const deletedMeasurements = Array.isArray(deletedMeasurementsResult) ? deletedMeasurementsResult : deletedMeasurementsResult.rows || [];
        console.log(`   ✓ Deleted ${deletedMeasurements.length} measurements`);

        // Delete user-org relationships
        const deleteUserOrgsQuery = sql`
          DELETE FROM user_organizations
          WHERE organization_id = ${orgId}
          RETURNING user_id
        `;
        const deletedUserOrgsResult = await db.execute(deleteUserOrgsQuery);
        const deletedUserOrgs = Array.isArray(deletedUserOrgsResult) ? deletedUserOrgsResult : deletedUserOrgsResult.rows || [];
        console.log(`   ✓ Deleted ${deletedUserOrgs.length} user-org relationships`);

        // Delete sessions (if table exists)
        try {
          const deleteSessionsQuery = sql`
            DELETE FROM sessions
            WHERE user_id = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::text[])
            RETURNING sid
          `;
          const deletedSessionsResult = await db.execute(deleteSessionsQuery);
          const deletedSessions = Array.isArray(deletedSessionsResult) ? deletedSessionsResult : deletedSessionsResult.rows || [];
          console.log(`   ✓ Deleted ${deletedSessions.length} sessions`);
        } catch (error: any) {
          if (error.code === '42P01') {
            console.log(`   ℹ️  Sessions table does not exist (skipping)`);
          } else {
            throw error;
          }
        }

        // Delete audit logs
        const deleteAuditLogsQuery = sql`
          DELETE FROM audit_logs
          WHERE user_id = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::text[])
          RETURNING id
        `;
        const deletedAuditLogsResult = await db.execute(deleteAuditLogsQuery);
        const deletedAuditLogs = Array.isArray(deletedAuditLogsResult) ? deletedAuditLogsResult : deletedAuditLogsResult.rows || [];
        console.log(`   ✓ Deleted ${deletedAuditLogs.length} audit log entries`);

        // Delete users
        const deleteUsersQuery = sql`
          DELETE FROM users
          WHERE id = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::text[])
          RETURNING id
        `;
        const deletedUsersResult = await db.execute(deleteUsersQuery);
        const deletedUsers = Array.isArray(deletedUsersResult) ? deletedUsersResult : deletedUsersResult.rows || [];
        console.log(`   ✓ Deleted ${deletedUsers.length} users`);
      }

      // Delete teams (now safe because user_teams were deleted first)
      const deleteTeamsQuery = sql`
        DELETE FROM teams
        WHERE organization_id = ${orgId}
        RETURNING id
      `;
      const deletedTeamsResult = await db.execute(deleteTeamsQuery);
      const deletedTeams = Array.isArray(deletedTeamsResult) ? deletedTeamsResult : deletedTeamsResult.rows || [];
      console.log(`   ✓ Deleted ${deletedTeams.length} teams`);

      // Delete organization
      await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
      console.log(`   ✓ Deleted organization: ${org?.name}\n`);
    }

    // Step 4: Delete orphaned test users (users not in test organizations)
    // These are users that match test patterns but aren't in the test orgs we're deleting
    console.log(`\n👤 Cleaning up orphaned test users...`);

    if (testUserIds.length > 0) {
      // Delete measurements
      const deleteMeasurementsQuery = sql`
        DELETE FROM measurements
        WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
      `;
      await db.execute(deleteMeasurementsQuery);

      // Delete user relationships
      const deleteUserTeamsQuery = sql`
        DELETE FROM user_teams
        WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
      `;
      await db.execute(deleteUserTeamsQuery);

      const deleteUserOrgsQuery = sql`
        DELETE FROM user_organizations
        WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
      `;
      await db.execute(deleteUserOrgsQuery);

      // Delete sessions (if table exists)
      try {
        const deleteSessionsQuery = sql`
          DELETE FROM sessions
          WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
        `;
        await db.execute(deleteSessionsQuery);
      } catch (error: any) {
        if (error.code !== '42P01') {
          throw error;
        }
      }

      // Delete audit logs
      const deleteAuditLogsQuery = sql`
        DELETE FROM audit_logs
        WHERE user_id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
      `;
      await db.execute(deleteAuditLogsQuery);

      // Delete users
      const deleteUsersQuery = sql`
        DELETE FROM users
        WHERE id = ANY(ARRAY[${sql.join(testUserIds.map(id => sql`${id}`), sql`, `)}]::text[])
        RETURNING id
      `;
      const deletedOrphanUsersResult = await db.execute(deleteUsersQuery);
      const deletedOrphanUsers = Array.isArray(deletedOrphanUsersResult) ? deletedOrphanUsersResult : deletedOrphanUsersResult.rows || [];
      console.log(`   ✓ Deleted ${deletedOrphanUsers.length} orphaned users`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ CLEANUP COMPLETE');
    console.log('='.repeat(80));
    console.log(`\nDeleted:`);
    console.log(`  - ${testOrgs.length} organizations`);
    console.log(`  - ${testUsers.length} users (and all related data)`);
    console.log('\nDatabase has been cleaned of test data.');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ ERROR DURING CLEANUP');
    console.error('='.repeat(80));
    console.error('\nCleanup failed. Your database may be in an inconsistent state.');
    console.error('Restore from backup if needed: psql $DATABASE_URL < backup-before-cleanup.sql\n');
    console.error('Error details:');
    console.error(error);
    console.error('\n' + '='.repeat(80) + '\n');
    process.exit(1);
  }
}

// Main execution
cleanupTestData()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:');
    console.error(error);
    process.exit(1);
  });
