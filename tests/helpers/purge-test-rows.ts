/**
 * Remove the users, teams and organizations an integration test created, together with the rows that
 * block their deletion (issue #539).
 *
 * Deleting a user, team or organization is blocked by foreign keys without ON DELETE CASCADE:
 *   user_teams -> users / teams, user_organizations -> users / organizations,
 *   athlete_profiles -> users, invitations -> organizations, teams -> organizations.
 * measurements has no foreign keys at all, so deleting users or organizations leaves their measurements behind;
 * they are removed here. Everything else (tokens, links, ...) cascades or is set to null. Several afterAll blocks
 * swallowed the resulting error, so the rows stayed behind and polluted later files; this helper removes the
 * blockers first and lets a real failure surface.
 *
 * Select rows by the unique prefix the test put in their names, by explicit ids, or both. Integration files
 * run one at a time against a throwaway database, so a prefix is safe; the pattern guard below stops a
 * pattern that would match every row.
 */
import { inArray, like, or } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { athleteProfiles, invitations, measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';

export interface PurgeOptions {
  /** SQL LIKE patterns for users.username, e.g. `paemail_test_%` */
  usernameLike?: string[];
  /** SQL LIKE patterns for organizations.name, e.g. `InvCoppaTestOrg-%` */
  orgNameLike?: string[];
  /** Explicit ids. Undefined/null entries are skipped, so `[user?.id]` is safe when beforeAll failed early. */
  userIds?: Array<string | null | undefined>;
  orgIds?: Array<string | null | undefined>;
  /** Teams to remove besides every team of the selected organizations, e.g. a team in an org the test keeps */
  teamIds?: Array<string | null | undefined>;
}

const definedIds = (ids: PurgeOptions['userIds']): string[] => (ids ?? []).filter((id): id is string => !!id);

/** A pattern must keep some literal text, or `%` would delete every user or organization. */
function assertSafePattern(pattern: string): void {
  if (pattern.replace(/[%_]/g, '').trim().length < 3) {
    throw new Error(`purgeTestRows: refusing pattern "${pattern}"; it needs at least 3 literal characters (it would match too many rows)`);
  }
}

export async function purgeTestRows(options: PurgeOptions = {}): Promise<void> {
  const patterns = [...(options.usernameLike ?? []), ...(options.orgNameLike ?? [])];
  patterns.forEach(assertSafePattern);

  const userIds = new Set(definedIds(options.userIds));
  const orgIds = new Set(definedIds(options.orgIds));

  for (const pattern of options.usernameLike ?? []) {
    for (const row of await db.select({ id: users.id }).from(users).where(like(users.username, pattern))) userIds.add(row.id);
  }
  for (const pattern of options.orgNameLike ?? []) {
    for (const row of await db.select({ id: organizations.id }).from(organizations).where(like(organizations.name, pattern))) orgIds.add(row.id);
  }
  const teamIdSet = new Set(definedIds(options.teamIds));
  if (userIds.size === 0 && orgIds.size === 0 && teamIdSet.size === 0) return;

  const userList = [...userIds];
  const orgList = [...orgIds];
  if (orgList.length) {
    for (const row of await db.select({ id: teams.id }).from(teams).where(inArray(teams.organizationId, orgList))) teamIdSet.add(row.id);
  }
  const teamList = [...teamIdSet];

  // measurements have no FK to users/organizations/teams, so nothing cascades to them
  const measurementOwners = [
    ...(userList.length ? [inArray(measurements.userId, userList), inArray(measurements.submittedBy, userList)] : []),
    ...(orgList.length ? [inArray(measurements.organizationId, orgList)] : []),
    ...(teamList.length ? [inArray(measurements.teamId, teamList)] : []),
  ];
  if (measurementOwners.length) await db.delete(measurements).where(or(...measurementOwners));

  // Rows that block the deletes below, children first
  if (orgList.length) {
    await db.delete(invitations).where(inArray(invitations.organizationId, orgList));
    await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, orgList));
  }
  if (teamList.length) await db.delete(userTeams).where(inArray(userTeams.teamId, teamList));
  if (userList.length) {
    await db.delete(userTeams).where(inArray(userTeams.userId, userList));
    await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userList));
    await db.delete(athleteProfiles).where(inArray(athleteProfiles.userId, userList));
  }

  if (teamList.length) await db.delete(teams).where(inArray(teams.id, teamList));
  if (userList.length) await db.delete(users).where(inArray(users.id, userList));
  if (orgList.length) await db.delete(organizations).where(inArray(organizations.id, orgList));
}
