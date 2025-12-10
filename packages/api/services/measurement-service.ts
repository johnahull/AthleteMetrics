/**
 * MeasurementService - Handles all measurement-related business logic
 * Refactored to use direct database access instead of storage layer
 * This reduces coupling and improves modularity
 */

import {
  measurements,
  teams,
  organizations,
  users,
  userTeams,
  type Measurement,
  type InsertMeasurement,
  type Team,
  type Organization,
} from '@shared/schema';
import { parseDateFilter } from '@shared/date-utils';
import { db } from '../db';
import { eq, and, gte, lte, or, isNull, sql, desc, inArray, arrayContains } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { PAGINATION } from '../constants/pagination';

export interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  teamIds?: string[];
  organizationId?: string;
  metric?: string;
  dateFrom?: string;
  dateTo?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  ageFrom?: number;
  ageTo?: number;
  search?: string;
  sport?: string;
  gender?: string;
  position?: string;
  includeUnverified?: boolean;
  includeUnknownBirthYear?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedMeasurements {
  measurements: Measurement[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export class MeasurementService {
  /**
   * Get a single measurement by ID
   * @param id Measurement ID
   * @returns Measurement or undefined
   */
  async getMeasurement(id: string): Promise<Measurement | undefined> {
    const [measurement] = await db
      .select()
      .from(measurements)
      .where(eq(measurements.id, id));
    return measurement || undefined;
  }

  /**
   * Get athlete's active teams at a specific date
   * Used for auto-assigning team context to measurements
   * @param userId Athlete user ID
   * @param measurementDate Date of measurement
   * @returns Array of active teams
   */
  async getAthleteActiveTeamsAtDate(
    userId: string,
    measurementDate: Date
  ): Promise<
    Array<{
      teamId: string;
      teamName: string;
      season: string | null;
      organizationId: string;
      organizationName: string;
    }>
  > {
    const activeTeams = await db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        season: teams.season,
        organizationId: teams.organizationId,
        organizationName: organizations.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(
        and(
          eq(userTeams.userId, userId),
          // Must have joined on or before the measurement date
          lte(userTeams.joinedAt, measurementDate),
          // Must not have left before the measurement date
          or(isNull(userTeams.leftAt), gte(userTeams.leftAt, measurementDate)),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false) // Only include non-archived teams
        )
      );

    return activeTeams;
  }

  /**
   * Create a new measurement with auto-calculated fields
   * IMPORTANT: Wrapped in transaction to prevent race conditions
   * @param measurement Measurement data
   * @param submittedBy User ID of submitter
   * @param submitterRole Role of submitter (coach, org_admin, athlete, site_admin)
   * @returns Created measurement
   * @throws Error if user not found, team not found, or transaction fails
   */
  async createMeasurement(
    measurement: InsertMeasurement,
    submittedBy: string,
    submitterRole: string = 'athlete'
  ): Promise<Measurement> {
    // Wrap entire operation in transaction to prevent race conditions
    // Race condition scenario: User joins/leaves team between active teams query and measurement insert
    try {
      return await db.transaction(async (tx) => {
      // Get user info for age calculation
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, measurement.userId));

      if (!user) throw new Error('User not found');

      const measurementDate = new Date(measurement.date);
      let age = 0;

      // Calculate age from birthDate (source of truth)
      // Note: birthYear field is not reliably maintained
      if (user.birthDate) {
        const birthDate = new Date(user.birthDate);
        age = measurementDate.getFullYear() - birthDate.getFullYear();
        const birthdayThisYear = new Date(
          measurementDate.getFullYear(),
          birthDate.getMonth(),
          birthDate.getDate()
        );
        if (measurementDate < birthdayThisYear) {
          age -= 1;
        }
      }

      // Auto-calculate units based on metric
      const units =
        measurement.metric === 'FLY10_TIME' ||
        measurement.metric === 'T_TEST' ||
        measurement.metric === 'DASH_40YD' ||
        measurement.metric === 'AGILITY_505' ||
        measurement.metric === 'AGILITY_5105'
          ? 's'
          : measurement.metric === 'TOP_SPEED'
          ? 'mph'
          : measurement.metric === 'RSI'
          ? 'ratio'
          : 'in';

      // Auto-populate team context if not explicitly provided
      let teamId = measurement.teamId;
      let season = measurement.season;
      let teamContextAuto = true;
      let teamNameSnapshot: string | null = null;
      let organizationId: string | null = null;

      if (!teamId || teamId.trim() === '') {
        // Get athlete's active teams at measurement date (within transaction)
        // Database Index: idx_user_teams_team_user_active (team_id, user_id WHERE is_active = true)
        // See: migrations/0018_add_org_query_composite_indexes.sql
        const activeTeams = await tx
          .select({
            teamId: teams.id,
            teamName: teams.name,
            season: teams.season,
            organizationId: teams.organizationId,
            organizationName: organizations.name,
          })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .innerJoin(organizations, eq(teams.organizationId, organizations.id))
          .where(
            and(
              eq(userTeams.userId, measurement.userId),
              lte(userTeams.joinedAt, measurementDate),
              or(isNull(userTeams.leftAt), gte(userTeams.leftAt, measurementDate)),
              eq(userTeams.isActive, true),
              eq(teams.isArchived, false)
            )
          )
          .for('update'); // Prevent race condition with row-level lock

        if (activeTeams.length === 1) {
          // Single team - auto-assign
          teamId = activeTeams[0].teamId;
          // Use undefined for optional fields per TypeScript schema
          season = activeTeams[0].season ?? undefined;
          teamContextAuto = true;
          // Auto-assigned measurement to team: ${activeTeams[0].teamName} (${season || 'no season'})
        } else if (activeTeams.length > 1) {
          // Multiple teams - cannot auto-assign
          // Athlete is on ${activeTeams.length} teams - team context not auto-assigned
          teamContextAuto = false;
        } else {
          // No active teams - measurement without team context
          teamContextAuto = false;
        }
      } else {
        // teamId was explicitly provided
        teamContextAuto = false;
      }

      // If teamId is set (either auto-assigned or explicitly provided), fetch team details for snapshot
      if (teamId && teamId.trim() !== '') {
        const [team] = await tx
          .select()
          .from(teams)
          .innerJoin(organizations, eq(teams.organizationId, organizations.id))
          .where(eq(teams.id, teamId));

        if (team) {
          teamNameSnapshot = team.teams.name;
          organizationId = team.teams.organizationId;
          // Use undefined for optional fields per TypeScript schema
          season = season ?? team.teams.season ?? undefined;
        }
      }

      // Auto-verify measurements from coaches, org admins, and site admins
      // Athletes' self-submitted measurements remain unverified
      const isVerified = submitterRole === 'coach' ||
                        submitterRole === 'org_admin' ||
                        submitterRole === 'site_admin';

      // Create measurement
      const [newMeasurement] = await tx
        .insert(measurements)
        .values({
          userId: measurement.userId,
          submittedBy,
          date: measurementDate.toISOString(),
          metric: measurement.metric,
          value: String(measurement.value),
          units,
          age,
          notes: measurement.notes || null,
          flyInDistance: measurement.flyInDistance ? String(measurement.flyInDistance) : null,
          teamId: teamId || null,
          season: season || null,
          teamContextAuto,
          teamNameSnapshot,
          organizationId: organizationId || null,
          isVerified,
        })
        .returning();

      return newMeasurement;
      });
    } catch (error) {
      // Preserve error specificity - don't wrap validation errors
      if (error instanceof Error) {
        // Re-throw validation errors without modification
        if (error.message.includes('User not found') ||
            error.message.includes('Team not found') ||
            error.message.includes('not found')) {
          throw error;
        }
        // Database constraint violations - preserve original message
        if (error.message.includes('constraint') ||
            error.message.includes('foreign key') ||
            error.message.includes('unique')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        // Generic database error - preserve original message for debugging
        throw new Error(`Failed to create measurement: ${error.message}`);
      }
      // Unknown error type - wrap with context
      throw new Error(`Failed to create measurement due to unexpected error: ${String(error)}`);
    }
  }

  /**
   * Batch create measurements (coaches and org admins only)
   * Processes each measurement independently to allow partial success
   * IMPORTANT: Each measurement is in its own transaction for atomicity per-measurement
   * This allows the batch to continue processing if individual measurements fail
   *
   * SECURITY: Validates organization access for each athlete in batch to prevent cross-org data creation
   * @param measurements Array of measurements to create
   * @param user Session user for authorization
   * @param isSiteAdmin Whether user is a site admin (bypasses org checks)
   * @returns Result with created count and errors
   */
  async createMeasurementsBatch(
    measurements: InsertMeasurement[],
    user: { id: string; role: string; primaryOrganizationId?: string },
    isSiteAdmin: boolean = false
  ): Promise<{ created: number; failed: number; errors: Array<{ index: number; message: string }> }> {
    const errors: Array<{ index: number; message: string }> = [];
    let created = 0;

    // SECURITY: Pre-validate all athletes belong to user's organization (non-site-admins only)
    // This prevents coaches from creating measurements for athletes in other organizations
    if (!isSiteAdmin && user.primaryOrganizationId) {
      const uniqueUserIds = [...new Set(measurements.map(m => m.userId))];

      // Query all athletes' team memberships to verify organization access
      const athleteTeams = await db
        .select({
          userId: userTeams.userId,
          organizationId: teams.organizationId
        })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(and(
          inArray(userTeams.userId, uniqueUserIds),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false)
        ));

      // Build map of userId -> organizations
      const userOrgsMap = new Map<string, Set<string>>();
      athleteTeams.forEach(at => {
        if (!userOrgsMap.has(at.userId)) {
          userOrgsMap.set(at.userId, new Set());
        }
        userOrgsMap.get(at.userId)!.add(at.organizationId);
      });

      // Check each athlete has access to user's organization
      for (let i = 0; i < measurements.length; i++) {
        const userOrgs = userOrgsMap.get(measurements[i].userId);
        if (!userOrgs || !userOrgs.has(user.primaryOrganizationId)) {
          errors.push({
            index: i,
            message: `Unauthorized: athlete not in your organization`
          });
        }
      }

      // If pre-validation found unauthorized athletes, return early
      if (errors.length > 0) {
        return {
          created: 0,
          failed: errors.length,
          errors,
        };
      }
    }

    // SECURITY: Validate teamIds if provided (all users including site admins)
    // Pre-validate all team IDs exist and are accessible
    const teamIds = measurements
      .map(m => m.teamId)
      .filter((id): id is string => !!id && id.trim() !== '');

    if (teamIds.length > 0) {
      const uniqueTeamIds = [...new Set(teamIds)];
      const teamsData = await db
        .select({
          id: teams.id,
          organizationId: teams.organizationId
        })
        .from(teams)
        .where(inArray(teams.id, uniqueTeamIds));

      const teamMap = new Map(teamsData.map(t => [t.id, t.organizationId]));

      // Validate each teamId exists and is accessible
      for (let i = 0; i < measurements.length; i++) {
        if (measurements[i].teamId && measurements[i].teamId!.trim() !== '') {
          const teamOrgId = teamMap.get(measurements[i].teamId!);

          if (!teamOrgId) {
            errors.push({ index: i, message: 'Team not found' });
            continue;
          }

          // Non-site-admins can only assign to teams in their organization
          if (!isSiteAdmin && teamOrgId !== user.primaryOrganizationId) {
            errors.push({
              index: i,
              message: 'Cannot assign measurements to teams in different organizations'
            });
          }
        }
      }

      // If team validation found errors, return early
      if (errors.length > 0) {
        return {
          created: 0,
          failed: errors.length,
          errors,
        };
      }
    }

    // Process each measurement in its own transaction for atomicity per-measurement
    // This prevents a single failure from rolling back all measurements
    for (let i = 0; i < measurements.length; i++) {
      // Skip measurements that failed pre-validation
      if (errors.some(e => e.index === i)) {
        continue;
      }

      try {
        await this.createMeasurement(measurements[i], user.id, user.role);
        created++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ index: i, message });
      }
    }

    return {
      created,
      failed: errors.length,
      errors,
    };
  }

  /**
   * Update measurement fields
   * Note: submittedBy cannot be updated after creation
   * IMPORTANT: Wrapped in transaction with FOR UPDATE lock to prevent race conditions
   * @param id Measurement ID
   * @param measurement Partial measurement data
   * @param expectedOrganizationId Optional organization ID for defense-in-depth validation (IDOR prevention)
   * @returns Updated measurement
   * @throws Error if measurement not found, org mismatch, or transaction fails
   */
  async updateMeasurement(
    id: string,
    measurement: Partial<InsertMeasurement>,
    expectedOrganizationId?: string
  ): Promise<Measurement> {
    // Wrap in transaction to prevent race conditions during concurrent updates
    // Race condition scenario: Two users update same measurement simultaneously
    try {
      return await db.transaction(async (tx) => {
        // Lock the row with FOR UPDATE to prevent concurrent modifications
        const [existing] = await tx
          .select()
          .from(measurements)
          .where(eq(measurements.id, id))
          .for('update');

        if (!existing) {
          throw new Error('Measurement not found');
        }

        // Defense-in-depth: Verify organizationId if provided (IDOR prevention)
        // This provides service-layer validation even if route-layer checks are bypassed
        if (expectedOrganizationId && existing.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - measurement belongs to different organization');
        }

        const updateData: Partial<typeof measurements.$inferInsert> = {};

        if (measurement.userId) updateData.userId = measurement.userId;
        // submittedBy cannot be updated after creation (intentionally excluded)
        if (measurement.date) updateData.date = measurement.date;
        if (measurement.metric) {
          updateData.metric = measurement.metric;

          // CRITICAL: Recalculate units when metric changes
          // Different metrics use different units (seconds, inches, ratio, mph)
          const newUnits =
            measurement.metric === 'FLY10_TIME' ||
            measurement.metric === 'T_TEST' ||
            measurement.metric === 'DASH_40YD' ||
            measurement.metric === 'AGILITY_505' ||
            measurement.metric === 'AGILITY_5105'
              ? 's'
              : measurement.metric === 'TOP_SPEED'
              ? 'mph'
              : measurement.metric === 'RSI'
              ? 'ratio'
              : 'in';

          updateData.units = newUnits;
        }
        if (measurement.value !== undefined)
          updateData.value = String(measurement.value);
        if (measurement.notes !== undefined) updateData.notes = measurement.notes;
        if (measurement.flyInDistance !== undefined)
          updateData.flyInDistance = measurement.flyInDistance ? String(measurement.flyInDistance) : null;

        // Check if there are any valid fields to update
        if (Object.keys(updateData).length === 0) {
          throw new Error('No valid fields to update');
        }

        const [updated] = await tx
          .update(measurements)
          .set(updateData)
          .where(eq(measurements.id, id))
          .returning();

        return updated;
      });
    } catch (error) {
      // Preserve error specificity
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        throw new Error(`Failed to update measurement: ${error.message}`);
      }
      throw new Error(`Failed to update measurement due to unexpected error: ${String(error)}`);
    }
  }

  /**
   * Delete a measurement
   * IMPORTANT: Wrapped in transaction with FOR UPDATE lock to prevent race conditions
   * @param id Measurement ID
   * @param expectedOrganizationId Optional organization ID for defense-in-depth validation (IDOR prevention)
   * @throws Error if measurement not found, org mismatch, or transaction fails
   */
  async deleteMeasurement(id: string, expectedOrganizationId?: string): Promise<void> {
    // Wrap in transaction to prevent race conditions during concurrent operations
    // Race condition scenario: User deletes measurement while another user verifies/updates it
    try {
      await db.transaction(async (tx) => {
        // Lock the row with FOR UPDATE to prevent concurrent modifications
        const [existing] = await tx
          .select()
          .from(measurements)
          .where(eq(measurements.id, id))
          .for('update');

        if (!existing) {
          throw new Error('Measurement not found');
        }

        // Defense-in-depth: Verify organizationId if provided (IDOR prevention)
        // This provides service-layer validation even if route-layer checks are bypassed
        if (expectedOrganizationId && existing.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - measurement belongs to different organization');
        }

        // Delete the measurement
        await tx.delete(measurements).where(eq(measurements.id, id));
      });
    } catch (error) {
      // Preserve error specificity
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        throw new Error(`Failed to delete measurement: ${error.message}`);
      }
      throw new Error(`Failed to delete measurement due to unexpected error: ${String(error)}`);
    }
  }

  /**
   * Mark measurement as verified
   * IMPORTANT: Wrapped in transaction with FOR UPDATE lock to prevent race conditions
   * Idempotent operation - can be called multiple times safely
   *
   * Defense-in-depth: When expectedOrganizationId provided, validates organization
   * ownership to prevent IDOR attacks even if route-level checks are bypassed.
   *
   * @param id Measurement ID
   * @param verifiedBy User ID of verifier
   * @param expectedOrganizationId Optional organization ID for IDOR protection
   * @returns Updated measurement
   * @throws Error if measurement not found, org mismatch, or transaction fails
   */
  async verifyMeasurement(
    id: string,
    verifiedBy: string,
    expectedOrganizationId?: string
  ): Promise<Measurement> {
    // Wrap in transaction to prevent race conditions during concurrent verifications
    // Race condition scenario: Two admins verify same measurement simultaneously, overwriting audit trail
    try {
      return await db.transaction(async (tx) => {
        // Lock the row with FOR UPDATE to prevent concurrent modifications
        const [existing] = await tx
          .select()
          .from(measurements)
          .where(eq(measurements.id, id))
          .for('update');

        if (!existing) {
          throw new Error('Measurement not found');
        }

        // Defense-in-depth: Verify organization ownership at service layer
        // This prevents IDOR attacks even if route-level checks are bypassed
        if (expectedOrganizationId && existing.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - measurement belongs to different organization');
        }

        // Idempotency check: if already verified by this user, return existing record
        if (existing.isVerified && existing.verifiedBy === verifiedBy) {
          return existing;
        }

        // Update verification status
        const [updated] = await tx
          .update(measurements)
          .set({
            isVerified: true,
            verifiedBy,
          })
          .where(eq(measurements.id, id))
          .returning();

        return updated;
      });
    } catch (error) {
      // Preserve error specificity
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        throw new Error(`Failed to verify measurement: ${error.message}`);
      }
      throw new Error(`Failed to verify measurement due to unexpected error: ${String(error)}`);
    }
  }

  /**
   * Bulk verify measurements
   * IMPORTANT: Uses single transaction with batch update for performance
   * Validates all measurements before updating to allow partial success on validation failures
   *
   * @param measurementIds Array of measurement IDs to verify
   * @param verifiedByUserId User ID of verifier
   * @param expectedOrganizationId Optional organization ID for IDOR protection (site admins pass undefined)
   * @returns Result with success count and errors
   */
  async bulkVerify(
    measurementIds: string[],
    verifiedByUserId: string,
    expectedOrganizationId?: string
  ): Promise<{ success: number; failed: number; errors: Array<{ id: string; message: string }> }> {
    const errors: Array<{ id: string; message: string }> = [];

    try {
      return await db.transaction(async (tx) => {
        // Lock and validate all measurements with FOR UPDATE
        const existingMeasurements = await tx
          .select()
          .from(measurements)
          .where(inArray(measurements.id, measurementIds))
          .for('update');

        // Build map of found measurements
        const foundMap = new Map(existingMeasurements.map(m => [m.id, m]));

        // Validate each measurement and collect valid IDs
        const validIds: string[] = [];
        for (const id of measurementIds) {
          const measurement = foundMap.get(id);

          if (!measurement) {
            errors.push({ id, message: 'Measurement not found' });
            continue;
          }

          // Defense-in-depth: Verify organization ownership
          if (expectedOrganizationId && measurement.organizationId !== expectedOrganizationId) {
            errors.push({ id, message: 'Access denied - measurement belongs to different organization' });
            continue;
          }

          validIds.push(id);
        }

        // Batch update all valid measurements
        let actualUpdated = 0;
        if (validIds.length > 0) {
          const result = await tx
            .update(measurements)
            .set({
              isVerified: true,
              verifiedBy: verifiedByUserId,
            })
            .where(inArray(measurements.id, validIds))
            .returning({ id: measurements.id });

          actualUpdated = result.length;

          // Verify all expected measurements were updated (race condition check)
          if (actualUpdated !== validIds.length) {
            const missingIds = validIds.filter(id => !result.some(r => r.id === id));
            missingIds.forEach(id => {
              errors.push({ id, message: 'Measurement was deleted or modified during operation' });
            });
          }
        }

        return {
          success: actualUpdated,
          failed: errors.length,
          errors,
        };
      });
    } catch (error) {
      // Transaction failed - all measurements failed
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: 0,
        failed: measurementIds.length,
        errors: measurementIds.map(id => ({ id, message })),
      };
    }
  }

  /**
   * Bulk unverify measurements
   * IMPORTANT: Uses single transaction with batch update for performance
   * Validates all measurements before updating to allow partial success on validation failures
   *
   * @param measurementIds Array of measurement IDs to unverify
   * @param expectedOrganizationId Optional organization ID for IDOR protection (site admins pass undefined)
   * @returns Result with success count and errors
   */
  async bulkUnverify(
    measurementIds: string[],
    expectedOrganizationId?: string
  ): Promise<{ success: number; failed: number; errors: Array<{ id: string; message: string }> }> {
    const errors: Array<{ id: string; message: string }> = [];

    try {
      return await db.transaction(async (tx) => {
        // Lock and validate all measurements with FOR UPDATE
        const existingMeasurements = await tx
          .select()
          .from(measurements)
          .where(inArray(measurements.id, measurementIds))
          .for('update');

        // Build map of found measurements
        const foundMap = new Map(existingMeasurements.map(m => [m.id, m]));

        // Validate each measurement and collect valid IDs
        const validIds: string[] = [];
        for (const id of measurementIds) {
          const measurement = foundMap.get(id);

          if (!measurement) {
            errors.push({ id, message: 'Measurement not found' });
            continue;
          }

          // Defense-in-depth: Verify organization ownership
          if (expectedOrganizationId && measurement.organizationId !== expectedOrganizationId) {
            errors.push({ id, message: 'Access denied - measurement belongs to different organization' });
            continue;
          }

          validIds.push(id);
        }

        // Batch update all valid measurements
        let actualUpdated = 0;
        if (validIds.length > 0) {
          const result = await tx
            .update(measurements)
            .set({
              isVerified: false,
              verifiedBy: null,
            })
            .where(inArray(measurements.id, validIds))
            .returning({ id: measurements.id });

          actualUpdated = result.length;

          // Verify all expected measurements were updated (race condition check)
          if (actualUpdated !== validIds.length) {
            const missingIds = validIds.filter(id => !result.some(r => r.id === id));
            missingIds.forEach(id => {
              errors.push({ id, message: 'Measurement was deleted or modified during operation' });
            });
          }
        }

        return {
          success: actualUpdated,
          failed: errors.length,
          errors,
        };
      });
    } catch (error) {
      // Transaction failed - all measurements failed
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: 0,
        failed: measurementIds.length,
        errors: measurementIds.map(id => ({ id, message })),
      };
    }
  }

  /**
   * Get measurements with filters and pagination
   * @param filters Measurement filters including pagination options
   * @param allowCrossOrganization Whether to allow queries without organizationId (site admin only)
   * @returns Paginated measurements with metadata
   * @throws Error if organizationId not provided and allowCrossOrganization is false
   */
  async getMeasurements(
    filters?: MeasurementFilters,
    allowCrossOrganization: boolean = false
  ): Promise<PaginatedMeasurements> {
    // Defense-in-depth: Enforce organizationId requirement for non-site-admin contexts
    // This prevents accidental data leakage if route-layer authorization is bypassed
    if (!filters?.organizationId && !allowCrossOrganization) {
      throw new Error('organizationId is required for organization-scoped queries');
    }

    // Build query conditions
    const conditions = [];

    if (filters?.userId) {
      conditions.push(eq(measurements.userId, filters.userId));
    }

    if (filters?.athleteId) {
      conditions.push(eq(measurements.userId, filters.athleteId));
    }

    if (filters?.metric) {
      conditions.push(eq(measurements.metric, filters.metric));
    }

    if (filters?.organizationId) {
      // LEGACY DATA HANDLING:
      // Include measurements with matching organizationId OR NULL organizationId.
      // NULL organization IDs represent legacy measurements before organization tracking was implemented.
      //
      // SECURITY CONSIDERATION:
      // This means ALL organizations can see legacy (NULL) measurements. This is intentional for
      // backward compatibility, as legacy measurements were created before multi-tenant isolation.
      //
      // FUTURE IMPROVEMENT:
      // Consider backfilling organizationId for legacy measurements by associating them with
      // their team's organization. Once backfilled, remove the NULL check for stricter isolation.
      // See: docs/LEGACY_DATA_MIGRATION.md (if exists) or create a ticket for data migration.
      //
      // CURRENT BEHAVIOR:
      // - Organization A sees: measurements with org_id = A + measurements with org_id = NULL
      // - Organization B sees: measurements with org_id = B + measurements with org_id = NULL
      // - Site admins see: all measurements (allowCrossOrganization = true bypasses this filter)
      conditions.push(
        or(
          eq(measurements.organizationId, filters.organizationId),
          isNull(measurements.organizationId)
        )!
      );
    }

    if (filters?.dateFrom) {
      // Convert ISO datetime to date-only string (YYYY-MM-DD) for comparison with date column
      // PostgreSQL date column only stores date part, not time
      // Defense-in-depth: Parse and validate even though validated at route layer
      const dateOnly = parseDateFilter(filters.dateFrom);
      conditions.push(gte(measurements.date, dateOnly));
    }

    if (filters?.dateTo) {
      // Convert ISO datetime to date-only string (YYYY-MM-DD) for comparison with date column
      // PostgreSQL date column only stores date part, not time
      // Defense-in-depth: Parse and validate even though validated at route layer
      const dateOnly = parseDateFilter(filters.dateTo);
      conditions.push(lte(measurements.date, dateOnly));
    }

    if (!filters?.includeUnverified) {
      conditions.push(eq(measurements.isVerified, true));
    }

    // Team filtering (teamIds array)
    if (filters?.teamIds && filters.teamIds.length > 0) {
      conditions.push(inArray(measurements.teamId, filters.teamIds));
    }

    // Gender filtering (applied to users table)
    // Note: Gender is validated as enum at route level (Zod schema)
    if (filters?.gender) {
      conditions.push(eq(users.gender, filters.gender as "Male" | "Female" | "Not Specified"));
    }

    // Sport filtering (applied to users table with array containment)
    // PostgreSQL array operator @> checks if left array contains right array
    // SECURITY: Using Drizzle's arrayContains() function for proper parameterization
    if (filters?.sport) {
      // Validate BEFORE using in query for clarity and safety
      if (filters.sport.length > 100) {
        throw new Error('Sport parameter exceeds maximum length');
      }
      conditions.push(arrayContains(users.sports, [filters.sport]));
    }

    // Birth year filtering (applied to users table)
    // Note: Only include NULL birthDate users if explicitly requested via includeUnknownBirthYear
    // Uses EXTRACT(YEAR FROM birthDate) as birthDate is the source of truth (birthYear is computed field)
    if (filters?.birthYearFrom !== undefined && filters?.birthYearTo !== undefined) {
      // When both from and to are specified, combine them into a single OR condition
      // to avoid redundant NULL checks
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            and(
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
            )!,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(
          and(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
          )!
        );
      }
    } else if (filters?.birthYearFrom !== undefined) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`);
      }
    } else if (filters?.birthYearTo !== undefined) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`);
      }
    }

    // Age filtering (applied to measurements table)
    // Age is stored in the measurements table, calculated at measurement creation time
    if (filters?.ageFrom !== undefined && filters?.ageTo !== undefined) {
      conditions.push(
        and(
          gte(measurements.age, filters.ageFrom),
          lte(measurements.age, filters.ageTo)
        )!
      );
    } else if (filters?.ageFrom !== undefined) {
      conditions.push(gte(measurements.age, filters.ageFrom));
    } else if (filters?.ageTo !== undefined) {
      conditions.push(lte(measurements.age, filters.ageTo));
    }

    // Pagination parameters with safety limits to prevent memory exhaustion
    const limit = Math.min(filters?.limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const offset = Math.min(filters?.offset || 0, PAGINATION.MAX_OFFSET);

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Create aliases for submitter and verifier users
    const submitterUser = alias(users, 'submitter_user');
    const verifierUser = alias(users, 'verifier_user');

    // Execute query with pagination and count in parallel
    const [results, countResult] = await Promise.all([
      db.select({
        // Measurement fields
        id: measurements.id,
        userId: measurements.userId,
        submittedBy: measurements.submittedBy,
        verifiedBy: measurements.verifiedBy,
        isVerified: measurements.isVerified,
        date: measurements.date,
        age: measurements.age,
        metric: measurements.metric,
        value: measurements.value,
        units: measurements.units,
        flyInDistance: measurements.flyInDistance,
        notes: measurements.notes,
        teamId: measurements.teamId,
        teamNameSnapshot: measurements.teamNameSnapshot,
        organizationId: measurements.organizationId,
        season: measurements.season,
        teamContextAuto: measurements.teamContextAuto,
        createdAt: measurements.createdAt,
        globalAthleteId: measurements.globalAthleteId,
        // User data (athlete)
        user: sql<{
          id: string;
          firstName: string;
          lastName: string;
          fullName: string;
          birthYear: number | null;
          birthDate: string | null;
          sports: string[] | null;
          gender: string | null;
          positions: string[] | null;
        }>`jsonb_build_object(
          'id', ${users.id},
          'firstName', ${users.firstName},
          'lastName', ${users.lastName},
          'fullName', ${users.fullName},
          'birthYear', ${users.birthYear},
          'birthDate', ${users.birthDate},
          'sports', ${users.sports},
          'gender', ${users.gender},
          'positions', ${users.positions}
        )`,
        // Submitter user data
        submittedByUser: sql<{
          id: string;
          firstName: string;
          lastName: string;
          fullName: string;
        } | null>`CASE WHEN ${submitterUser.id} IS NOT NULL THEN jsonb_build_object(
          'id', ${submitterUser.id},
          'firstName', ${submitterUser.firstName},
          'lastName', ${submitterUser.lastName},
          'fullName', ${submitterUser.fullName}
        ) ELSE NULL END`,
        // Verifier user data
        verifiedByUser: sql<{
          id: string;
          firstName: string;
          lastName: string;
          fullName: string;
        } | null>`CASE WHEN ${verifierUser.id} IS NOT NULL THEN jsonb_build_object(
          'id', ${verifierUser.id},
          'firstName', ${verifierUser.firstName},
          'lastName', ${verifierUser.lastName},
          'fullName', ${verifierUser.fullName}
        ) ELSE NULL END`,
      })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .leftJoin(submitterUser, eq(measurements.submittedBy, submitterUser.id))
        .leftJoin(verifierUser, eq(measurements.verifiedBy, verifierUser.id))
        .where(whereClause)
        .orderBy(desc(measurements.date))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(whereClause)
    ]);

    const total = countResult[0]?.count || 0;

    // Enrich with team data
    const uniqueUserIds = [...new Set(results.map((r: any) => r.userId))];
    let measurementsWithTeams = results;

    // Safety check: prevent memory exhaustion from large user sets
    // This should never happen with pagination, but defensive programming is good practice
    if (uniqueUserIds.length > 10000) {
      console.warn(`getMeasurements: Large user set detected (${uniqueUserIds.length} users). Consider reducing page size.`);
    }

    if (uniqueUserIds.length > 0) {
      // Query user teams
      const allUserTeams = await db
        .select({
          userId: userTeams.userId,
          teamId: teams.id,
          teamName: teams.name,
          joinedAt: userTeams.joinedAt,
          leftAt: userTeams.leftAt,
          organizationId: organizations.id,
          organizationName: organizations.name,
        })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .innerJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(and(
          inArray(userTeams.userId, uniqueUserIds),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false)
        ));

      // Build map of userId -> teams
      const userTeamsMap = new Map<string, typeof allUserTeams>();
      allUserTeams.forEach((ut) => {
        if (!userTeamsMap.has(ut.userId)) {
          userTeamsMap.set(ut.userId, []);
        }
        userTeamsMap.get(ut.userId)!.push(ut);
      });

      // Attach teams to measurements
      measurementsWithTeams = results.map((measurement: any) => {
        const userMemberships = userTeamsMap.get(measurement.userId) || [];

        // Show currently active teams
        const activeTeams = userMemberships.filter((membership) => {
          const leftDate = membership.leftAt ? new Date(membership.leftAt) : null;
          const now = new Date();
          return (!leftDate || leftDate >= now);
        });

        const teams = activeTeams.map((membership) => ({
          id: membership.teamId,
          name: membership.teamName,
          organization: {
            id: membership.organizationId,
            name: membership.organizationName,
          },
        }));

        return {
          ...measurement,
          user: {
            ...measurement.user,
            teams,
          },
        };
      });
    }

    return {
      measurements: measurementsWithTeams,
      total,
      hasMore: offset + results.length < total,
      limit,
      offset,
    };
  }
}
