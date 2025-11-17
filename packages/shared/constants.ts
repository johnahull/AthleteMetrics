/**
 * Shared constants used across the application
 */

/**
 * Bcrypt salt rounds for password hashing
 * Using 10 rounds provides a good balance between security and performance
 * (OWASP recommended minimum is 10 rounds as of 2024)
 */
export const BCRYPT_SALT_ROUNDS = 10;

/**
 * Database constraint names for team name uniqueness per organization
 * - 'uniqueTeamPerOrg': Drizzle ORM generated constraint name
 * - 'teams_organization_id_name_unique': Direct PostgreSQL constraint name
 * - 'teams_organization_id_name_key': PostgreSQL auto-generated constraint name
 */
export const TEAM_NAME_CONSTRAINTS = new Set([
  'uniqueTeamPerOrg',
  'teams_organization_id_name_unique',
  'teams_organization_id_name_key'
] as const);

/**
 * Date-related constants
 */
export const DATE_CONSTANTS = {
  /**
   * Minimum allowed measurement date (Unix epoch)
   * Represents "no practical minimum" for measurement dates in the system
   */
  MIN_MEASUREMENT_DATE: '1970-01-01',

  /**
   * Regular expression for validating YYYY-MM-DD date format
   */
  DATE_ONLY_REGEX: /^\d{4}-\d{2}-\d{2}$/,

  /**
   * Time portion constants for datetime conversions
   */
  START_OF_DAY: 'T00:00:00.000Z',
  END_OF_DAY: 'T23:59:59.999Z',
} as const;

/**
 * Responsive design breakpoints
 *
 * These breakpoints define the three responsive modes:
 * - Mobile: < 768px (bottom nav + drawer sidebar, single-column grids)
 * - Tablet: 768-1023px (full sidebar, no bottom nav, two-column grids)
 * - Desktop: >= 1024px (full sidebar, no bottom nav, three-column grids)
 *
 * Note: These values align with Tailwind CSS's default breakpoints:
 * - md: 768px
 * - lg: 1024px
 */
export const RESPONSIVE_BREAKPOINTS = {
  /**
   * Breakpoint between mobile and tablet modes (768px)
   */
  MOBILE_BREAKPOINT: 768,

  /**
   * Breakpoint between tablet and desktop modes (1024px)
   */
  TABLET_BREAKPOINT: 1024,
} as const;
