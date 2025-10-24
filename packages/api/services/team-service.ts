/**
 * TeamService - Handles all team-related business logic
 * Refactored to use direct database access instead of storage layer
 * This reduces coupling and improves modularity
 */

import {
  teams,
  organizations,
  userTeams,
  type Team,
  type Organization,
  type UserTeam,
  type InsertTeam,
} from '@shared/schema';
import { db } from '../db';
import { eq, and, asc, ne } from 'drizzle-orm';

export class TeamService {
  /**
   * Get all non-archived teams for an organization
   * @param organizationId Optional organization filter
   * @returns Array of teams with organization details
   */
  async getTeams(
    organizationId?: string
  ): Promise<(Team & { organization: Organization })[]> {
    // Build conditions array to exclude archived teams
    const conditions = [];

    if (organizationId) {
      conditions.push(eq(teams.organizationId, organizationId));
    }

    // Always exclude archived teams
    conditions.push(ne(teams.isArchived, true));

    // Build and execute query with conditions
    const result = await db
      .select()
      .from(teams)
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(and(...conditions))
      .orderBy(asc(teams.name));

    return result.map(({ teams: team, organizations: org }) => ({
      ...team,
      organization: org,
    }));
  }

  /**
   * Get a single team by ID with organization details
   * @param id Team ID
   * @returns Team with organization or undefined
   */
  async getTeam(
    id: string
  ): Promise<(Team & { organization: Organization }) | undefined> {
    const result = await db
      .select()
      .from(teams)
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, id));

    if (result.length === 0) return undefined;

    const { teams: team, organizations: org } = result[0];
    return { ...team, organization: org };
  }

  /**
   * Create a new team
   * @param team Team data to insert
   * @returns Created team
   */
  async createTeam(team: InsertTeam): Promise<Team> {
    const [newTeam] = await db
      .insert(teams)
      .values({
        name: team.name,
        organizationId: team.organizationId!,
        level: team.level || null,
        notes: team.notes || null,
      })
      .returning();
    return newTeam;
  }

  /**
   * Update team details
   * Security: Strips organizationId to prevent unauthorized transfers
   * @param id Team ID
   * @param team Partial team data to update
   * @returns Updated team
   * @throws Error if no valid fields or team not found
   */
  async updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team> {
    // Defense in depth - ALWAYS strip organizationId at service layer
    const { organizationId, ...safeTeamData } = team;

    if (Object.keys(safeTeamData).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Trim whitespace from name if provided
    const normalizedData = {
      ...safeTeamData,
      ...(safeTeamData.name && { name: safeTeamData.name.trim() }),
    };

    const [updated] = await db
      .update(teams)
      .set(normalizedData)
      .where(eq(teams.id, id))
      .returning();

    if (!updated) throw new Error('Team not found');
    return updated;
  }

  /**
   * Delete a team and all associated memberships
   * Uses transaction to ensure atomicity
   * @param id Team ID
   */
  async deleteTeam(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete all team memberships first
      await tx.delete(userTeams).where(eq(userTeams.teamId, id));

      // Now delete the team
      await tx.delete(teams).where(eq(teams.id, id));
    });
  }

  /**
   * Archives a team and marks all current team memberships as inactive
   * Uses transaction to ensure atomicity
   * @param id Team ID to archive
   * @param archiveDate Date when the team was archived (affects measurement context)
   * @param season Final season designation for the team (e.g., "2024-Fall Soccer")
   * @returns The archived team object
   * @throws Error if team not found or archive operation fails
   */
  async archiveTeam(
    id: string,
    archiveDate: Date,
    season: string
  ): Promise<Team> {
    return await db.transaction(async (tx) => {
      // Idempotency check: only archive if not already archived (prevents race conditions)
      const [archived] = await tx
        .update(teams)
        .set({
          isArchived: true,
          archivedAt: archiveDate,
          season: season,
        })
        .where(and(eq(teams.id, id), ne(teams.isArchived, true)))
        .returning();

      // Mark all current team memberships as inactive
      await tx
        .update(userTeams)
        .set({
          isActive: false,
          leftAt: archiveDate,
          season: season,
        })
        .where(and(eq(userTeams.teamId, id), eq(userTeams.isActive, true)));

      return archived;
    });
  }

  /**
   * Unarchives a team by setting isArchived to false and clearing archivedAt
   * Note: This does NOT automatically reactivate team memberships -
   * users should be explicitly re-added to teams to prevent accidentally
   * including old measurements in current analytics
   * @param id Team ID
   * @returns Unarchived team
   */
  async unarchiveTeam(id: string): Promise<Team> {
    const [unarchived] = await db
      .update(teams)
      .set({
        isArchived: false,
        archivedAt: null,
      })
      .where(eq(teams.id, id))
      .returning();

    // Note: We don't automatically reactivate team memberships when unarchiving
    // This is intentional - users should be explicitly re-added to teams
    // to prevent accidentally including old measurements in current analytics

    return unarchived;
  }

  /**
   * Update team membership status and season
   * @param teamId Team ID
   * @param userId User ID
   * @param membershipData Membership updates (leftAt, season)
   * @returns Updated membership
   */
  async updateTeamMembership(
    teamId: string,
    userId: string,
    membershipData: { leftAt?: Date; season?: string }
  ): Promise<UserTeam> {
    const [updated] = await db
      .update(userTeams)
      .set({
        leftAt: membershipData.leftAt ?? null,
        season: membershipData.season,
        isActive: membershipData.leftAt ? false : true,
      })
      .where(and(eq(userTeams.teamId, teamId), eq(userTeams.userId, userId)))
      .returning();

    return updated;
  }

  /**
   * Add a user to a team
   * Handles: existing active memberships, reactivation of inactive memberships,
   * and creating new memberships while preserving historical data
   * @param userId User ID
   * @param teamId Team ID
   * @returns User team membership
   */
  async addUserToTeam(userId: string, teamId: string): Promise<UserTeam> {
    try {
      // Check if user has an active membership in this team
      const existingActiveAssignment = await db
        .select()
        .from(userTeams)
        .where(
          and(
            eq(userTeams.userId, userId),
            eq(userTeams.teamId, teamId),
            eq(userTeams.isActive, true)
          )
        );

      if (existingActiveAssignment.length > 0) {
        console.log('User already has active assignment to team');
        return existingActiveAssignment[0];
      }

      // Check if user has an inactive membership that can be reactivated
      const existingInactiveAssignment = await db
        .select()
        .from(userTeams)
        .where(
          and(
            eq(userTeams.userId, userId),
            eq(userTeams.teamId, teamId),
            eq(userTeams.isActive, false)
          )
        );

      if (existingInactiveAssignment.length > 0) {
        // Reactivate the membership
        const [reactivated] = await db
          .update(userTeams)
          .set({
            isActive: true,
            leftAt: null,
            joinedAt: new Date(), // Update join date for new active period
          })
          .where(eq(userTeams.id, existingInactiveAssignment[0].id))
          .returning();

        console.log('Reactivated inactive team membership');
        return reactivated;
      }

      // No existing membership - create new one
      const [newAssignment] = await db
        .insert(userTeams)
        .values({
          userId,
          teamId,
          isActive: true,
        })
        .returning();

      return newAssignment;
    } catch (error) {
      console.error('Error adding user to team:', error);
      throw error;
    }
  }

  /**
   * Remove a user from a team by marking membership inactive
   * Uses temporal pattern - doesn't delete, preserves history
   * @param userId User ID
   * @param teamId Team ID
   */
  async removeUserFromTeam(userId: string, teamId: string): Promise<void> {
    // Mark membership as inactive instead of deleting (temporal approach)
    await db
      .update(userTeams)
      .set({
        isActive: false,
        leftAt: new Date(),
      })
      .where(
        and(
          eq(userTeams.userId, userId),
          eq(userTeams.teamId, teamId),
          eq(userTeams.isActive, true)
        )
      );
  }
}