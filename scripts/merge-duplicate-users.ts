/**
 * Merge duplicate users with the same email address
 *
 * This script consolidates multiple user records sharing the same email
 * into a single user with multiple organization memberships.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/merge-duplicate-users.ts [options]
 *
 * Options:
 *   --dry-run           Show what would be merged without making changes
 *   --email <email>     Only process a specific email address
 *   --verbose           Show detailed output
 *
 * Examples:
 *   # Preview all duplicate merges
 *   DATABASE_URL="..." npx tsx scripts/merge-duplicate-users.ts --dry-run
 *
 *   # Merge specific user
 *   DATABASE_URL="..." npx tsx scripts/merge-duplicate-users.ts --email phiahull@gmail.com
 *
 *   # Full merge with verbose output
 *   DATABASE_URL="..." npx tsx scripts/merge-duplicate-users.ts --verbose
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  users,
  userOrganizations,
  userTeams,
  measurements,
  invitations,
  auditLogs,
  goals,
  userAchievements,
  wellnessResponses,
  eventRegistrations,
  membershipRequests,
} from '../packages/shared/schema';
import { eq, sql, and, inArray, isNull } from 'drizzle-orm';

// Parse command line arguments
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const EMAIL_INDEX = process.argv.indexOf('--email');
const EMAIL_FILTER = EMAIL_INDEX !== -1 ? process.argv[EMAIL_INDEX + 1] : null;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

interface UserInfo {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  emails: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
  password: string | null;
  googleId: string | null;
  appleId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}

interface DuplicateGroup {
  email: string;
  users: UserInfo[];
}

interface MergeStats {
  emailsProcessed: number;
  usersMerged: number;
  measurementsTransferred: number;
  orgsTransferred: number;
  teamsTransferred: number;
  errors: string[];
}

function log(message: string, verbose = false): void {
  if (!verbose || VERBOSE) {
    console.log(message);
  }
}

/**
 * Find all emails that exist in multiple user records
 */
async function findDuplicateEmails(): Promise<DuplicateGroup[]> {
  log('🔍 Finding users with duplicate emails...');

  // Find emails that appear in multiple user records
  // Uses PostgreSQL unnest to expand email arrays and find duplicates
  const duplicateEmailQuery = EMAIL_FILTER
    ? sql`
      WITH email_unnested AS (
        SELECT
          u.id as user_id,
          LOWER(TRIM(unnest(u.emails))) as email
        FROM users u
        WHERE u.deleted_at IS NULL
      )
      SELECT
        email,
        array_agg(user_id) as user_ids
      FROM email_unnested
      GROUP BY email
      HAVING COUNT(DISTINCT user_id) > 1 AND email = ${EMAIL_FILTER.toLowerCase()}
    `
    : sql`
      WITH email_unnested AS (
        SELECT
          u.id as user_id,
          LOWER(TRIM(unnest(u.emails))) as email
        FROM users u
        WHERE u.deleted_at IS NULL
      )
      SELECT
        email,
        array_agg(user_id) as user_ids
      FROM email_unnested
      GROUP BY email
      HAVING COUNT(DISTINCT user_id) > 1
    `;

  const duplicatesResult = await db.execute(duplicateEmailQuery);
  // Handle both array and object-with-rows return formats
  const duplicates = (Array.isArray(duplicatesResult) ? duplicatesResult : duplicatesResult.rows || []) as { email: string; user_ids: string[] }[];
  const groups: DuplicateGroup[] = [];

  for (const row of duplicates) {
    const email = row.email;
    const userIds = row.user_ids;

    // Get detailed info for each user
    const userDetails = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        emails: users.emails,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        password: users.password,
        googleId: users.googleId,
        appleId: users.appleId,
        isActive: users.isActive,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    groups.push({
      email,
      users: userDetails as UserInfo[],
    });
  }

  return groups;
}

/**
 * Choose which user should be the "primary" user to keep.
 * Priority:
 * 1. Has OAuth linked (actively using the account)
 * 2. Has password set (registered properly)
 * 3. Most recent login
 * 4. Earliest created (original account)
 */
