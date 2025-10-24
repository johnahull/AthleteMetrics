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
import { db } from '../db';
import { eq, and, gte, lte, or, isNull, sql } from 'drizzle-orm';

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
          lte(userTeams.joinedAt, measurementDate),
          or(isNull(userTeams.leftAt), gte(userTeams.leftAt, measurementDate)),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false) // Only include non-archived teams
        )
      );

    return activeTeams;
  }

  /**
   * Create a new measurement with auto-calculated fields
   * @param measurement Measurement data
   * @param submittedBy User ID of submitter
   * @returns Created measurement
   */
  async createMeasurement(
    measurement: InsertMeasurement,
    submittedBy: string
  ): Promise<Measurement> {
    // Get user info for age calculation
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, measurement.userId));

    if (!user) throw new Error('User not found');

    const measurementDate = new Date(measurement.date);
    let age = measurementDate.getFullYear() - (user.birthYear || 0);

    // Use birthDate for more precise age calculation if available
    if (user.birthDate) {
      const birthDate = new Date(user.birthDate);
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
      // Get athlete's active teams at measurement date
      const activeTeams = await this.getAthleteActiveTeamsAtDate(
        measurement.userId,
        measurementDate
      );

      if (activeTeams.length === 1) {
        // Single team - auto-assign
        teamId = activeTeams[0].teamId;
        season = activeTeams[0].season || undefined;
        teamContextAuto = true;

        // Fetch team details for snapshot
        const [team] = await db
          .select()
          .from(teams)
          .innerJoin(organizations, eq(teams.organizationId, organizations.id))
          .where(eq(teams.id, teamId));

        if (team) {
          teamNameSnapshot = team.teams.name;
          organizationId = team.teams.organizationId;
        }

        console.log(
          `Auto-assigned measurement to team: ${activeTeams[0].teamName} (${
            season || 'no season'
          })`
        );
      } else if (activeTeams.length > 1) {
        // Multiple teams - cannot auto-assign
        console.log(
          `Athlete is on ${activeTeams.length} teams - team context not auto-assigned`
        );
        teamContextAuto = false;
      } else {
        // No active teams
        console.log('No active teams - measurement without team context');
        teamContextAuto = false;
      }
    } else {
      // Explicit teamId provided
      teamContextAuto = false;
      const [team] = await db
        .select()
        .from(teams)
        .innerJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, teamId));

      if (team) {
        teamNameSnapshot = team.teams.name;
        organizationId = team.teams.organizationId;
        season = season || team.teams.season || undefined;
      }
    }

    // Create measurement
    const [newMeasurement] = await db
      .insert(measurements)
      .values({
        userId: measurement.userId,
        submittedBy,
        date: measurementDate.toISOString(),
        metric: measurement.metric,
        value: measurement.value.toString(),
        units,
        age,
        notes: measurement.notes || null,
        flyInDistance: measurement.flyInDistance?.toString() || null,
        teamId: teamId || null,
        season: season || null,
        teamContextAuto,
        teamNameSnapshot,
        organizationId: organizationId || null,
        isVerified: false,
      })
      .returning();

    return newMeasurement;
  }

  /**
   * Update measurement fields
   * Note: submittedBy cannot be updated after creation
   * @param id Measurement ID
   * @param measurement Partial measurement data
   * @returns Updated measurement
   */
  async updateMeasurement(
    id: string,
    measurement: Partial<InsertMeasurement>
  ): Promise<Measurement> {
    const updateData: any = {};

    if (measurement.userId) updateData.userId = measurement.userId;
    // submittedBy cannot be updated after creation (intentionally excluded)
    if (measurement.date) updateData.date = measurement.date;
    if (measurement.metric) updateData.metric = measurement.metric;
    if (measurement.value !== undefined)
      updateData.value = measurement.value.toString();
    if (measurement.notes !== undefined) updateData.notes = measurement.notes;
    if (measurement.flyInDistance !== undefined)
      updateData.flyInDistance = measurement.flyInDistance?.toString();

    // Check if there are any valid fields to update
    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const [updated] = await db
      .update(measurements)
      .set(updateData)
      .where(eq(measurements.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete a measurement
   * @param id Measurement ID
   */
  async deleteMeasurement(id: string): Promise<void> {
    await db.delete(measurements).where(eq(measurements.id, id));
  }

  /**
   * Mark measurement as verified
   * @param id Measurement ID
   * @param verifiedBy User ID of verifier
   * @returns Updated measurement
   */
  async verifyMeasurement(id: string, verifiedBy: string): Promise<Measurement> {
    const [updated] = await db
      .update(measurements)
      .set({
        isVerified: true,
        verifiedBy,
      })
      .where(eq(measurements.id, id))
      .returning();

    return updated;
  }

  /**
   * Get measurements with filters
   * @param filters Measurement filters
   * @returns Array of measurements
   */
  async getMeasurements(filters?: MeasurementFilters): Promise<any[]> {
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

    if (filters?.dateFrom) {
      conditions.push(gte(measurements.date, new Date(filters.dateFrom).toISOString()));
    }

    if (filters?.dateTo) {
      conditions.push(lte(measurements.date, new Date(filters.dateTo).toISOString()));
    }

    if (!filters?.includeUnverified) {
      conditions.push(eq(measurements.isVerified, true));
    }

    // Build and execute query
    let query = db.select().from(measurements);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results;
  }
}
