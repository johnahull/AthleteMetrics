/**
 * Shared username validation logic for both client and server
 */

// Reserved usernames that cannot be used
const RESERVED_USERNAMES = [
  // System/Admin
  'admin',
  'administrator',
  'root',
  'system',
  'superuser',
  'sysadmin',
  'support',
  'help',
  'info',
  'contact',
  'webmaster',
  'postmaster',
  'hostmaster',
  'noreply',
  'no-reply',
  // Authentication
  'oauth',
  'auth',
  'login',
  'logout',
  'signup',
  'signin',
  'register',
  'password',
  'forgot',
  'reset',
  // API/Technical
  'api',
  'api-docs',
  'swagger',
  'graphql',
  'docs',
  'documentation',
  'www',
  'mail',
  'ftp',
  'localhost',
  // Application Routes
  'team',
  'teams',
  'athlete',
  'athletes',
  'coach',
  'coaches',
  'organization',
  'organizations',
  'user',
  'users',
  'profile',
  'dashboard',
  'settings',
  // Programming Keywords
  'undefined',
  'null',
  'true',
  'false',
  'void',
  'delete'
];

// Username must:
// - Start with a letter (a-z, A-Z)
// - Contain only letters, numbers, underscores, hyphens
// - Not start or end with underscore or hyphen
// - Not contain consecutive special characters
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9]*([_-][a-zA-Z0-9]+)*$/;

export interface UsernameValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateUsername(username: string): UsernameValidationResult {
  const errors: string[] = [];

  if (!username || typeof username !== 'string') {
    errors.push('Username is required');
    return { valid: false, errors };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (trimmed.length > 50) {
    errors.push('Username must be at most 50 characters long');
  }

  if (!USERNAME_REGEX.test(trimmed)) {
    errors.push('Username must start with a letter and contain only letters, numbers, underscores, and hyphens');
  }

  if (RESERVED_USERNAMES.includes(trimmed.toLowerCase())) {
    errors.push('This username is reserved and cannot be used');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function getUsernameRequirementsText(): string {
  return 'Username must start with a letter, be 3-50 characters long, and contain only letters, numbers, underscores, and hyphens';
}

export { RESERVED_USERNAMES, USERNAME_REGEX };
