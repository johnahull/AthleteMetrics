/**
 * Organization scoping for wellness templates and targets.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { teams, userOrganizations, userTeams } from "@shared/schema";

/** A template is usable by an organization when it is the organization's own or a system template (no organization). */
export function isTemplateUsableBy(template: { organizationId: string | null }, organizationId: string): boolean {
  return template.organizationId === null || template.organizationId === organizationId;
}

/** The given user ids that are members of the organization. */
export async function getOrganizationMemberIds(organizationId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ userId: userOrganizations.userId })
    .from(userOrganizations)
    .where(and(eq(userOrganizations.organizationId, organizationId), inArray(userOrganizations.userId, userIds)));
  return new Set(rows.map(r => r.userId));
}

/** The given athletes and teams, without duplicates, keeping only members and teams of the organization. */
export async function filterTargetsToOrganization(
  organizationId: string,
  athleteIds: string[] = [],
  teamIds: string[] = []
): Promise<{ athleteIds: string[]; teamIds: string[] }> {
  const uniqueAthleteIds = [...new Set(athleteIds)];
  const uniqueTeamIds = [...new Set(teamIds)];
  const members = await getOrganizationMemberIds(organizationId, uniqueAthleteIds);
  const ownTeams = uniqueTeamIds.length === 0 ? [] : await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.organizationId, organizationId), inArray(teams.id, uniqueTeamIds)));
  const ownTeamIds = new Set(ownTeams.map(t => t.id));
  return {
    athleteIds: uniqueAthleteIds.filter(id => members.has(id)),
    teamIds: uniqueTeamIds.filter(id => ownTeamIds.has(id)),
  };
}

/** True when every athlete is a member of the organization and every team belongs to it. */
export async function targetsBelongToOrganization(
  organizationId: string,
  athleteIds: string[] = [],
  teamIds: string[] = []
): Promise<boolean> {
  const own = await filterTargetsToOrganization(organizationId, athleteIds, teamIds);
  return own.athleteIds.length === new Set(athleteIds).size && own.teamIds.length === new Set(teamIds).size;
}

/**
 * The athletes a request reaches: direct targets and active members of targeted teams, limited to members of the
 * request's organization and to teams of that organization.
 */
export async function getRequestTargetAthleteIds(request: {
  organizationId: string;
  targetAthleteIds?: string[] | null;
  targetTeamIds?: string[] | null;
}): Promise<string[]> {
  const own = await filterTargetsToOrganization(
    request.organizationId,
    request.targetAthleteIds ?? [],
    request.targetTeamIds ?? []
  );
  const teamMembers = own.teamIds.length === 0 ? [] : await db
    .select({ userId: userTeams.userId })
    .from(userTeams)
    .where(and(inArray(userTeams.teamId, own.teamIds), eq(userTeams.isActive, true)));
  const teamMemberIds = [...new Set(teamMembers.map(m => m.userId))];
  const teamMembersInOrg = await getOrganizationMemberIds(request.organizationId, teamMemberIds);
  return [...new Set([...own.athleteIds, ...teamMemberIds.filter(id => teamMembersInOrg.has(id))])];
}
