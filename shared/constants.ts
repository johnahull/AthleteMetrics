/**
 * Shared constants used across the application
 */

/**
 * Database constraint names for team name uniqueness per organization
 * - 'uniqueTeamPerOrg': Drizzle ORM generated constraint name
 * - 'teams_organization_id_name_unique': Direct PostgreSQL constraint name
 */
export const TEAM_NAME_CONSTRAINTS = new Set([
  'uniqueTeamPerOrg',
  'teams_organization_id_name_unique'
] as const);
