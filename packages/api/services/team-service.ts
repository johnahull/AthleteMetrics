/**
 * TeamService - Handles all team-related business logic
 * Refactored to use direct database access instead of storage layer
 * This reduces coupling and improves modularity
 */

import {
  teams,
  organizations,
  userTeams,
  userOrganizations,
  measurements,
  coachTeams,
  users,
  type Team,
  type Organization,
  type UserTeam,
  type InsertTeam,
  type CoachTeam,
  type InsertCoachTeam,
  type UpdateCoachTeam,
  type CoachTeamWithDetails,
} from '@shared/schema';
import { db } from '../db';
import { eq, and, asc, ne, sql } from 'drizzle-orm';

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
    // Database Index: idx_teams_org_active (organization_id, id WHERE is_archived = false)
    // See: migrations/0018_add_org_query_composite_indexes.sql
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
   *           and validates organization ownership when expectedOrganizationId provided
   *
   * Defense-in-depth: Even though route layer checks organization, this service-layer
   * validation prevents IDOR attacks if called from other contexts or future endpoints.
   *
   * @param id Team ID
   * @param team Partial team data to update
   * @param expectedOrganizationId Optional organization ID for IDOR protection
   * @returns Updated team
   * @throws Error if no valid fields, team not found, or org mismatch
   */
  async updateTeam(
    id: string,
    team: Partial<InsertTeam>,
    expectedOrganizationId?: string
  ): Promise<Team> {
    // Defense in depth - ALWAYS strip organizationId at service layer
    const { organizationId, ...safeTeamData } = team;

    // Log if organizationId was provided (security monitoring)
    if (organizationId !== undefined) {
      console.warn(`[TeamService] Attempt to update organizationId for team ${id} was blocked. organizationId cannot be changed after team creation.`);
    }

    if (Object.keys(safeTeamData).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Defense-in-depth: Verify organization ownership at service layer
    // This prevents IDOR attacks even if route-level checks are bypassed
    if (expectedOrganizationId) {
      const [existing] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, id));

      if (!existing) {
        throw new Error('Team not found');
      }

      if (existing.organizationId !== expectedOrganizationId) {
        throw new Error('Access denied - team belongs to different organization');
      }
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
   * Uses transaction to ensure atomicity and prevent race conditions
   *
   * Security: Validates no measurements exist INSIDE transaction with row-level locks
   * to prevent race condition where measurements could be created between validation
   * and deletion, causing orphaned records.
   *
   * @param id Team ID
   * @throws Error if team not found or has existing measurements
   */
  async deleteTeam(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock the team row to prevent concurrent modifications
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, id))
        .for('update');

      if (!team) {
        throw new Error('Team not found');
      }

      // Check for measurements INSIDE transaction to prevent race conditions
      // This prevents orphaned measurements if one is created during deletion
      const [measurementCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(measurements)
        .where(eq(measurements.teamId, id));

      if (measurementCount.count > 0) {
        throw new Error('Cannot delete team with existing measurements. Please delete or reassign measurements first.');
      }

      // Delete all team memberships first (foreign key constraints)
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
    try {
      return await db.transaction(async (tx) => {
        // First check if team exists and get its current state with row-level lock
        // FOR UPDATE prevents race conditions from concurrent archive operations
        const [existingTeam] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, id))
          .for('update');

        if (!existingTeam) {
          throw new Error(`Team with id ${id} not found`);
        }

        if (existingTeam.isArchived) {
          throw new Error(`Team with id ${id} is already archived`);
        }

        // Archive the team
        const [archived] = await tx
          .update(teams)
          .set({
            isArchived: true,
            archivedAt: archiveDate,
            season: season,
          })
          .where(eq(teams.id, id))
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
    } catch (error) {
      console.error('Archive team transaction failed:', error);
      throw new Error(`Failed to archive team: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
   *
   * Security: When expectedOrganizationId is provided, validates inside transaction
   * to prevent TOCTOU race conditions where user/team could be transferred between
   * validation and execution.
   *
   * @param teamId Team ID
   * @param userId User ID
   * @param membershipData Membership updates (leftAt, season)
   * @param expectedOrganizationId Optional organization ID for TOCTOU-safe validation
   * @returns Updated membership
   * @throws Error if organization validation fails or user/team belong to different org
   */
  async updateTeamMembership(
    teamId: string,
    userId: string,
    membershipData: { leftAt?: Date; season?: string },
    expectedOrganizationId?: string
  ): Promise<UserTeam> {
    // Use transaction for atomicity and organization validation
    return await db.transaction(async (tx) => {
      // Defense-in-depth: Validate organization membership INSIDE transaction
      if (expectedOrganizationId) {
        // Lock team row and verify organization
        const [team] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, teamId))
          .for('update');

        if (!team) {
          throw new Error('Team not found');
        }

        if (team.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - team belongs to different organization');
        }

        // Lock user-org relationship and verify user belongs to expected org
        const [userOrg] = await tx
          .select()
          .from(userOrganizations)
          .where(
            and(
              eq(userOrganizations.userId, userId),
              eq(userOrganizations.organizationId, expectedOrganizationId)
            )
          )
          .for('update');

        if (!userOrg) {
          throw new Error('Access denied - user does not belong to your organization');
        }
      }

      const [updated] = await tx
        .update(userTeams)
        .set({
          leftAt: membershipData.leftAt ?? null,
          season: membershipData.season,
          isActive: membershipData.leftAt ? false : true,
        })
        .where(and(eq(userTeams.teamId, teamId), eq(userTeams.userId, userId)))
        .returning();

      if (!updated) {
        throw new Error('Team membership not found');
      }

      return updated;
    });
  }

  /**
   * Add a user to a team
   * Handles: existing active memberships, reactivation of inactive memberships,
   * and creating new memberships while preserving historical data
   *
   * Security: When expectedOrganizationId is provided, validates inside transaction
   * to prevent TOCTOU race conditions where user/team could be transferred between
   * validation and execution.
   *
   * @param userId User ID
   * @param teamId Team ID
   * @param expectedOrganizationId Optional organization ID for TOCTOU-safe validation
   * @returns User team membership
   * @throws Error if organization validation fails or user/team belong to different org
   */
  async addUserToTeam(
    userId: string,
    teamId: string,
    expectedOrganizationId?: string
  ): Promise<UserTeam> {
    // Use transaction with row-level locking to prevent race conditions
    return await db.transaction(async (tx) => {
      try {
        // Defense-in-depth: Validate organization membership INSIDE transaction
        // This prevents TOCTOU vulnerability where user could be transferred
        // between route-level check and service execution
        if (expectedOrganizationId) {
          // Lock team row and verify organization
          const [team] = await tx
            .select()
            .from(teams)
            .where(eq(teams.id, teamId))
            .for('update');

          if (!team) {
            throw new Error('Team not found');
          }

          if (team.organizationId !== expectedOrganizationId) {
            throw new Error('Access denied - team belongs to different organization');
          }

          // Lock user-org relationship and verify user belongs to expected org
          const [userOrg] = await tx
            .select()
            .from(userOrganizations)
            .where(
              and(
                eq(userOrganizations.userId, userId),
                eq(userOrganizations.organizationId, expectedOrganizationId)
              )
            )
            .for('update');

          if (!userOrg) {
            throw new Error('Access denied - user does not belong to your organization');
          }
        }

        // Check if user has an active membership in this team (with row-level lock)
        const existingActiveAssignment = await tx
          .select()
          .from(userTeams)
          .where(
            and(
              eq(userTeams.userId, userId),
              eq(userTeams.teamId, teamId),
              eq(userTeams.isActive, true)
            )
          )
          .for('update'); // Row-level lock prevents concurrent modifications

        if (existingActiveAssignment.length > 0) {
          // User already has active assignment to team
          return existingActiveAssignment[0];
        }

        // Check if user has an inactive membership that can be reactivated
        const existingInactiveAssignment = await tx
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
          const [reactivated] = await tx
            .update(userTeams)
            .set({
              isActive: true,
              leftAt: null,
              joinedAt: new Date(), // Update join date for new active period
            })
            .where(eq(userTeams.id, existingInactiveAssignment[0].id))
            .returning();

          // Reactivated inactive team membership
          return reactivated;
        }

        // No existing membership - create new one
        const [newAssignment] = await tx
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
    });
  }

  /**
   * Remove a user from a team by marking membership inactive
   * Uses temporal pattern - doesn't delete, preserves history
   *
   * Security: When expectedOrganizationId is provided, validates inside transaction
   * to prevent TOCTOU race conditions where user/team could be transferred between
   * validation and execution.
   *
   * @param userId User ID
   * @param teamId Team ID
   * @param expectedOrganizationId Optional organization ID for TOCTOU-safe validation
   * @throws Error if organization validation fails or user/team belong to different org
   */
  async removeUserFromTeam(
    userId: string,
    teamId: string,
    expectedOrganizationId?: string
  ): Promise<void> {
    // Use transaction for atomicity and organization validation
    await db.transaction(async (tx) => {
      // Defense-in-depth: Validate organization membership INSIDE transaction
      if (expectedOrganizationId) {
        // Lock team row and verify organization
        const [team] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, teamId))
          .for('update');

        if (!team) {
          throw new Error('Team not found');
        }

        if (team.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - team belongs to different organization');
        }

        // Lock user-org relationship and verify user belongs to expected org
        const [userOrg] = await tx
          .select()
          .from(userOrganizations)
          .where(
            and(
              eq(userOrganizations.userId, userId),
              eq(userOrganizations.organizationId, expectedOrganizationId)
            )
          )
          .for('update');

        if (!userOrg) {
          throw new Error('Access denied - user does not belong to your organization');
        }
      }

      // Mark membership as inactive instead of deleting (temporal approach)
      await tx
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
    });
  }

  // ==========================================
  // Coach-Team Assignment Methods
  // ==========================================

  /**
   * Get all coaches assigned to a team
   * @param teamId Team ID
   * @param activeOnly Only return active assignments (default: true)
   * @returns Array of coach assignments with coach details
   */
  async getTeamCoaches(
    teamId: string,
    activeOnly: boolean = true
  ): Promise<CoachTeamWithDetails[]> {
    const conditions = [eq(coachTeams.teamId, teamId)];

    if (activeOnly) {
      conditions.push(eq(coachTeams.isActive, true));
    }

    const result = await db
      .select({
        coachTeam: coachTeams,
        coach: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          fullName: users.fullName,
          emails: users.emails,
        },
        team: {
          id: teams.id,
          name: teams.name,
          organizationId: teams.organizationId,
        },
      })
      .from(coachTeams)
      .innerJoin(users, eq(coachTeams.coachId, users.id))
      .innerJoin(teams, eq(coachTeams.teamId, teams.id))
      .where(and(...conditions))
      .orderBy(asc(users.fullName));

    return result.map(({ coachTeam, coach, team }) => ({
      ...coachTeam,
      coach,
      team,
    }));
  }

  /**
   * Get all teams assigned to a coach
   * @param coachId Coach user ID
   * @param activeOnly Only return active assignments (default: true)
   * @returns Array of coach assignments with team details
   */
  async getCoachTeams(
    coachId: string,
    activeOnly: boolean = true
  ): Promise<CoachTeamWithDetails[]> {
    const conditions = [eq(coachTeams.coachId, coachId)];

    if (activeOnly) {
      conditions.push(eq(coachTeams.isActive, true));
    }

    const result = await db
      .select({
        coachTeam: coachTeams,
        coach: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          fullName: users.fullName,
          emails: users.emails,
        },
        team: {
          id: teams.id,
          name: teams.name,
          organizationId: teams.organizationId,
        },
      })
      .from(coachTeams)
      .innerJoin(users, eq(coachTeams.coachId, users.id))
      .innerJoin(teams, eq(coachTeams.teamId, teams.id))
      .where(and(...conditions))
      .orderBy(asc(teams.name));

    return result.map(({ coachTeam, coach, team }) => ({
      ...coachTeam,
      coach,
      team,
    }));
  }

  /**
   * Assign a coach to a team
   * Validates that the coach has a coach role in the organization
   *
   * @param coachId Coach user ID
   * @param teamId Team ID
   * @param role Coach role in team (head_coach, assistant_coach, stats_manager)
   * @param assignedById User ID of who is making the assignment
   * @param notes Optional notes about the assignment
   * @param expectedOrganizationId Optional organization ID for TOCTOU-safe validation
   * @returns Created coach team assignment
   */
  async assignCoachToTeam(
    coachId: string,
    teamId: string,
    role: 'head_coach' | 'assistant_coach' | 'stats_manager' = 'assistant_coach',
    assignedById?: string,
    notes?: string,
    expectedOrganizationId?: string
  ): Promise<CoachTeam> {
    return await db.transaction(async (tx) => {
      // Get team and verify organization
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update');

      if (!team) {
        throw new Error('Team not found');
      }

      // TOCTOU-safe organization validation
      if (expectedOrganizationId && team.organizationId !== expectedOrganizationId) {
        throw new Error('Access denied - team belongs to different organization');
      }

      // Verify coach is a coach in this organization
      const [coachOrg] = await tx
        .select()
        .from(userOrganizations)
        .where(
          and(
            eq(userOrganizations.userId, coachId),
            eq(userOrganizations.organizationId, team.organizationId)
          )
        );

      if (!coachOrg) {
        throw new Error('Coach does not belong to this organization');
      }

      if (coachOrg.role !== 'coach' && coachOrg.role !== 'org_admin') {
        throw new Error('User must have coach or org_admin role to be assigned to a team');
      }

      // Check for existing active assignment
      const [existingActive] = await tx
        .select()
        .from(coachTeams)
        .where(
          and(
            eq(coachTeams.coachId, coachId),
            eq(coachTeams.teamId, teamId),
            eq(coachTeams.isActive, true)
          )
        )
        .for('update');

      if (existingActive) {
        // Update existing assignment if role changed
        if (existingActive.role !== role) {
          const [updated] = await tx
            .update(coachTeams)
            .set({ role, notes })
            .where(eq(coachTeams.id, existingActive.id))
            .returning();
          return updated;
        }
        return existingActive;
      }

      // Check for inactive assignment to reactivate
      const [existingInactive] = await tx
        .select()
        .from(coachTeams)
        .where(
          and(
            eq(coachTeams.coachId, coachId),
            eq(coachTeams.teamId, teamId),
            eq(coachTeams.isActive, false)
          )
        );

      if (existingInactive) {
        const [reactivated] = await tx
          .update(coachTeams)
          .set({
            isActive: true,
            removedAt: null,
            assignedAt: new Date(),
            role,
            assignedBy: assignedById,
            notes,
          })
          .where(eq(coachTeams.id, existingInactive.id))
          .returning();
        return reactivated;
      }

      // Create new assignment
      const [newAssignment] = await tx
        .insert(coachTeams)
        .values({
          coachId,
          teamId,
          role,
          assignedBy: assignedById,
          notes,
          isActive: true,
        })
        .returning();

      return newAssignment;
    });
  }

  /**
   * Remove a coach from a team (marks inactive, preserves history)
   *
   * @param coachId Coach user ID
   * @param teamId Team ID
   * @param expectedOrganizationId Optional organization ID for TOCTOU-safe validation
   */
  async removeCoachFromTeam(
    coachId: string,
    teamId: string,
    expectedOrganizationId?: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Validate organization if provided
      if (expectedOrganizationId) {
        const [team] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, teamId))
          .for('update');

        if (!team) {
          throw new Error('Team not found');
        }

        if (team.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - team belongs to different organization');
        }
      }

      // Mark assignment as inactive
      const [updated] = await tx
        .update(coachTeams)
        .set({
          isActive: false,
          removedAt: new Date(),
        })
        .where(
          and(
            eq(coachTeams.coachId, coachId),
            eq(coachTeams.teamId, teamId),
            eq(coachTeams.isActive, true)
          )
        )
        .returning();

      if (!updated) {
        throw new Error('Coach assignment not found');
      }
    });
  }

  /**
   * Update a coach's team assignment (role, notes)
   *
   * @param coachId Coach user ID
   * @param teamId Team ID
   * @param updates Updates to apply
   * @param expectedOrganizationId Optional organization ID for TOCTOU-safe validation
   * @returns Updated assignment
   */
  async updateCoachTeamAssignment(
    coachId: string,
    teamId: string,
    updates: UpdateCoachTeam,
    expectedOrganizationId?: string
  ): Promise<CoachTeam> {
    return await db.transaction(async (tx) => {
      // Validate organization if provided
      if (expectedOrganizationId) {
        const [team] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, teamId))
          .for('update');

        if (!team) {
          throw new Error('Team not found');
        }

        if (team.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - team belongs to different organization');
        }
      }

      // Update the assignment
      const [updated] = await tx
        .update(coachTeams)
        .set(updates)
        .where(
          and(
            eq(coachTeams.coachId, coachId),
            eq(coachTeams.teamId, teamId),
            eq(coachTeams.isActive, true)
          )
        )
        .returning();

      if (!updated) {
        throw new Error('Coach assignment not found');
      }

      return updated;
    });
  }

  /**
   * Get coaches for notification purposes
   * Returns active coaches for a team with their email addresses
   * Useful for sending notifications about team events
   *
   * @param teamId Team ID
   * @returns Array of coach info for notifications
   */
  async getTeamCoachesForNotification(teamId: string): Promise<{
    coachId: string;
    fullName: string;
    emails: string[];
    role: string;
  }[]> {
    const result = await db
      .select({
        coachId: coachTeams.coachId,
        fullName: users.fullName,
        emails: users.emails,
        role: coachTeams.role,
      })
      .from(coachTeams)
      .innerJoin(users, eq(coachTeams.coachId, users.id))
      .where(
        and(
          eq(coachTeams.teamId, teamId),
          eq(coachTeams.isActive, true)
        )
      );

    return result.map(r => ({
      coachId: r.coachId,
      fullName: r.fullName,
      emails: r.emails,
      role: r.role || 'assistant_coach',
    }));
  }
}