/**
 * AnalyticsService - Handles analytics and statistics calculations
 * Refactored to use direct database access instead of storage layer
 */

import { db } from '../db';
import { measurements, teams, organizations, users, userTeams, type User } from '@shared/schema';
import { eq, and, gte, lte, ne, desc, inArray } from 'drizzle-orm';

interface AthleteStats {
  bestFly10?: number;
  bestVertical?: number;
  measurementCount: number;
}

interface TeamStats {
  teamId: string;
  teamName: string;
  organizationName: string;
  athleteCount: number;
  bestFly10?: number;
  bestVertical?: number;
  latestTest?: string;
}

interface DashboardStats {
  totalAthletes: number;
  activeAthletes: number;
  totalTeams: number;
  bestFLY10_TIMELast30Days?: { value: number; userName: string };
  bestVERTICAL_JUMPLast30Days?: { value: number; userName: string };
  bestAGILITY_505Last30Days?: { value: number; userName: string };
  bestAGILITY_5105Last30Days?: { value: number; userName: string };
  bestT_TESTLast30Days?: { value: number; userName: string };
  bestDASH_40YDLast30Days?: { value: number; userName: string };
  bestRSILast30Days?: { value: number; userName: string };
}

export class AnalyticsService {
  /**
   * Get statistics for an athlete
   * @param userId Athlete user ID
   * @returns Athlete statistics
   */
  async getAthleteStats(userId: string): Promise<AthleteStats> {
    // Get all verified measurements for the athlete
    const athleteMeasurements = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, userId),
          eq(measurements.isVerified, true)
        )
      );

    // Filter and extract FLY10_TIME values
    const fly10Times = athleteMeasurements
      .filter((m) => m.metric === 'FLY10_TIME')
      .map((m) => parseFloat(m.value));

    // Filter and extract VERTICAL_JUMP values
    const verticalJumps = athleteMeasurements
      .filter((m) => m.metric === 'VERTICAL_JUMP')
      .map((m) => parseFloat(m.value));

    return {
      bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
      bestVertical:
        verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
      measurementCount: athleteMeasurements.length,
    };
  }

  /**
   * Alias for getAthleteStats (backward compatibility)
   */
  async getUserStats(userId: string): Promise<AthleteStats> {
    return this.getAthleteStats(userId);
  }

  /**
   * Get statistics for all teams in an organization
   * @param organizationId Optional organization ID (required for security)
   * @returns Array of team statistics
   */
  async getTeamStats(organizationId?: string): Promise<TeamStats[]> {
    // Security: Always require organization context to prevent cross-org data leakage
    if (!organizationId) {
      return [];
    }

    // Get all non-archived teams for the organization
    const orgTeams = await db
      .select()
      .from(teams)
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(
        and(
          eq(teams.organizationId, organizationId),
          ne(teams.isArchived, true)
        )
      );

    // Calculate stats for each team
    const teamStats = await Promise.all(
      orgTeams.map(async ({ teams: team, organizations: org }) => {
        // Get active team members
        const teamMembers = await db
          .select()
          .from(userTeams)
          .where(
            and(
              eq(userTeams.teamId, team.id),
              eq(userTeams.isActive, true)
            )
          );

        // Get verified measurements for this team
        const teamMeasurements = await db
          .select()
          .from(measurements)
          .where(
            and(
              eq(measurements.teamId, team.id),
              eq(measurements.isVerified, true)
            )
          )
          .orderBy(desc(measurements.date));

        // Calculate best performances
        const fly10Times = teamMeasurements
          .filter((m) => m.metric === 'FLY10_TIME')
          .map((m) => parseFloat(m.value));

        const verticalJumps = teamMeasurements
          .filter((m) => m.metric === 'VERTICAL_JUMP')
          .map((m) => parseFloat(m.value));

        // Get latest measurement date
        const latestMeasurement =
          teamMeasurements.length > 0
            ? teamMeasurements[teamMeasurements.length - 1]
            : undefined;

        return {
          teamId: team.id,
          teamName: team.name,
          organizationName: org.name,
          athleteCount: teamMembers.length,
          bestFly10: fly10Times.length > 0 ? Math.min(...fly10Times) : undefined,
          bestVertical:
            verticalJumps.length > 0 ? Math.max(...verticalJumps) : undefined,
          latestTest: latestMeasurement?.date,
        };
      })
    );

    return teamStats;
  }

  /**
   * Get dashboard statistics for an organization
   * @param organizationId Optional organization ID
   * @returns Dashboard statistics
   */
  async getDashboardStats(organizationId?: string): Promise<DashboardStats> {
    // Get all athletes in the organization
    // Athletes are linked to organizations through teams
    let athletes: User[];
    if (organizationId) {
      // Get athletes through team membership
      const athleteIds = await db
        .select({ userId: userTeams.userId })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(eq(teams.organizationId, organizationId))
        .groupBy(userTeams.userId);

      const uniqueAthleteIds = [...new Set(athleteIds.map((a) => a.userId))];

      if (uniqueAthleteIds.length > 0) {
        athletes = await db
          .select()
          .from(users)
          .where(inArray(users.id, uniqueAthleteIds));
      } else {
        athletes = [];
      }
    } else {
      athletes = await db.select().from(users);
    }

    // Count total and active athletes
    const totalAthletes = athletes.length;
    const activeAthletes = athletes.filter(
      (athlete) =>
        athlete.isActive === true && athlete.password !== 'INVITATION_PENDING'
    ).length;

    // Get all non-archived teams
    const teamConditions = [ne(teams.isArchived, true)];
    if (organizationId) {
      teamConditions.push(eq(teams.organizationId, organizationId));
    }

    const orgTeams = await db
      .select()
      .from(teams)
      .where(and(...teamConditions));

    const totalTeams = orgTeams.length;

    // Get measurements from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const today = new Date();

    const measurementConditions = [
      gte(measurements.date, thirtyDaysAgo.toISOString()),
      lte(measurements.date, today.toISOString()),
      eq(measurements.isVerified, true),
    ];

    // Filter by organization through team membership
    let recentMeasurements: Array<{ metric: string; value: string; userId: string }>;
    if (organizationId) {
      // Get measurements for athletes in the organization
      const orgAthleteIds = athletes.map((a) => a.id);
      if (orgAthleteIds.length > 0) {
        recentMeasurements = await db
          .select({
            metric: measurements.metric,
            value: measurements.value,
            userId: measurements.userId,
          })
          .from(measurements)
          .where(
            and(
              ...measurementConditions,
              inArray(measurements.userId, orgAthleteIds)
            )
          );
      } else {
        recentMeasurements = [];
      }
    } else {
      recentMeasurements = await db
        .select({
          metric: measurements.metric,
          value: measurements.value,
          userId: measurements.userId,
        })
        .from(measurements)
        .where(and(...measurementConditions));
    }

    // Get user names for measurements
    const measurementsWithUsers = await Promise.all(
      recentMeasurements.map(async (m) => {
        const [user] = await db
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, m.userId));
        return {
          ...m,
          userName: user?.fullName || 'Unknown',
        };
      })
    );

    // Define metrics and whether lower is better
    const metrics = [
      { key: 'FLY10_TIME', lowerIsBetter: true },
      { key: 'VERTICAL_JUMP', lowerIsBetter: false },
      { key: 'AGILITY_505', lowerIsBetter: true },
      { key: 'AGILITY_5105', lowerIsBetter: true },
      { key: 'T_TEST', lowerIsBetter: true },
      { key: 'DASH_40YD', lowerIsBetter: true },
      { key: 'RSI', lowerIsBetter: false },
    ];

    // Calculate best for each metric
    const bestMetrics: any = {
      totalAthletes,
      activeAthletes,
      totalTeams,
    };

    metrics.forEach(({ key, lowerIsBetter }) => {
      const metricMeasurements = measurementsWithUsers
        .filter((m) => m.metric === key)
        .map((m) => ({ value: parseFloat(m.value), userName: m.userName }));

      if (metricMeasurements.length > 0) {
        const bestResult = lowerIsBetter
          ? metricMeasurements.reduce((best, current) =>
              current.value < best.value ? current : best
            )
          : metricMeasurements.reduce((best, current) =>
              current.value > best.value ? current : best
            );

        bestMetrics[`best${key}Last30Days`] = bestResult;
      }
    });

    return bestMetrics;
  }
}
