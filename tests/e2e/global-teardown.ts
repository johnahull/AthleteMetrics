/**
 * Global Teardown for E2E Tests
 *
 * This runs ONCE after all tests complete to clean up test data.
 *
 * Cleanup strategy:
 * 1. Delete test users created during setup (will cascade to sessions, userOrganizations, userTeams)
 * 2. Delete test teams (will cascade to userTeams)
 * 3. Delete test organization (will cascade to teams, userOrganizations)
 * 4. Delete orphaned measurements (no FK constraint, requires manual cleanup)
 * 5. Clean up any test athletes created during tests via API
 *
 * The cleanup is designed to:
 * - Be safe (only delete E2E test data)
 * - Continue on errors (log but don't fail)
 * - Respect foreign key constraints (delete in correct order)
 */

import { FullConfig, chromium } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, or, like, inArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { retryDatabaseOperation } from './constants';
import { getEnvironmentConfig } from './config';

// Organization names are environment-specific (defined in globalTeardown function)
// to prevent conflicts between staging and testing environments

// Test data patterns for identifying test athletes
// More specific patterns to avoid false positives with production data
const TEST_NAME_PATTERNS = {
  // Match E2E_Test* or E2ETest* patterns (preferred)
  e2ePrefix: /^E2E_?Test/i,
  // Legacy: Match Test* with timestamp (e.g., Test1703087654, TestAthlete1703087654)
  timestamp: /^Test\w*\d{10,}/,
  // Legacy: Broad Test* prefix (less safe, but kept for backward compatibility)
  testPrefix: /^Test/,
  // Email patterns
  testEmail: /test\d+@/,
  testDomains: ['@test.com', '@example.com'],
  // Safe match: Require both E2E name pattern AND test email domain
  safeMatch: (firstName: string, lastName: string, emails: string[]) => {
    const hasE2EName = /^E2E/i.test(firstName) || /^E2E/i.test(lastName);
    const hasTestEmail = emails?.some((email: string) =>
      ['@test.com', '@example.com'].some(domain => email.includes(domain)) ||
      /test\d+@/.test(email)
    );
    return hasE2EName && hasTestEmail;
  }
} as const;

// Athlete response type from API
interface AthleteResponse {
  id: string;
  firstName?: string;
  lastName?: string;
  emails?: string[];
}

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 Starting E2E Test Teardown...\n');

  // Use centralized environment detection to avoid duplication
  const {
    isTesting,
    ENV_NAME,
    E2E_ORG_NAME,
    E2E_SECOND_ORG_NAME,
    TARGET_URL,
    TARGET_USERNAME,
    TARGET_PASSWORD,
    DATABASE_URL,
  } = getEnvironmentConfig();

  console.log(`📍 Cleaning up ${ENV_NAME} environment`);

  // Clean up via API first (test athletes created during tests)
  await cleanupViaAPI(isTesting, ENV_NAME, TARGET_URL, TARGET_USERNAME, TARGET_PASSWORD);

  // Then clean up database resources created in setup
  if (DATABASE_URL) {
    await cleanupDatabase(DATABASE_URL, ENV_NAME, E2E_ORG_NAME, E2E_SECOND_ORG_NAME);
  } else {
    console.warn(`⚠️  ${ENV_NAME}_DATABASE_URL not set - skipping database cleanup`);
  }

  console.log('\n✅ E2E Test Teardown Complete\n');
}

/**
 * Clean up test athletes created during tests via API
 */
