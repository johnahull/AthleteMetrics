/**
 * Test User Fixtures for E2E Tests
 *
 * Defines test users with different roles for RBAC testing.
 * These users should be created in the staging environment before running tests.
 */

export type UserRole = 'site_admin' | 'org_admin' | 'coach' | 'athlete';

export interface TestUser {
  username: string;
  password: string;
  role: UserRole;
}

/**
 * Get test user credentials by role
 *
 * @param role - User role to retrieve
 * @returns TestUser object with credentials
 * @throws Error if required environment variables are not set
 */
export function getUserByRole(role: UserRole): TestUser {
  // Get role-specific credentials - NO FALLBACKS to prevent security holes in RBAC tests
  // Each role must have its own credentials to properly test authorization
  const users: Record<UserRole, TestUser> = {
    site_admin: {
      username: process.env.E2E_SITE_ADMIN_USERNAME || '',
      password: process.env.E2E_SITE_ADMIN_PASSWORD || '',
      role: 'site_admin',
    },
    org_admin: {
      username: process.env.E2E_ORG_ADMIN_USERNAME || '',
      password: process.env.E2E_ORG_ADMIN_PASSWORD || '',
      role: 'org_admin',
    },
    coach: {
      username: process.env.E2E_COACH_USERNAME || '',
      password: process.env.E2E_COACH_PASSWORD || '',
      role: 'coach',
    },
    athlete: {
      username: process.env.E2E_ATHLETE_USERNAME || '',
      password: process.env.E2E_ATHLETE_PASSWORD || '',
      role: 'athlete',
    },
  };

  const user = users[role];

  if (!user.username || !user.password) {
    throw new Error(
      `Missing credentials for role "${role}". ` +
      `Please set E2E_${role.toUpperCase()}_USERNAME and E2E_${role.toUpperCase()}_PASSWORD ` +
      `environment variables.`
    );
  }

  return user;
}

/**
 * Get all test users
 *
 * @returns Array of all test users that have valid credentials
 */
export function getAllTestUsers(): TestUser[] {
  const roles: UserRole[] = ['site_admin', 'org_admin', 'coach', 'athlete'];
  const users: TestUser[] = [];

  for (const role of roles) {
    try {
      users.push(getUserByRole(role));
    } catch {
      // Skip users without valid credentials
    }
  }

  return users;
}

/**
 * Check if test user credentials are configured for a role
 *
 * @param role - User role to check
 * @returns boolean - True if credentials are configured
 */
export function hasUserCredentials(role: UserRole): boolean {
  try {
    getUserByRole(role);
    return true;
  } catch {
    return false;
  }
}