function choosePrimaryUser(group: DuplicateGroup): string {
  const sorted = [...group.users].sort((a, b) => {
    // Prefer users with OAuth linked
    const aHasOAuth = !!(a.googleId || a.appleId);
    const bHasOAuth = !!(b.googleId || b.appleId);
    if (aHasOAuth !== bHasOAuth) return aHasOAuth ? -1 : 1;

    // Prefer users with passwords
    const aHasPassword = !!a.password;
    const bHasPassword = !!b.password;
    if (aHasPassword !== bHasPassword) return aHasPassword ? -1 : 1;

    // Prefer more recent login
    if (a.lastLoginAt && b.lastLoginAt) {
      return b.lastLoginAt.getTime() - a.lastLoginAt.getTime();
    }
    if (a.lastLoginAt) return -1;
    if (b.lastLoginAt) return 1;

    // Prefer earlier creation (original account)
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return sorted[0].id;
}

/**
 * Merge secondary users into the primary user
 */
async function mergeUsers(
  primaryId: string,
  secondaryIds: string[],
  email: string,
  stats: MergeStats
): Promise<void> {
  for (const secondaryId of secondaryIds) {
    log(`  📦 Merging ${secondaryId} -> ${primaryId}`, true);

    try {
      // Wrap all merge operations in a transaction for data consistency
      const result = await db.transaction(async (tx) => {
        let measurementsCount = 0;
        let orgsCount = 0;
        let teamsCount = 0;

        // 1. Transfer measurements
        const measurementsBefore = await tx
          .select({ id: measurements.id })
          .from(measurements)
          .where(eq(measurements.userId, secondaryId));

        if (measurementsBefore.length > 0) {
          await tx
            .update(measurements)
            .set({ userId: primaryId })
            .where(eq(measurements.userId, secondaryId));
          measurementsCount = measurementsBefore.length;
          log(`    ✓ Transferred ${measurementsBefore.length} measurements`, true);
        }

        // 2. Transfer organization memberships (avoiding duplicates)
        const secondaryOrgs = await tx
          .select()
          .from(userOrganizations)
          .where(eq(userOrganizations.userId, secondaryId));

        const primaryOrgs = await tx
          .select()
          .from(userOrganizations)
          .where(eq(userOrganizations.userId, primaryId));

        const primaryOrgIds = new Set(primaryOrgs.map((o) => o.organizationId));

        for (const org of secondaryOrgs) {
          if (!primaryOrgIds.has(org.organizationId)) {
            // Transfer the membership
            await tx
              .update(userOrganizations)
              .set({ userId: primaryId })
              .where(eq(userOrganizations.id, org.id));
            orgsCount++;
            log(`    ✓ Transferred org membership: ${org.organizationId}`, true);
          } else {
            // Delete duplicate membership
            await tx.delete(userOrganizations).where(eq(userOrganizations.id, org.id));
            log(`    ⚠ Removed duplicate org membership: ${org.organizationId}`, true);
          }
        }

        // 3. Transfer team memberships (avoiding duplicates)
        const secondaryTeams = await tx
          .select()
          .from(userTeams)
          .where(eq(userTeams.userId, secondaryId));

        const primaryTeams = await tx
          .select()
          .from(userTeams)
          .where(eq(userTeams.userId, primaryId));

        const primaryTeamIds = new Set(primaryTeams.map((t) => t.teamId));

        for (const team of secondaryTeams) {
          if (!primaryTeamIds.has(team.teamId)) {
            await tx
              .update(userTeams)
              .set({ userId: primaryId })
              .where(eq(userTeams.id, team.id));
            teamsCount++;
            log(`    ✓ Transferred team membership: ${team.teamId}`, true);
          } else {
            await tx.delete(userTeams).where(eq(userTeams.id, team.id));
            log(`    ⚠ Removed duplicate team membership: ${team.teamId}`, true);
          }
        }

        // 4. Transfer goals
        await tx.update(goals).set({ userId: primaryId }).where(eq(goals.userId, secondaryId));

        // 5. Transfer user achievements
        await tx
          .update(userAchievements)
          .set({ userId: primaryId })
          .where(eq(userAchievements.userId, secondaryId));

        // 6. Transfer wellness responses
        await tx
          .update(wellnessResponses)
          .set({ userId: primaryId })
          .where(eq(wellnessResponses.userId, secondaryId));

        // 7. Transfer event registrations
        await tx
          .update(eventRegistrations)
          .set({ userId: primaryId })
          .where(eq(eventRegistrations.userId, secondaryId));

        // 8. Transfer membership requests
        await tx
          .update(membershipRequests)
          .set({ userId: primaryId })
          .where(eq(membershipRequests.userId, secondaryId));

        // 9. Update invitations that reference secondary user
        await tx
          .update(invitations)
          .set({ playerId: primaryId })
          .where(eq(invitations.playerId, secondaryId));

        await tx
          .update(invitations)
          .set({ acceptedBy: primaryId })
          .where(eq(invitations.acceptedBy, secondaryId));

        await tx
          .update(invitations)
          .set({ invitedBy: primaryId })
          .where(eq(invitations.invitedBy, secondaryId));

        // 10. Update audit logs to preserve history
        await tx
          .update(auditLogs)
          .set({ userId: primaryId })
          .where(eq(auditLogs.userId, secondaryId));

        // 11. Create audit log for the merge operation (using user_deleted as user_merged is not in allowed actions)
        await tx.insert(auditLogs).values({
          userId: primaryId,
          action: 'user_deleted',
          resourceType: 'user',
          resourceId: secondaryId,
          details: JSON.stringify({
            operation: 'user_merged',
            mergedFrom: secondaryId,
            mergedTo: primaryId,
            email,
            reason: 'duplicate_email_consolidation',
          }),
        });

        // 12. Soft-delete the secondary user and free up username
        const secondaryUser = await tx.select().from(users).where(eq(users.id, secondaryId));
        const oldUsername = secondaryUser[0]?.username || 'unknown';

        await tx
          .update(users)
          .set({
            deletedAt: new Date(),
            isActive: false,
            username: `${oldUsername}_merged_${secondaryId.slice(0, 8)}`,
          })
          .where(eq(users.id, secondaryId));

        return { measurementsCount, orgsCount, teamsCount };
      });

      // Update stats after successful transaction
      stats.measurementsTransferred += result.measurementsCount;
      stats.orgsTransferred += result.orgsCount;
      stats.teamsTransferred += result.teamsCount;
      stats.usersMerged++;
      log(`    ✅ Merged and soft-deleted user ${secondaryId}`, true);
    } catch (error) {
      const errorMsg = `Failed to merge ${secondaryId}: ${error}`;
      console.error(`    ❌ ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }
}

/**
 * Display a summary of a duplicate group
 */
function displayGroup(group: DuplicateGroup, primaryId: string): void {
  console.log(`\n📧 Email: ${group.email}`);
  console.log(`   Users found: ${group.users.length}`);

  for (const user of group.users) {
    const isPrimary = user.id === primaryId;
    const marker = isPrimary ? '👑' : '  ';
    const hasOAuth = user.googleId || user.appleId ? '🔐OAuth' : '';
    const hasPassword = user.password ? '🔑Pass' : '';
    const lastLogin = user.lastLoginAt
      ? `Last login: ${user.lastLoginAt.toISOString().split('T')[0]}`
      : 'Never logged in';

    console.log(
      `   ${marker} ${user.id.slice(0, 8)}... | ${user.username} | ${user.firstName} ${user.lastName}`
    );
    console.log(`      ${hasOAuth} ${hasPassword} | ${lastLogin}`);
  }
}

async function main(): Promise<void> {
  console.log('========================================');
  console.log(' Duplicate User Merge Script');
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);
  if (EMAIL_FILTER) console.log(`   Filter: ${EMAIL_FILTER}`);
  console.log('========================================');

  const stats: MergeStats = {
    emailsProcessed: 0,
    usersMerged: 0,
    measurementsTransferred: 0,
    orgsTransferred: 0,
    teamsTransferred: 0,
    errors: [],
  };

  try {
    const duplicateGroups = await findDuplicateEmails();

    if (duplicateGroups.length === 0) {
      console.log('\n✅ No duplicate emails found!');
      await client.end();
      return;
    }

    console.log(`\n📊 Found ${duplicateGroups.length} email(s) with duplicate users`);

    for (const group of duplicateGroups) {
      const primaryId = choosePrimaryUser(group);
      const secondaryIds = group.users.filter((u) => u.id !== primaryId).map((u) => u.id);

      displayGroup(group, primaryId);
      console.log(`   Primary (keep): ${primaryId.slice(0, 8)}...`);
      console.log(`   Secondary (merge): ${secondaryIds.map((id) => id.slice(0, 8) + '...').join(', ')}`);

      if (!DRY_RUN) {
        await mergeUsers(primaryId, secondaryIds, group.email, stats);
      }

      stats.emailsProcessed++;
    }

    console.log('\n========================================');
    console.log(' Summary');
    console.log('========================================');
    console.log(`   Emails processed: ${stats.emailsProcessed}`);
    console.log(`   Users merged: ${stats.usersMerged}`);
    console.log(`   Measurements transferred: ${stats.measurementsTransferred}`);
    console.log(`   Org memberships transferred: ${stats.orgsTransferred}`);
    console.log(`   Team memberships transferred: ${stats.teamsTransferred}`);
    console.log(`   Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      stats.errors.forEach((e) => console.log(`   - ${e}`));
    }

    if (DRY_RUN) {
      console.log('\n🔍 This was a DRY RUN - no changes were made.');
      console.log('   Run without --dry-run to apply changes.');
    } else if (stats.usersMerged > 0) {
      console.log('\n✅ Merge complete! Users consolidated successfully.');
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