async function cleanupViaAPI(
  isTesting: boolean,
  ENV_NAME: string,
  TARGET_URL: string,
  TARGET_USERNAME: string | undefined,
  TARGET_PASSWORD: string | undefined
) {
  console.log('🗑️  Cleaning up test athletes via API...');

  if (!TARGET_USERNAME || !TARGET_PASSWORD) {
    console.warn(`  ⚠️  ${ENV_NAME} credentials not set - skipping API cleanup`);
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login to environment
    console.log('  🔐 Logging in...');
    await page.goto(`${TARGET_URL}/login`);

    // Wait for login form to be visible (React SPA needs time to mount)
    await page.waitForSelector('#username, input[name="username"]', { state: 'visible', timeout: 30000 });

    // Use ID selectors (testing env) with name fallback (staging env)
    await page.fill('#username, input[name="username"]', TARGET_USERNAME);
    await page.fill('#password, input[name="password"]', TARGET_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for navigation away from login page
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30000 });

    // Fetch all athletes
    const response = await page.request.get(`${TARGET_URL}/api/athletes`);

    if (!response.ok()) {
      console.warn('  ⚠️  Failed to fetch athletes - skipping API cleanup');
      return;
    }

    const athletes: AthleteResponse[] = await response.json();

    // Filter test athletes using safer pattern matching
    // Priority: Use E2E prefix + test email (safest)
    // Fallback: Use Test prefix with timestamp or test email patterns
    const testAthletes = athletes.filter((athlete: AthleteResponse) => {
      // Safest: E2E prefix + test email domain
      if (TEST_NAME_PATTERNS.safeMatch(
        athlete.firstName || '',
        athlete.lastName || '',
        athlete.emails || []
      )) {
        return true;
      }

      // Fallback: Test prefix with timestamp (reasonably safe)
      const timestampMatch = TEST_NAME_PATTERNS.timestamp.test(athlete.firstName || '') ||
                            TEST_NAME_PATTERNS.timestamp.test(athlete.lastName || '');
      if (timestampMatch) {
        return true;
      }

      // Fallback: Test email patterns (less safe, but useful)
      const emailMatch = athlete.emails?.some((email: string) =>
        TEST_NAME_PATTERNS.testDomains.some(domain => email.includes(domain)) ||
        TEST_NAME_PATTERNS.testEmail.test(email)
      );
      if (emailMatch) {
        return true;
      }

      return false;
    });

    console.log(`  Found ${testAthletes.length} test athletes to clean up`);

    // Delete test athletes
    let successCount = 0;
    let failureCount = 0;

    for (const athlete of testAthletes) {
      try {
        const deleteResponse = await page.request.delete(
          `${TARGET_URL}/api/athletes/${athlete.id}`
        );
        if (deleteResponse.ok()) {
          successCount++;
          console.log(`    ✓ Deleted: ${athlete.firstName} ${athlete.lastName}`);
        } else {
          failureCount++;
          console.warn(`    ⚠ Failed to delete ${athlete.id}: HTTP ${deleteResponse.status()}`);
        }
      } catch (error) {
        failureCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`    ⚠ Failed to delete ${athlete.id}: ${errorMsg}`);
      }
    }

    console.log(`  ✅ API cleanup: ${successCount} deleted, ${failureCount} failed`);
  } catch (error) {
    console.error('  ❌ API cleanup failed:', error);
    // Continue to database cleanup even if API cleanup fails
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Clean up database resources created in global setup
 */
async function cleanupDatabase(
  DATABASE_URL: string,
  ENV_NAME: string,
  E2E_ORG_NAME: string,
  E2E_SECOND_ORG_NAME: string
) {
  console.log('🗑️  Cleaning up database resources...');

  // Track critical failures that require manual intervention
  const criticalFailures: string[] = [];

  // Strict localhost detection - only matches actual localhost hosts in postgresql:// URLs
  const isLocalhost = DATABASE_URL.match(/^postgresql:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/);
  const client = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: 30, // 30 second timeout to prevent hanging on network issues
    idle_timeout: 10, // Close idle connections quickly in teardown (short-lived script)
    ssl: isLocalhost ? false : 'require',
  });
  const db = drizzle(client, { schema });

  try {
    // 1. Find E2E test organizations
    console.log('  📦 Looking for E2E test organizations...');
    const organization = await retryDatabaseOperation(
      async () => await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, E2E_ORG_NAME),
      }),
      'Find E2E test organization'
    );

    if (!organization) {
      console.log('  ℹ️  E2E test organization not found - nothing to clean up');
      return;
    }

    console.log(`  Found organization: ${organization.name} (${organization.id})`);

    // 2. Find all E2E test users (by firstName 'E2E' which matches all setup users)
    console.log('  👥 Finding E2E test users...');
    const e2eUsers = await retryDatabaseOperation(
      async () => await db.query.users.findMany({
        where: eq(schema.users.firstName, 'E2E'),
      }),
      'Find E2E test users'
    );

    console.log(`  Found ${e2eUsers.length} E2E test users`);

    // 3. Delete sessions for E2E users (foreign key constraint)
    // Using batch deletion with inArray for better performance (3 queries vs 15+ individual queries)
    if (e2eUsers.length > 0) {
      const userIds = e2eUsers.map(u => u.id);

      console.log('  🔐 Deleting sessions...');
      try {
        await db.delete(schema.sessions)
          .where(inArray(schema.sessions.userId, userIds));
        console.log(`    ✓ Deleted sessions for ${e2eUsers.length} users`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn('    ⚠ Failed to delete sessions:', errorMsg);
        criticalFailures.push(`Sessions: ${errorMsg}`);
        // Continue cleanup
      }

      // 4. Delete audit logs for E2E users (foreign key constraint)
      console.log('  📋 Deleting audit logs...');
      try {
        await db.delete(schema.auditLogs)
          .where(inArray(schema.auditLogs.userId, userIds));
        console.log(`    ✓ Deleted audit logs for ${e2eUsers.length} users`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn('    ⚠ Failed to delete audit logs:', errorMsg);
        // Continue cleanup
      }

      // 5. Delete measurements for E2E users
      // Note: measurements table has a userId field but no FK constraint defined in schema
      // We delete them explicitly for data completeness before deleting users
      console.log('  📊 Deleting measurements...');
      try {
        await db.delete(schema.measurements)
          .where(inArray(schema.measurements.userId, userIds));
        console.log(`    ✓ Deleted measurements for ${e2eUsers.length} users`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn('    ⚠ Failed to delete measurements:', errorMsg);
        // Continue cleanup
      }
    }

    // 6. Delete user-team assignments (will be cascade deleted, but explicit for clarity)
    console.log('  🏈 Deleting user-team assignments...');
    try {
      // Query teams by organizationId since process.env.E2E_TEAM_ID is not available
      // (global-setup and global-teardown run in separate Node.js processes)
      const teams = await db.query.teams.findMany({
        where: eq(schema.teams.organizationId, organization.id),
      });

      if (teams.length > 0) {
        const teamIds = teams.map(t => t.id);
        await db.delete(schema.userTeams)
          .where(inArray(schema.userTeams.teamId, teamIds));
        console.log(`    ✓ Deleted user-team assignments for ${teams.length} teams`);
      } else {
        console.log('    ℹ️  No teams found');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('    ⚠ Failed to delete user-team assignments:', errorMsg);
      // Continue cleanup
    }

    // 7. Delete user-organization assignments (will be cascade deleted, but explicit for clarity)
    console.log('  🏢 Deleting user-organization assignments...');
    try {
      await retryDatabaseOperation(
        async () => await db.delete(schema.userOrganizations)
          .where(eq(schema.userOrganizations.organizationId, organization.id)),
        'Delete user-organization assignments'
      );
      console.log('    ✓ Deleted user-organization assignments');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('    ⚠ Failed to delete user-organization assignments:', errorMsg);
      // Continue cleanup
    }

    // 8. Delete teams in the E2E organization
    console.log('  🏈 Deleting teams...');
    try {
      const teams = await retryDatabaseOperation(
        async () => await db.delete(schema.teams)
          .where(eq(schema.teams.organizationId, organization.id))
          .returning(),
        'Delete teams'
      );
      console.log(`    ✓ Deleted ${teams.length} teams`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('    ⚠ Failed to delete teams:', errorMsg);
      // Continue cleanup
    }

    // 8b. Per-worker isolation cleanup. Worker users belong to per-worker orgs
    // (E2E Worker Org N), not just the primary org, so clear ALL their org/team
    // memberships by userId first — otherwise the user deletes below hit the
    // user_organizations FK. Then drop the per-worker orgs + teams so they don't
    // accumulate on a long-lived shared test DB.
    if (e2eUsers.length > 0) {
      const allUserIds = e2eUsers.map((u) => u.id);
      try {
        await db.delete(schema.userTeams).where(inArray(schema.userTeams.userId, allUserIds));
        await db.delete(schema.userOrganizations).where(inArray(schema.userOrganizations.userId, allUserIds));
      } catch (error) {
        console.warn('    ⚠ Failed to clear all E2E memberships:', error instanceof Error ? error.message : String(error));
      }
    }
    console.log('  🧩 Deleting per-worker orgs/teams...');
    try {
      const workerOrgs = await db.query.organizations.findMany({
        where: like(schema.organizations.name, 'E2E Worker Org %'),
      });
      if (workerOrgs.length > 0) {
        const workerOrgIds = workerOrgs.map((o) => o.id);
        await db.delete(schema.teams).where(inArray(schema.teams.organizationId, workerOrgIds));
        await db.delete(schema.organizations).where(inArray(schema.organizations.id, workerOrgIds));
        console.log(`    ✓ Deleted ${workerOrgs.length} per-worker orgs (+ teams)`);
      }
    } catch (error) {
      console.warn('    ⚠ Failed to delete per-worker orgs/teams:', error instanceof Error ? error.message : String(error));
    }

    // 9. Delete E2E test users
    if (e2eUsers.length > 0) {
      console.log('  👥 Deleting test users...');
      for (const user of e2eUsers) {
        try {
          await db.delete(schema.users).where(eq(schema.users.id, user.id));
          console.log(`    ✓ Deleted user: ${user.username}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.warn(`    ⚠ Failed to delete user ${user.username}:`, errorMsg);
          // Continue cleanup
        }
      }
    }

    // 10. Delete E2E test organization (this will cascade delete any remaining related records)
    console.log('  🏢 Deleting test organization...');
    try {
      await retryDatabaseOperation(
        async () => await db.delete(schema.organizations).where(eq(schema.organizations.id, organization.id)),
        'Delete test organization'
      );
      console.log(`    ✓ Deleted organization: ${organization.name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('    ⚠ Failed to delete organization:', errorMsg);
      criticalFailures.push(`Organization deletion: ${errorMsg}`);
      // Don't throw - we've cleaned up what we could
    }

    // 11. Delete second E2E test organization (for multi-org testing)
    console.log('  🏢 Deleting second test organization...');
    const secondOrganization = await retryDatabaseOperation(
      async () => await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, E2E_SECOND_ORG_NAME),
      }),
      'Find second test organization'
    );

    if (secondOrganization) {
      try {
        // Delete user-organization assignments for second org
        await retryDatabaseOperation(
          async () => await db.delete(schema.userOrganizations)
            .where(eq(schema.userOrganizations.organizationId, secondOrganization.id)),
          'Delete user-organization assignments for second org'
        );

        // Delete teams in second org
        await retryDatabaseOperation(
          async () => await db.delete(schema.teams)
            .where(eq(schema.teams.organizationId, secondOrganization.id)),
          'Delete teams in second org'
        );

        // Delete second organization
        await retryDatabaseOperation(
          async () => await db.delete(schema.organizations).where(eq(schema.organizations.id, secondOrganization.id)),
          'Delete second organization'
        );
        console.log(`    ✓ Deleted second organization: ${secondOrganization.name}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn('    ⚠ Failed to delete second organization:', errorMsg);
      }
    } else {
      console.log('    ℹ️  Second organization not found');
    }

    // 12. Verify cleanup was successful
    console.log('  🔍 Verifying cleanup...');
    try {
      const verificationResults = await verifyCleanup(db, E2E_ORG_NAME, E2E_SECOND_ORG_NAME);

      if (verificationResults.success) {
        console.log('  ✅ Cleanup verification passed - all E2E test data removed');
      } else {
        console.warn('  ⚠️  Cleanup verification found remaining data:');
        if (verificationResults.remainingOrgs > 0) {
          console.warn(`    - ${verificationResults.remainingOrgs} E2E organizations still exist`);
        }
        if (verificationResults.remainingUsers > 0) {
          console.warn(`    - ${verificationResults.remainingUsers} E2E users still exist`);
        }
        if (verificationResults.remainingTeams > 0) {
          console.warn(`    - ${verificationResults.remainingTeams} E2E teams still exist`);
        }
        if (verificationResults.remainingSessions > 0) {
          console.warn(`    - ${verificationResults.remainingSessions} E2E user sessions still exist`);
        }
        if (verificationResults.remainingMeasurements > 0) {
          console.warn(`    - ${verificationResults.remainingMeasurements} E2E user measurements still exist`);
        }
        console.warn('  Manual cleanup may be required for remaining data');
      }
    } catch (error) {
      console.warn('  ⚠️  Cleanup verification failed:', error instanceof Error ? error.message : error);
      // Don't fail teardown on verification errors
    }

    // Check for critical failures and throw if any occurred
    if (criticalFailures.length > 0) {
      console.error('\n❌ Critical cleanup failures detected:');
      criticalFailures.forEach(failure => console.error(`  - ${failure}`));
      console.error('\n⚠️  Manual cleanup required to prevent test data accumulation');
      console.error('  Database may have orphaned E2E test data');
      // Throw error to alert CI/CD that manual intervention is needed
      throw new Error(`Teardown failed with ${criticalFailures.length} critical failures - manual cleanup required`);
    }

    console.log('  ✅ Database cleanup complete');
  } catch (error) {
    console.error('  ❌ Database cleanup failed:', error);
    console.error('  Test data may remain in database - manual cleanup may be required');
    // Don't throw - teardown failures shouldn't fail the test run
    // UNLESS it's our intentional critical failures error from above
    if (error instanceof Error && error.message.includes('manual cleanup required')) {
      throw error;
    }
  } finally {
    await client.end();
  }
}

/**
 * Verify that all E2E test data was successfully cleaned up
 */
async function verifyCleanup(
  db: ReturnType<typeof drizzle>,
  E2E_ORG_NAME: string,
  E2E_SECOND_ORG_NAME: string
): Promise<{
  success: boolean;
  remainingOrgs: number;
  remainingUsers: number;
  remainingTeams: number;
  remainingSessions: number;
  remainingMeasurements: number;
}> {
  // Check for remaining E2E organizations
  const remainingOrgs = await db.query.organizations.findMany({
    where: or(
      eq(schema.organizations.name, E2E_ORG_NAME),
      eq(schema.organizations.name, E2E_SECOND_ORG_NAME)
    ),
  });

  // Check for remaining E2E users (firstName = 'E2E')
  const remainingUsers = await db.query.users.findMany({
    where: eq(schema.users.firstName, 'E2E'),
  });

  // Check for remaining teams from E2E orgs
  const remainingTeams = remainingOrgs.length > 0
    ? await db.query.teams.findMany({
        where: or(
          ...remainingOrgs.map(org => eq(schema.teams.organizationId, org.id))
        ),
      })
    : [];

  // Check for remaining sessions for E2E users
  const remainingSessions = remainingUsers.length > 0
    ? await db.query.sessions.findMany({
        where: or(
          ...remainingUsers.map(user => eq(schema.sessions.userId, user.id))
        ),
      })
    : [];

  // Check for remaining measurements for E2E users
  const remainingMeasurements = remainingUsers.length > 0
    ? await db.query.measurements.findMany({
        where: or(
          ...remainingUsers.map(user => eq(schema.measurements.userId, user.id))
        ),
      })
    : [];

  return {
    success:
      remainingOrgs.length === 0 &&
      remainingUsers.length === 0 &&
      remainingTeams.length === 0 &&
      remainingSessions.length === 0 &&
      remainingMeasurements.length === 0,
    remainingOrgs: remainingOrgs.length,
    remainingUsers: remainingUsers.length,
    remainingTeams: remainingTeams.length,
    remainingSessions: remainingSessions.length,
    remainingMeasurements: remainingMeasurements.length,
  };
}

export default globalTeardown;
