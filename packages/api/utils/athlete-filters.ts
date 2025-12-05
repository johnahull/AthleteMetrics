import { db } from "../db";
import { userTeams, teams } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get athlete IDs for a given scope (organization-wide or team-specific)
 *
 * @param organizationId - The organization ID to filter by
 * @param teamId - Optional team ID to further filter athletes
 * @returns Array of unique athlete user IDs
 */
export async function getAthleteIdsForScope(
  organizationId: string,
  teamId?: string
): Promise<string[]> {
  if (teamId) {
    // Get athletes for specific team
    const teamAthletes = await db
      .select({ userId: userTeams.userId })
      .from(userTeams)
      .where(
        and(
          eq(userTeams.teamId, teamId),
          eq(userTeams.isActive, true)
        )
      );
    return [...new Set(teamAthletes.map(a => a.userId))];
  } else {
    // Get all athletes through team membership (organization scope)
    const orgAthletes = await db
      .select({ userId: userTeams.userId })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(eq(teams.organizationId, organizationId));
    return [...new Set(orgAthletes.map(a => a.userId))];
  }
}
