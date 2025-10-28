/**
 * Global Setup for E2E Tests
 *
 * This script runs once before all E2E tests to:
 * 1. Verify staging environment is accessible
 * 2. Create a test organization in the database
 * 3. Create test users with different roles
 * 4. Assign users to the organization
 * 5. Create test teams
 *
 * The setup is idempotent - it checks if resources exist before creating them.
 *
 * Environment Variables Required:
 *
 * For Staging Environment:
 * - STAGING_URL: Staging environment URL (default: http://localhost:5000)
 * - STAGING_USERNAME: Org admin username (primary test account)
 * - STAGING_PASSWORD: Org admin password
 * - DATABASE_URL: PostgreSQL connection string (optional, for test data setup)
 *
 * For Testing Environment:
 * - TESTING_URL: Testing environment URL (default: https://athletemetrics-testing-testing.up.railway.app)
 * - TESTING_USERNAME: Org admin username (primary test account)
 * - TESTING_PASSWORD: Org admin password
 * - TESTING_DATABASE_URL: PostgreSQL connection string (optional, for test data setup)
 *
 * Optional (for both environments):
 * - E2E_SITE_ADMIN_USERNAME: Site admin username (for RBAC tests)
 * - E2E_SITE_ADMIN_PASSWORD: Site admin password (for RBAC tests)
 * - E2E_ORG_ADMIN_USERNAME: Second org admin username (for RBAC tests)
 * - E2E_ORG_ADMIN_PASSWORD: Second org admin password (for RBAC tests)
 * - E2E_COACH_USERNAME: Coach username (optional)
 * - E2E_COACH_PASSWORD: Coach password (optional)
 * - E2E_ATHLETE_USERNAME: Athlete username (optional)
 * - E2E_ATHLETE_PASSWORD: Athlete password (optional)
 */

import { chromium, FullConfig } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as schema from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import type { Role } from '@shared/role-types';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const E2E_ORG_NAME = 'E2E Test Organization';
const E2E_TEAM_NAME = 'E2E Test Team';

interface TestUserConfig {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  isSiteAdmin: boolean;
  emails: string[];
}

