/**
 * Organization scoping for wellness templates and targets.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { teams, userOrganizations } from "@shared/schema";

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

/** True when every athlete is a member of the organization and every team belongs to it. */
export async function targetsBelongToOrganization(
  organizationId: string,
  athleteIds: string[] = [],
  teamIds: string[] = []
): Promise<boolean> {
  const uniqueAthleteIds = [...new Set(athleteIds)];
  const members = await getOrganizationMemberIds(organizationId, uniqueAthleteIds);
  if (members.size !== uniqueAthleteIds.length) return false;

  const uniqueTeamIds = [...new Set(teamIds)];
  if (uniqueTeamIds.length === 0) return true;
  const ownTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.organizationId, organizationId), inArray(teams.id, uniqueTeamIds)));
  return ownTeams.length === uniqueTeamIds.length;
}
