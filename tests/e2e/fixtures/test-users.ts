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

// Track which roles have been warned about fallback usage (module-level)
const warnedRoles = new Set<UserRole>();

/**
 * Get test user credentials by role
 *
 * @param role - User role to retrieve
 * @returns TestUser object with credentials
 * @throws Error if no credentials are available (neither role-specific nor fallback)
 *
 * Credential Resolution Order:
 * 1. Role-specific: E2E_{ROLE}_USERNAME / E2E_{ROLE}_PASSWORD
 * 2. Fallback: TESTING_USERNAME / TESTING_PASSWORD or STAGING_USERNAME / STAGING_PASSWORD
 *
 * In CI environments with a single admin account, all roles will share the same credentials.
 * Use canTestRoleAuthorization() to check if RBAC differentiation tests are possible.
 */
export function getUserByRole(role: UserRole): TestUser {
  // Try role-specific credentials first
  const roleSpecificUsername = process.env[`E2E_${role.toUpperCase()}_USERNAME`];
  const roleSpecificPassword = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];

  if (roleSpecificUsername && roleSpecificPassword) {
    return {
      username: roleSpecificUsername,
      password: roleSpecificPassword,
      role,
    };
  }

  // Fall back to default credentials (TESTING or STAGING)
  const fallbackUsername = process.env.TESTING_USERNAME || process.env.STAGING_USERNAME;
  const fallbackPassword = process.env.TESTING_PASSWORD || process.env.STAGING_PASSWORD;

  if (fallbackUsername && fallbackPassword) {
    // Log once per role to help debug credential resolution
    if (!warnedRoles.has(role)) {
      console.log(`⚠️  Using fallback credentials for role "${role}" (role-specific not configured)`);
      warnedRoles.add(role);
    }

    return {
      username: fallbackUsername,
      password: fallbackPassword,
      role,
    };
  }

  // No credentials available at all
  throw new Error(
    `Missing credentials for role "${role}". ` +
    `Please set either E2E_${role.toUpperCase()}_USERNAME/PASSWORD ` +
    `or TESTING_USERNAME/PASSWORD (or STAGING_USERNAME/PASSWORD) environment variables.`
  );
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

/**
 * Check if roles can be properly differentiated for RBAC testing
 *
 * In CI environments, all role credentials may point to the same user,
 * which makes RBAC authorization testing impossible (all roles are site admin).
 *
 * @param roles - Roles to check for differentiation
 * @returns boolean - True if roles have different usernames (RBAC testable)
 */
export function canTestRoleAuthorization(...roles: UserRole[]): boolean {
  try {
    const usernames = new Set<string>();
    for (const role of roles) {
      const user = getUserByRole(role);
      usernames.add(user.username);
    }
    // If all roles have different usernames, we can test RBAC
    return usernames.size === roles.length;
  } catch {
    // If any role is missing credentials, RBAC testing isn't possible
    return false;
  }
}

/**
 * Check if same-user mode is active (all roles share same credentials)
 * This is common in CI environments where only one admin account exists.
 *
 * @returns boolean - True if all configured roles share the same username
 */
export function isSameUserMode(): boolean {
  const configuredRoles = getAllTestUsers();
  if (configuredRoles.length <= 1) return false;

  const usernames = new Set(configuredRoles.map(u => u.username));
  return usernames.size === 1;
}
