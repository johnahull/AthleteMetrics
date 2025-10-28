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

// Organization names are environment-specific (defined in globalTeardown function)
// to prevent conflicts between staging and testing environments

// Test data patterns for identifying test athletes
const TEST_NAME_PATTERNS = {
  timestamp: /^Test\w*\d{10,}/,
  testPrefix: /^Test/,
  testEmail: /test\d+@/,
  testDomains: ['@test.com', '@example.com']
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

  // Auto-detect environment based on which environment variables are set
  // Priority: TESTING_* > STAGING_*
  const isTesting = !!process.env.TESTING_URL || !!process.env.TESTING_USERNAME;
  const ENV_NAME = isTesting ? 'TESTING' : 'STAGING';

  // Environment-specific test data names to match global-setup.ts
  const E2E_ORG_NAME = `E2E Test Organization (${ENV_NAME})`;
  const E2E_SECOND_ORG_NAME = `E2E Test Organization 2 (${ENV_NAME})`;

  console.log(`📍 Cleaning up ${ENV_NAME} environment`);

  // Clean up via API first (test athletes created during tests)
  await cleanupViaAPI(isTesting, ENV_NAME);

  // Then clean up database resources created in setup
  const DATABASE_URL = isTesting
    ? process.env.TESTING_DATABASE_URL
    : process.env.DATABASE_URL;

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
async function cleanupViaAPI(isTesting: boolean, ENV_NAME: string) {
  console.log('🗑️  Cleaning up test athletes via API...');

  const TARGET_URL = isTesting
    ? (process.env.TESTING_URL || 'https://athletemetrics-testing-testing.up.railway.app')
    : (process.env.STAGING_URL || 'http://localhost:5000');

  const TARGET_USERNAME = isTesting
    ? process.env.TESTING_USERNAME
    : process.env.STAGING_USERNAME;

  const TARGET_PASSWORD = isTesting
    ? process.env.TESTING_PASSWORD
    : process.env.STAGING_PASSWORD;

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
    await page.waitForLoadState('networkidle');

    // Wait for login form to be visible (React SPA needs time to mount)
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

    // Use ID selectors (testing env) with name fallback (staging env)
    await page.fill('#username, input[name="username"]', TARGET_USERNAME);
    await page.fill('#password, input[name="password"]', TARGET_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Fetch all athletes
    const response = await page.request.get(`${TARGET_URL}/api/athletes`);

    if (!response.ok()) {
      console.warn('  ⚠️  Failed to fetch athletes - skipping API cleanup');
      return;
    }

    const athletes: AthleteResponse[] = await response.json();

    // Filter test athletes (those created with "Test" prefix or test emails)
    const testAthletes = athletes.filter((athlete: AthleteResponse) => {
      const firstNameMatch = TEST_NAME_PATTERNS.testPrefix.test(athlete.firstName || '') ||
                            TEST_NAME_PATTERNS.timestamp.test(athlete.firstName || '');
      const lastNameMatch = TEST_NAME_PATTERNS.testPrefix.test(athlete.lastName || '') ||
                           TEST_NAME_PATTERNS.timestamp.test(athlete.lastName || '');
      const emailMatch = athlete.emails?.some((email: string) =>
        TEST_NAME_PATTERNS.testDomains.some(domain => email.includes(domain)) ||
        TEST_NAME_PATTERNS.testEmail.test(email)
      );

      return firstNameMatch || lastNameMatch || emailMatch;
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
    const organization = await db.query.organizations.findFirst({
      where: eq(schema.organizations.name, E2E_ORG_NAME),
    });

    if (!organization) {
      console.log('  ℹ️  E2E test organization not found - nothing to clean up');
      return;
    }

    console.log(`  Found organization: ${organization.name} (${organization.id})`);

    // 2. Find all E2E test users (by firstName 'E2E' which matches all setup users)
    console.log('  👥 Finding E2E test users...');
    const e2eUsers = await db.query.users.findMany({
      where: eq(schema.users.firstName, 'E2E'),
    });

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
      await db.delete(schema.userOrganizations)
        .where(eq(schema.userOrganizations.organizationId, organization.id));
      console.log('    ✓ Deleted user-organization assignments');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('    ⚠ Failed to delete user-organization assignments:', errorMsg);
      // Continue cleanup
    }

    // 8. Delete teams in the E2E organization
    console.log('  🏈 Deleting teams...');
    try {
      const teams = await db.delete(schema.teams)
        .where(eq(schema.teams.organizationId, organization.id))
        .returning();
      console.log(`    ✓ Deleted ${teams.length} teams`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('    ⚠ Failed to delete teams:', errorMsg);
      // Continue cleanup
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
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organization.id));
      console.log(`    ✓ Deleted organization: ${organization.name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('    ⚠ Failed to delete organization:', errorMsg);
      // Don't throw - we've cleaned up what we could
    }

    // 11. Delete second E2E test organization (for multi-org testing)
    console.log('  🏢 Deleting second test organization...');
    const secondOrganization = await db.query.organizations.findFirst({
      where: eq(schema.organizations.name, E2E_SECOND_ORG_NAME),
    });

    if (secondOrganization) {
      try {
        // Delete user-organization assignments for second org
        await db.delete(schema.userOrganizations)
          .where(eq(schema.userOrganizations.organizationId, secondOrganization.id));

        // Delete teams in second org
        await db.delete(schema.teams)
          .where(eq(schema.teams.organizationId, secondOrganization.id));

        // Delete second organization
        await db.delete(schema.organizations).where(eq(schema.organizations.id, secondOrganization.id));
        console.log(`    ✓ Deleted second organization: ${secondOrganization.name}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn('    ⚠ Failed to delete second organization:', errorMsg);
      }
    } else {
      console.log('    ℹ️  Second organization not found');
    }

    console.log('  ✅ Database cleanup complete');
  } catch (error) {
    console.error('  ❌ Database cleanup failed:', error);
    console.error('  Test data may remain in database - manual cleanup may be required');
    // Don't throw - teardown failures shouldn't fail the test run
  } finally {
    await client.end();
  }
}

export default globalTeardown;
