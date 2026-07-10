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
 * - E2E_DB_CONNECT_TIMEOUT: Database connection timeout in seconds (default: 60)
 */

import { chromium, FullConfig } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as schema from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import type { Role } from '@shared/role-types';
import { retryDatabaseOperation } from './constants';
import { getEnvironmentConfig } from './config';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const E2E_CONFIG_FILE = '.e2e-test-config.json';

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

  // Use centralized environment detection to avoid duplication
  const {
    isTesting,
    ENV_NAME,
    E2E_ORG_NAME,
    E2E_TEAM_NAME,
    TARGET_URL,
    TARGET_USERNAME,
    TARGET_PASSWORD,
    DATABASE_URL,
  } = getEnvironmentConfig();

  console.log(`📍 Target Environment: ${ENV_NAME}`);
  console.log(`🌐 Target URL: ${TARGET_URL}`);

  // Validate URL format
  if (!TARGET_URL.match(/^https?:\/\/.+/)) {
    throw new Error(
      `Invalid ${ENV_NAME}_URL format: "${TARGET_URL}". ` +
      `Must be a valid HTTP or HTTPS URL (e.g., https://staging.example.com)`
    );
  }

  // Production environment safety check - prevent tests from running against production
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'E2E tests cannot run in production environment (NODE_ENV=production). ' +
      'Tests should only run against staging, testing, or local development environments.'
    );
  }

  // Additional URL pattern validation to prevent tests from running against production domains
  if (TARGET_URL.includes('athletemetrics.com') ||
      TARGET_URL.includes('production') ||
      TARGET_URL.match(/prod\./i)) {
    throw new Error(
      'E2E tests cannot run against production URLs. ' +
      `Detected production URL pattern in: ${TARGET_URL}. ` +
      'Tests should only run against staging, testing, or local development environments.'
    );
  }

  // Database URL validation - check for production patterns
  if (DATABASE_URL) {
    const PRODUCTION_DB_PATTERNS = [/prod/i, /production/i, /athletemetrics\.com/i];
    if (PRODUCTION_DB_PATTERNS.some(pattern => pattern.test(DATABASE_URL))) {
      throw new Error(
        'E2E tests cannot run against production database. ' +
        `Detected production pattern in DATABASE_URL. ` +
        'Tests should only run against staging, testing, or local development databases.'
      );
    }
  }

  // Verify credentials are provided
  if (!TARGET_USERNAME || !TARGET_PASSWORD) {
    throw new Error(
      `${ENV_NAME}_USERNAME and ${ENV_NAME}_PASSWORD environment variables are required. ` +
      'Please set these credentials for E2E test authentication.'
    );
  }

  // Type assertions: after validation, we know these are strings
  const username = TARGET_USERNAME as string;
  const password = TARGET_PASSWORD as string;

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
    await page.fill('#username, input[name="username"]', username);
    await page.fill('#password, input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL(url => !url.pathname.includes('/login'), {
      timeout: 10000
    });

    if (page.url().includes('/login')) {
      throw new Error('Login credentials are invalid');
    }

    console.log('✅ Primary login credentials verified');

    // Save authentication state for test reuse (prevents rate limiting)
    const authDir = join(__dirname, '../../playwright/.auth');
    mkdirSync(authDir, { recursive: true });
    const authFile = join(authDir, 'user.json');
    await context.storageState({ path: authFile });
    console.log('💾 Authentication state saved for test reuse');
  } catch (error) {
    console.error(`\n❌ ${ENV_NAME} environment verification failed:`, error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  // Step 2: Database setup - create test organization and users
  if (!DATABASE_URL) {
    console.warn(`\n⚠️  ${ENV_NAME}_DATABASE_URL not set - skipping test data seeding`);
    console.warn(`   Tests will use existing ${ENV_NAME} data`);
    console.log('\n✅ E2E Test Setup Complete (verification only)\n');
    return;
  }

  console.log('\n📦 Setting up test data in database...');

  // Connect to database
  // Strict localhost detection - only matches actual localhost hosts in postgresql:// URLs
  const isLocalhost = DATABASE_URL.match(/^postgresql:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/);

  // Allow environment variable override for connection timeout
  // Default: 60 seconds (sufficient for Railway/Neon cold starts)
  const connectTimeout = parseInt(process.env.E2E_DB_CONNECT_TIMEOUT || '60', 10);

  const client = postgres(DATABASE_URL, {
    max: 1,
    connect_timeout: connectTimeout, // Configurable timeout for cold starts on serverless databases
    idle_timeout: 10, // Close idle connections quickly in setup (short-lived script)
    ssl: isLocalhost ? false : 'require',
  });
  const db = drizzle(client, { schema });

  try {
    // Production-scale data check - verify database is not production
    // Production typically has many organizations, staging/testing should have <50
    console.log('  🔍 Verifying database is not production...');
    const orgCount = await db.query.organizations.findMany();
    if (orgCount.length > 50) {
      console.warn(`⚠️  Database has ${orgCount.length} organizations - this may be production!`);
      throw new Error(
        `Database has ${orgCount.length} organizations - production databases typically have many organizations. ` +
        'Refusing to run E2E tests to prevent data corruption. ' +
        'If this is a legitimate staging/testing database, adjust the threshold in global-setup.ts'
      );
    }
    console.log(`  ✓ Database organization count: ${orgCount.length} (safe threshold: <50)`);

    // Create or find E2E test organization
    console.log('  📦 Creating test organization...');
    let organization = await retryDatabaseOperation(
      async () => await db.query.organizations.findFirst({
        where: eq(schema.organizations.name, E2E_ORG_NAME),
      }),
      'Find test organization'
    );

    if (!organization) {
      const [newOrg] = await retryDatabaseOperation(
        async () => (await db.insert(schema.organizations).values({
          name: E2E_ORG_NAME,
          description: `E2E Test Organization - Created by Playwright global setup (${new Date().toISOString()})`,
          isActive: true,
        }).returning()),
        'Create test organization'
      );
      organization = newOrg;
      console.log(`    ✅ Created organization: ${organization.name}`);
    } else {
      console.log(`    ✅ Organization already exists: ${organization.name}`);
    }

    // Create second organization for multi-org testing
    console.log('  📦 Creating second test organization for multi-org tests...');
    const E2E_SECOND_ORG_NAME = 'E2E Test Organization 2';
    let secondOrganization = await db.query.organizations.findFirst({
      where: eq(schema.organizations.name, E2E_SECOND_ORG_NAME),
    });

    if (!secondOrganization) {
      const [newOrg] = await db.insert(schema.organizations).values({
        name: E2E_SECOND_ORG_NAME,
        description: `E2E Second Test Organization - For multi-org testing (${new Date().toISOString()})`,
        isActive: true,
      }).returning();
      secondOrganization = newOrg;
      console.log(`    ✅ Created second organization: ${secondOrganization.name}`);
    } else {
      console.log(`    ✅ Second organization already exists: ${secondOrganization.name}`);
    }

    // Create test users
    console.log('  👥 Creating test users...');

    const testUsers: TestUserConfig[] = [
      {
        username: username,
        password: password,
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

    // Track processed usernames to handle same-username scenario in CI
    // When all role credentials point to the same user, we need to preserve the highest privilege
    const processedUsernames = new Map<string, { id: string; isSiteAdmin: boolean }>();

    for (const userConfig of testUsers) {
      // Check if this username was already processed
      const existingUser = processedUsernames.get(userConfig.username);

      if (existingUser) {
        // Username already processed - only handle org assignment, don't update user
        console.log(`    ✅ User ready: ${userConfig.username} (${userConfig.role}) [same-user mode]`);
        createdUserIds[userConfig.role] = existingUser.id;

        // If this config wants site admin and current user isn't, upgrade them
        if (userConfig.isSiteAdmin && !existingUser.isSiteAdmin) {
          await db.update(schema.users)
            .set({ isSiteAdmin: true, updatedAt: new Date() })
            .where(eq(schema.users.id, existingUser.id));
          existingUser.isSiteAdmin = true;
          console.log(`      ⬆️  Upgraded to site admin`);
        }
      } else {
        // Hash password
        const hashedPassword = await bcrypt.hash(userConfig.password, BCRYPT_SALT_ROUNDS);

        // Use upsert pattern to handle race conditions when multiple test runners start simultaneously
        // INSERT ... ON CONFLICT ensures atomic operation without check-then-act pattern
        const [user] = await retryDatabaseOperation(
          async () => {
            const result = await db.insert(schema.users)
              .values({
                username: userConfig.username,
                password: hashedPassword,
                firstName: userConfig.firstName,
                lastName: userConfig.lastName,
                fullName: `${userConfig.firstName} ${userConfig.lastName}`,
                emails: userConfig.emails,
                isSiteAdmin: userConfig.isSiteAdmin,
                isActive: true,
              })
              .onConflictDoUpdate({
                target: schema.users.username,
                set: {
                  password: hashedPassword,
                  firstName: userConfig.firstName,
                  lastName: userConfig.lastName,
                  fullName: `${userConfig.firstName} ${userConfig.lastName}`,
                  emails: userConfig.emails,
                  isSiteAdmin: userConfig.isSiteAdmin,
                  isActive: true,
                  updatedAt: new Date(),
                },
              })
              .returning();
            return result;
          },
          `Upsert user ${userConfig.username}`
        );

        console.log(`    ✅ User ready: ${user.username} (${userConfig.role})`);

        // Track this username
        processedUsernames.set(userConfig.username, { id: user.id, isSiteAdmin: userConfig.isSiteAdmin });
        createdUserIds[userConfig.role] = user.id;
      }

      // Get the user ID for org assignments (from either branch)
      const currentUserId = createdUserIds[userConfig.role];

      // Assign non-site-admin users to organization with appropriate roles
      if (!userConfig.isSiteAdmin) {
        const existingAssignment = await db.query.userOrganizations.findFirst({
          where: and(
            eq(schema.userOrganizations.userId, currentUserId),
            eq(schema.userOrganizations.organizationId, organization.id)
          ),
        });

        if (!existingAssignment) {
          await db.insert(schema.userOrganizations).values({
            userId: currentUserId,
            organizationId: organization.id,
            role: userConfig.role,
          });
          console.log(`      ✅ Assigned to organization as ${userConfig.role}`);
        } else {
          console.log(`      ✅ Already assigned to organization`);
        }

        // For multi-org testing: assign coach to second organization as well.
        // Skip when the coach IS the primary auth user (same-user mode — e.g. CI,
        // where every E2E_*_USERNAME maps to one admin). A user in >1 org defeats
        // the client's "auto-select org when the user has exactly one" logic
        // (auth.tsx), which otherwise leaves every org-scoped page stranded on the
        // "Please select an organization" empty state.
        if (userConfig.role === 'coach' && userConfig.username !== username) {
          const existingSecondAssignment = await db.query.userOrganizations.findFirst({
            where: and(
              eq(schema.userOrganizations.userId, currentUserId),
              eq(schema.userOrganizations.organizationId, secondOrganization.id)
            ),
          });

          if (!existingSecondAssignment) {
            await db.insert(schema.userOrganizations).values({
              userId: currentUserId,
              organizationId: secondOrganization.id,
              role: 'coach',
            });
            console.log(`      ✅ Also assigned to second organization for multi-org testing`);
          } else {
            console.log(`      ✅ Already assigned to second organization`);
          }
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

    // Seed dedicated athlete users so athlete-search, roster, and analytics specs
    // have data to work with. In same-user mode (CI) the auth user is the only
    // role-mapped account, so without these there are literally no athletes to
    // list or search. firstName 'E2E' keeps them within global-teardown's cleanup
    // (which reclaims users by firstName='E2E' and this org's memberships).
    console.log('  🏃 Seeding athlete users...');
    const athleteSeeds = [
      { username: 'e2e-athlete-smith', lastName: 'Smith' },
      { username: 'e2e-athlete-johnson', lastName: 'Johnson' },
      { username: 'e2e-athlete-williams', lastName: 'Williams' },
    ];
    const athleteHashed = await bcrypt.hash('AthletePassword123!', BCRYPT_SALT_ROUNDS);
    for (const athleteSeed of athleteSeeds) {
      const fullName = `E2E ${athleteSeed.lastName}`;
      const [athleteUser] = await retryDatabaseOperation(
        async () => await db.insert(schema.users)
          .values({
            username: athleteSeed.username,
            password: athleteHashed,
            firstName: 'E2E',
            lastName: athleteSeed.lastName,
            fullName,
            emails: [`${athleteSeed.username}@test.com`],
            isSiteAdmin: false,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: schema.users.username,
            set: { firstName: 'E2E', lastName: athleteSeed.lastName, fullName, isActive: true, updatedAt: new Date() },
          })
          .returning(),
        `Upsert athlete ${athleteSeed.username}`
      );

      const existingOrgMembership = await db.query.userOrganizations.findFirst({
        where: and(
          eq(schema.userOrganizations.userId, athleteUser.id),
          eq(schema.userOrganizations.organizationId, organization.id)
        ),
      });
      if (!existingOrgMembership) {
        await db.insert(schema.userOrganizations).values({
          userId: athleteUser.id,
          organizationId: organization.id,
          role: 'athlete',
        });
      }

      if (team) {
        const existingTeamMembership = await db.query.userTeams.findFirst({
          where: and(
            eq(schema.userTeams.userId, athleteUser.id),
            eq(schema.userTeams.teamId, team.id)
          ),
        });
        if (!existingTeamMembership) {
          await db.insert(schema.userTeams).values({
            userId: athleteUser.id,
            teamId: team.id,
            season: '2024-Fall',
            isActive: true,
          });
        }
      }
    }
    console.log(`    ✅ Seeded ${athleteSeeds.length} athlete users`);

    // ── Per-worker isolated environments ────────────────────────────────────
    // Each parallel worker gets its OWN user + org + team + seeded athletes so
    // concurrent specs never share a session/user/org — the root cause of the
    // ~50% session-validation 401s and data pollution in CI. The e2e-base.ts
    // fixture logs each worker in as e2e-worker-<parallelIndex>.
    console.log('  🧩 Creating per-worker isolated environments...');
    const WORKER_COUNT = 6; // >= max CI workers; spare envs are harmless
    const workerHashed = await bcrypt.hash('WorkerPass123!', BCRYPT_SALT_ROUNDS);
    for (let w = 0; w < WORKER_COUNT; w++) {
      const orgName = `E2E Worker Org ${w}`;
      let workerOrg = await db.query.organizations.findFirst({ where: eq(schema.organizations.name, orgName) });
      if (!workerOrg) {
        const [created] = await db.insert(schema.organizations).values({ name: orgName }).returning();
        workerOrg = created;
      }
      const wUsername = `e2e-worker-${w}`;
      // org_admin (NOT site admin) so the client auto-selects its single org.
      const [workerUser] = await retryDatabaseOperation(
        async () => await db.insert(schema.users)
          .values({ username: wUsername, password: workerHashed, firstName: 'E2E', lastName: `Worker${w}`, fullName: `E2E Worker${w}`, emails: [`${wUsername}@test.com`], isSiteAdmin: false, isActive: true })
          .onConflictDoUpdate({ target: schema.users.username, set: { password: workerHashed, isSiteAdmin: false, isActive: true, updatedAt: new Date() } })
          .returning(),
        `Upsert worker user ${wUsername}`
      );
      const exWo = await db.query.userOrganizations.findFirst({ where: and(eq(schema.userOrganizations.userId, workerUser.id), eq(schema.userOrganizations.organizationId, workerOrg.id)) });
      if (!exWo) await db.insert(schema.userOrganizations).values({ userId: workerUser.id, organizationId: workerOrg.id, role: 'org_admin' });
      let workerTeam = await db.query.teams.findFirst({ where: and(eq(schema.teams.organizationId, workerOrg.id), eq(schema.teams.name, `Worker ${w} Team`)) });
      if (!workerTeam) {
        const [t] = await db.insert(schema.teams).values({ organizationId: workerOrg.id, name: `Worker ${w} Team`, level: 'HS', season: '2024-Fall', isArchived: false }).returning();
        workerTeam = t;
      }
      for (const ln of ['Smith', 'Johnson', 'Williams']) {
        const aUser = `e2e-w${w}-${ln.toLowerCase()}`;
        const [athlete] = await db.insert(schema.users)
          .values({ username: aUser, password: workerHashed, firstName: 'E2E', lastName: ln, fullName: `E2E ${ln}`, emails: [`${aUser}@test.com`], isSiteAdmin: false, isActive: true })
          .onConflictDoUpdate({ target: schema.users.username, set: { lastName: ln, isActive: true, updatedAt: new Date() } })
          .returning();
        const exAo = await db.query.userOrganizations.findFirst({ where: and(eq(schema.userOrganizations.userId, athlete.id), eq(schema.userOrganizations.organizationId, workerOrg.id)) });
        if (!exAo) await db.insert(schema.userOrganizations).values({ userId: athlete.id, organizationId: workerOrg.id, role: 'athlete' });
        const exAt = await db.query.userTeams.findFirst({ where: and(eq(schema.userTeams.userId, athlete.id), eq(schema.userTeams.teamId, workerTeam.id)) });
        if (!exAt) await db.insert(schema.userTeams).values({ userId: athlete.id, teamId: workerTeam.id, season: '2024-Fall', isActive: true });
      }
    }
    console.log(`    ✅ Created ${WORKER_COUNT} per-worker environments`);

    // Write test configuration to JSON file for tests to read
    // (process.env doesn't persist from global-setup to test workers)
    const testConfig = {
      organizationId: organization.id,
      organizationName: organization.name,
      secondOrganizationId: secondOrganization.id,
      secondOrganizationName: secondOrganization.name,
      teamId: team.id,
      teamName: team.name,
      timestamp: new Date().toISOString()
    };

    const configPath = join(__dirname, E2E_CONFIG_FILE);
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