async function globalSetup(config: FullConfig) {
  console.log('\n🚀 Starting E2E Test Setup...\n');

  // Auto-detect environment based on which environment variables are set
  // Priority: TESTING_* > STAGING_*
  const isTesting = !!process.env.TESTING_URL || !!process.env.TESTING_USERNAME;
  const ENV_NAME = isTesting ? 'TESTING' : 'STAGING';

  const TARGET_URL = isTesting
    ? (process.env.TESTING_URL || 'https://athletemetrics-testing-testing.up.railway.app')
    : (process.env.STAGING_URL || 'http://localhost:5000');

  const TARGET_USERNAME = isTesting
    ? (process.env.TESTING_USERNAME || '')
    : (process.env.STAGING_USERNAME || '');

  const TARGET_PASSWORD = isTesting
    ? (process.env.TESTING_PASSWORD || '')
    : (process.env.STAGING_PASSWORD || '');

  console.log(`📍 Target Environment: ${ENV_NAME}`);
  console.log(`🌐 Target URL: ${TARGET_URL}`);

  // Validate URL format
  if (!TARGET_URL.match(/^https?:\/\/.+/)) {
    throw new Error(
      `Invalid ${ENV_NAME}_URL format: "${TARGET_URL}". ` +
      `Must be a valid HTTP or HTTPS URL (e.g., https://staging.example.com)`
    );
  }

  // Verify credentials are provided
  if (!TARGET_USERNAME || !TARGET_PASSWORD) {
    throw new Error(
      `${ENV_NAME}_USERNAME and ${ENV_NAME}_PASSWORD environment variables are required. ` +
      'Please set these credentials for E2E test authentication.'
    );
  }

  // Step 1: Verify environment is accessible
  console.log(`🔍 Verifying ${ENV_NAME} environment: ${TARGET_URL}`);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const response = await page.goto(TARGET_URL);

    if (!response || response.status() >= 400) {
      throw new Error(`${ENV_NAME} environment not accessible: ${response?.status()}`);
    }

    console.log(`✅ ${ENV_NAME} environment is accessible`);

    // Verify login credentials work
    console.log('🔐 Verifying primary login credentials...');
    await page.goto(`${TARGET_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Wait for login form to be visible (React SPA needs time to mount)
    // Use ID selectors as fallback for environments without name attributes
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

    // Use ID selectors (testing env) with name fallback (staging env)
    await page.fill('#username, input[name="username"]', TARGET_USERNAME);
    await page.fill('#password, input[name="password"]', TARGET_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.pathname.includes('/login'), {
      timeout: 10000
    });

    if (page.url().includes('/login')) {
      throw new Error('Login credentials are invalid');
    }

    console.log('✅ Primary login credentials verified');
  } catch (error) {
    console.error(`\n❌ ${ENV_NAME} environment verification failed:`, error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  // Step 2: Database setup - create test organization and users
  const DATABASE_URL = isTesting
    ? process.env.TESTING_DATABASE_URL
    : process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.warn(`\n⚠️  ${ENV_NAME}_DATABASE_URL not set - skipping test data seeding`);
    console.warn(`   Tests will use existing ${ENV_NAME} data`);
    console.log('\n✅ E2E Test Setup Complete (verification only)\n');
    return;
  }

  console.log('\n📦 Setting up test data in database...');

  // Connect to database
  // More robust local environment detection (handles localhost, 127.0.0.1, and ::1)
  const isLocalhost = DATABASE_URL.match(/\b(localhost|127\.0\.0\.1|::1)\b/);
  const client = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: 30, // 30 second timeout to prevent hanging on network issues
    idle_timeout: 10, // Close idle connections quickly in setup (short-lived script)
    ssl: isLocalhost ? false : 'require',
  });
  const db = drizzle(client, { schema });

  try {
    // Create or find E2E test organization
    console.log('  📦 Creating test organization...');
    let organization = await db.query.organizations.findFirst({
      where: eq(schema.organizations.name, E2E_ORG_NAME),
    });

    if (!organization) {
      const [newOrg] = await db.insert(schema.organizations).values({
        name: E2E_ORG_NAME,
        description: `E2E Test Organization - Created by Playwright global setup (${new Date().toISOString()})`,
        isActive: true,
      }).returning();
      organization = newOrg;
      console.log(`    ✅ Created organization: ${organization.name}`);
    } else {
      console.log(`    ✅ Organization already exists: ${organization.name}`);
    }

    // Create test users
    console.log('  👥 Creating test users...');

    const testUsers: TestUserConfig[] = [
      {
        username: TARGET_USERNAME,
        password: TARGET_PASSWORD,
        firstName: 'E2E',
        lastName: 'OrgAdmin',
        role: 'org_admin',
        isSiteAdmin: false,
        emails: ['e2e-primary@test.com'],
      },
    ];

    // Add optional RBAC test users if credentials are provided
    if (process.env.E2E_SITE_ADMIN_USERNAME && process.env.E2E_SITE_ADMIN_PASSWORD) {
      testUsers.push({
        username: process.env.E2E_SITE_ADMIN_USERNAME,
        password: process.env.E2E_SITE_ADMIN_PASSWORD,
        firstName: 'E2E',
        lastName: 'SiteAdmin',
        role: 'site_admin',
        isSiteAdmin: true,
        emails: ['e2e-site-admin@test.com'],
      });
    }

    if (process.env.E2E_ORG_ADMIN_USERNAME && process.env.E2E_ORG_ADMIN_PASSWORD) {
      testUsers.push({
        username: process.env.E2E_ORG_ADMIN_USERNAME,
        password: process.env.E2E_ORG_ADMIN_PASSWORD,
        firstName: 'E2E',
        lastName: 'OrgAdmin2',
        role: 'org_admin',
        isSiteAdmin: false,
        emails: ['e2e-org-admin-2@test.com'],
      });
    }

    if (process.env.E2E_COACH_USERNAME && process.env.E2E_COACH_PASSWORD) {
      testUsers.push({
        username: process.env.E2E_COACH_USERNAME,
        password: process.env.E2E_COACH_PASSWORD,
        firstName: 'E2E',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: false,
        emails: ['e2e-coach@test.com'],
      });
    }

    if (process.env.E2E_ATHLETE_USERNAME && process.env.E2E_ATHLETE_PASSWORD) {
      testUsers.push({
        username: process.env.E2E_ATHLETE_USERNAME,
        password: process.env.E2E_ATHLETE_PASSWORD,
        firstName: 'E2E',
        lastName: 'Athlete',
        role: 'athlete',
        isSiteAdmin: false,
        emails: ['e2e-athlete@test.com'],
      });
    }

    const createdUserIds: Record<string, string> = {};

    for (const userConfig of testUsers) {
      // Check if user already exists
      let user = await db.query.users.findFirst({
        where: eq(schema.users.username, userConfig.username),
      });

      if (!user) {
        // Hash password
        const hashedPassword = await bcrypt.hash(userConfig.password, BCRYPT_SALT_ROUNDS);

        // Create user
        const [newUser] = await db.insert(schema.users).values({
          username: userConfig.username,
          password: hashedPassword,
          firstName: userConfig.firstName,
          lastName: userConfig.lastName,
          fullName: `${userConfig.firstName} ${userConfig.lastName}`,
          emails: userConfig.emails,
          isSiteAdmin: userConfig.isSiteAdmin,
          isActive: true,
        }).returning();
        user = newUser;
        console.log(`    ✅ Created user: ${user.username} (${userConfig.role})`);
      } else {
        console.log(`    ✅ User already exists: ${user.username} (${userConfig.role})`);
      }

      createdUserIds[userConfig.role] = user.id;

      // Assign non-site-admin users to organization with appropriate roles
      if (!userConfig.isSiteAdmin) {
        const existingAssignment = await db.query.userOrganizations.findFirst({
          where: and(
            eq(schema.userOrganizations.userId, user.id),
            eq(schema.userOrganizations.organizationId, organization.id)
          ),
        });

        if (!existingAssignment) {
          await db.insert(schema.userOrganizations).values({
            userId: user.id,
            organizationId: organization.id,
            role: userConfig.role,
          });
          console.log(`      ✅ Assigned to organization as ${userConfig.role}`);
        } else {
          console.log(`      ✅ Already assigned to organization`);
        }
      }
    }

    // Create test team
    console.log('  🏈 Creating test team...');
    let team = await db.query.teams.findFirst({
      where: and(
        eq(schema.teams.organizationId, organization.id),
        eq(schema.teams.name, E2E_TEAM_NAME)
      ),
    });

    if (!team) {
      const [newTeam] = await db.insert(schema.teams).values({
        organizationId: organization.id,
        name: E2E_TEAM_NAME,
        level: 'HS',
        season: '2024-Fall',
        isArchived: false,
      }).returning();
      team = newTeam;
      console.log(`    ✅ Created team: ${team.name}`);
    } else {
      console.log(`    ✅ Team already exists: ${team.name}`);
    }

    // Assign coach and athlete to team (if they exist)
    if (createdUserIds.coach && createdUserIds.athlete) {
      console.log('  👥 Assigning users to team...');
      const usersToAssignToTeam = [
        { userId: createdUserIds.coach, role: 'coach' },
        { userId: createdUserIds.athlete, role: 'athlete' },
      ];

      for (const { userId, role } of usersToAssignToTeam) {
        const existingTeamMembership = await db.query.userTeams.findFirst({
          where: and(
            eq(schema.userTeams.userId, userId),
            eq(schema.userTeams.teamId, team.id)
          ),
        });

        if (!existingTeamMembership) {
          await db.insert(schema.userTeams).values({
            userId,
            teamId: team.id,
            season: '2024-Fall',
            isActive: true,
          });
          console.log(`    ✅ Assigned ${role} to team`);
        } else {
          console.log(`    ✅ ${role} already assigned to team`);
        }
      }
    }

    // Write test configuration to JSON file for tests to read
    // (process.env doesn't persist from global-setup to test workers)
    const testConfig = {
      organizationId: organization.id,
      organizationName: organization.name,
      teamId: team.id,
      teamName: team.name,
      timestamp: new Date().toISOString()
    };

    const configPath = join(__dirname, '.e2e-test-config.json');
    writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
    console.log(`\n✅ Test configuration written to ${configPath}`);

    console.log('\n✅ Test data setup complete');
    console.log(`   Organization: ${organization.name} (${organization.id})`);
    console.log(`   Team: ${team.name} (${team.id})`);
    console.log(`   Users created: ${testUsers.length}`);

    console.log('\n✅ E2E Test Setup Complete\n');
  } catch (error) {
    console.error('\n❌ Database setup failed:', error);
    throw error;
  } finally {
    // Close database connection
    await client.end();
  }
}

export default globalSetup;
