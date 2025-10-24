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
import { eq, and, gte, lte, or, isNull, sql, desc, inArray } from 'drizzle-orm';

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
        season = activeTeams[0].season ?? undefined;
        teamContextAuto = true;

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
      // teamId was explicitly provided
      teamContextAuto = false;
    }

    // If teamId is set (either auto-assigned or explicitly provided), fetch team details for snapshot
    if (teamId && !teamNameSnapshot) {
      const [team] = await db
        .select()
        .from(teams)
        .innerJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, teamId));

      if (team) {
        teamNameSnapshot = team.teams.name;
        organizationId = team.teams.organizationId;
        season = season ?? team.teams.season ?? undefined;
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
    const updateData: Partial<typeof measurements.$inferInsert> = {};

    if (measurement.userId) updateData.userId = measurement.userId;
    // submittedBy cannot be updated after creation (intentionally excluded)
    if (measurement.date) updateData.date = measurement.date;
    if (measurement.metric) updateData.metric = measurement.metric;
    if (measurement.value !== undefined)
      updateData.value = String(measurement.value);
    if (measurement.notes !== undefined) updateData.notes = measurement.notes;
    if (measurement.flyInDistance !== undefined)
      updateData.flyInDistance = measurement.flyInDistance ? String(measurement.flyInDistance) : null;

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
   * Get measurements with filters and pagination
   * @param filters Measurement filters including pagination options
   * @returns Paginated measurements with metadata
   */
  async getMeasurements(filters?: MeasurementFilters): Promise<PaginatedMeasurements> {
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
      conditions.push(eq(measurements.organizationId, filters.organizationId));
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

    // Pagination parameters with safety limits to prevent memory exhaustion
    const limit = Math.min(filters?.limit || 1000, 1000); // Default 1000, max 1000
    const offset = Math.min(filters?.offset || 0, 10000); // Cap offset at 10k to prevent expensive scans

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
        // User data
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
      })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(whereClause)
        .orderBy(desc(measurements.date))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(measurements)
        .where(whereClause)
    ]);

    const total = countResult[0]?.count || 0;

    // Enrich with team data
    const uniqueUserIds = [...new Set(results.map((r: any) => r.userId))];
    let measurementsWithTeams = results;

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
