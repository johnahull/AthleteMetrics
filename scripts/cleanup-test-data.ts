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
import { organizations, users, teams, userOrganizations, userTeams, measurements, auditLogs, sessions } from '@shared/schema';
import { eq, or, like, sql, inArray } from 'drizzle-orm';
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
    // Step 1: Find test organizations
    console.log('📊 Finding test organizations...');
    const testOrgs = await db.select()
      .from(organizations)
      .where(or(
        like(organizations.name, '%Test%'),
        like(organizations.name, '%API%Test%'),
        like(organizations.contactEmail, '%@example.com'),
        like(organizations.contactEmail, '%@test.com')
      ));

    // Step 2: Find test users
    console.log('👤 Finding test users...');
    const testUsers = await db.select()
      .from(users)
      .where(or(
        like(users.username, 'test-%'),
        like(users.username, '%-api-%'),
        like(users.username, '%-creation-%'),
        like(users.username, '%-del-%'),
        sql`emails::text LIKE '%@test.com%'`,
        sql`emails::text LIKE '%@example.com%'`
      ));

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
        console.log(`   - ${org.name} (${org.contactEmail})`);
      });
    }

    if (testUsers.length > 0) {
      console.log(`\n👤 ${testUsers.length} Users:`);
      testUsers.forEach(user => {
        console.log(`   - ${user.username} (${user.emails?.[0] || 'no email'})`);
      });
    }

    console.log('\n' + '='.repeat(80));

    // Require manual confirmation
    console.log('\n⚠️  FINAL CONFIRMATION REQUIRED');
    const confirmed = await promptConfirmation(
      `\nYou are about to delete ${testOrgs.length} organizations and ${testUsers.length} users.`
    );

    if (!confirmed) {
      console.log('\n❌ Cleanup cancelled by user');
      console.log('='.repeat(80) + '\n');
      return;
    }

    console.log('\n🗑️  Starting cleanup...\n');

    // Step 3: Delete test organizations and related data
    const testOrgIds = testOrgs.map(o => o.id);

    for (const orgId of testOrgIds) {
      const org = testOrgs.find(o => o.id === orgId);
      console.log(`\n📦 Processing: ${org?.name}`);

      // Get users in this organization
      const orgUsers = await db.select()
        .from(userOrganizations)
        .where(eq(userOrganizations.organizationId, orgId));
      const userIds = orgUsers.map(u => u.userId);

      if (userIds.length > 0) {
        // Delete measurements
        const deletedMeasurements = await db.delete(measurements)
          .where(inArray(measurements.userId, userIds))
          .returning({ id: measurements.id });
        console.log(`   ✓ Deleted ${deletedMeasurements.length} measurements`);

        // Delete user-team relationships
        const deletedUserTeams = await db.delete(userTeams)
          .where(inArray(userTeams.userId, userIds))
          .returning({ userId: userTeams.userId });
        console.log(`   ✓ Deleted ${deletedUserTeams.length} user-team relationships`);

        // Delete user-org relationships
        const deletedUserOrgs = await db.delete(userOrganizations)
          .where(eq(userOrganizations.organizationId, orgId))
          .returning({ userId: userOrganizations.userId });
        console.log(`   ✓ Deleted ${deletedUserOrgs.length} user-org relationships`);

        // Delete sessions
        const deletedSessions = await db.delete(sessions)
          .where(inArray(sessions.userId, userIds))
          .returning({ sid: sessions.sid });
        console.log(`   ✓ Deleted ${deletedSessions.length} sessions`);

        // Delete audit logs
        const deletedAuditLogs = await db.delete(auditLogs)
          .where(inArray(auditLogs.userId, userIds))
          .returning({ id: auditLogs.id });
        console.log(`   ✓ Deleted ${deletedAuditLogs.length} audit log entries`);

        // Delete users
        const deletedUsers = await db.delete(users)
          .where(inArray(users.id, userIds))
          .returning({ id: users.id });
        console.log(`   ✓ Deleted ${deletedUsers.length} users`);
      }

      // Delete teams
      const deletedTeams = await db.delete(teams)
        .where(eq(teams.organizationId, orgId))
        .returning({ id: teams.id });
      console.log(`   ✓ Deleted ${deletedTeams.length} teams`);

      // Delete organization
      await db.delete(organizations).where(eq(organizations.id, orgId));
      console.log(`   ✓ Deleted organization: ${org?.name}`);
    }

    // Step 4: Delete orphaned test users (not in any organization)
    const testUserIds = testUsers.map(u => u.id);
    const orphanedUserIds = testUserIds.filter(id => {
      // Check if user is already deleted as part of org cleanup
      return !testOrgIds.some(orgId =>
        orgUsers.some(ou => ou.userId === id && ou.organizationId === orgId)
      );
    });

    if (orphanedUserIds.length > 0) {
      console.log(`\n👤 Cleaning up ${orphanedUserIds.length} orphaned test users...`);

      // Delete measurements
      await db.delete(measurements).where(inArray(measurements.userId, orphanedUserIds));

      // Delete user relationships
      await db.delete(userTeams).where(inArray(userTeams.userId, orphanedUserIds));
      await db.delete(userOrganizations).where(inArray(userOrganizations.userId, orphanedUserIds));

      // Delete sessions
      await db.delete(sessions).where(inArray(sessions.userId, orphanedUserIds));

      // Delete audit logs
      await db.delete(auditLogs).where(inArray(auditLogs.userId, orphanedUserIds));

      // Delete users
      const deletedOrphanUsers = await db.delete(users)
        .where(inArray(users.id, orphanedUserIds))
        .returning({ id: users.id });
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
