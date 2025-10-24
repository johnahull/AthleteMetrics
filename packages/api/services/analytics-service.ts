/**
 * AnalyticsService - Handles analytics and statistics calculations
 * Refactored to use direct database access instead of storage layer
 */

import { db } from '../db';
import { measurements, teams, organizations, users, userTeams, VALID_METRICS, INVITATION_PENDING_PASSWORD } from '@shared/schema';
import { eq, and, gte, lte, ne, desc, inArray, sql } from 'drizzle-orm';

/**
 * Dashboard statistics time window
 * Defines how many days back to look for "recent" measurements
 * @default 30 days
 */
const DASHBOARD_STATS_WINDOW_DAYS = 30;

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
      .map((m) => parseFloat(m.value))
      .filter((v) => !isNaN(v) && isFinite(v)); // Validate numeric values

    // Filter and extract VERTICAL_JUMP values
    const verticalJumps = athleteMeasurements
      .filter((m) => m.metric === 'VERTICAL_JUMP')
      .map((m) => parseFloat(m.value))
      .filter((v) => !isNaN(v) && isFinite(v)); // Validate numeric values

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
   * @throws Error if organizationId is not provided
   */
  async getTeamStats(organizationId?: string): Promise<TeamStats[]> {
    // Security: Always require organization context to prevent cross-org data leakage
    if (!organizationId) {
      throw new Error('organizationId is required for team statistics');
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

    // Batch fetch all team members and measurements to avoid N+1 queries
    const allTeamIds = orgTeams.map(({ teams: team }) => team.id);

    const [allTeamMembers, allTeamMeasurements] = await Promise.all([
      // Fetch all team members in one query
      db
        .select()
        .from(userTeams)
        .where(
          and(
            inArray(userTeams.teamId, allTeamIds),
            eq(userTeams.isActive, true)
          )
        ),
      // Fetch all team measurements in one query
      db
        .select()
        .from(measurements)
        .where(
          and(
            inArray(measurements.teamId, allTeamIds),
            eq(measurements.isVerified, true)
          )
        )
        .orderBy(desc(measurements.date))
    ]);

    // Group data by teamId for fast lookup
    const membersByTeam = allTeamMembers.reduce((acc, member) => {
      if (!acc[member.teamId]) acc[member.teamId] = [];
      acc[member.teamId].push(member);
      return acc;
    }, {} as Record<string, typeof allTeamMembers>);

    const measurementsByTeam = allTeamMeasurements.reduce((acc, m) => {
      if (m.teamId) {
        if (!acc[m.teamId]) acc[m.teamId] = [];
        acc[m.teamId].push(m);
      }
      return acc;
    }, {} as Record<string, typeof allTeamMeasurements>);

    // Calculate stats for each team using pre-fetched data
    const teamStats = orgTeams.map(({ teams: team, organizations: org }) => {
        const teamMembers = membersByTeam[team.id] || [];
        const teamMeasurements = measurementsByTeam[team.id] || [];

        // Calculate best performances
        const fly10Times = teamMeasurements
          .filter((m) => m.metric === 'FLY10_TIME')
          .map((m) => parseFloat(m.value));

        const verticalJumps = teamMeasurements
          .filter((m) => m.metric === 'VERTICAL_JUMP')
          .map((m) => parseFloat(m.value));

        // Get latest measurement date (first element since ordered DESC by date)
        const latestMeasurement =
          teamMeasurements.length > 0
            ? teamMeasurements[0]
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
      });

    return teamStats;
  }

  /**
   * Get dashboard statistics for an organization
   * @param organizationId Optional organization ID
   * @returns Dashboard statistics
   */
  async getDashboardStats(organizationId?: string): Promise<DashboardStats> {
    // Get all athletes in the organization
    // Get athlete counts using database-level filtering (more efficient than application-level)
    let totalAthletes: number;
    let activeAthletes: number;
    let cachedAthleteIds: string[] | undefined; // Cache athlete IDs to avoid duplicate query

    if (organizationId) {
      // Get athlete IDs through team membership
      const athleteIds = await db
        .select({ userId: userTeams.userId })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(eq(teams.organizationId, organizationId))
        .groupBy(userTeams.userId);

      const uniqueAthleteIds = [...new Set(athleteIds.map((a) => a.userId))];
      cachedAthleteIds = uniqueAthleteIds; // Cache for reuse in measurement query

      if (uniqueAthleteIds.length > 0) {
        // Execute both counts in parallel using database filtering
        const [totalCount, activeCount] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(inArray(users.id, uniqueAthleteIds)),
          db.select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(and(
              inArray(users.id, uniqueAthleteIds),
              eq(users.isActive, true),
              ne(users.password, INVITATION_PENDING_PASSWORD)
            ))
        ]);

        totalAthletes = totalCount[0]?.count || 0;
        activeAthletes = activeCount[0]?.count || 0;
      } else {
        totalAthletes = 0;
        activeAthletes = 0;
      }
    } else {
      // Site-wide counts using database filtering
      const [totalCount, activeCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(users),
        db.select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(and(
            eq(users.isActive, true),
            ne(users.password, INVITATION_PENDING_PASSWORD)
          ))
      ]);

      totalAthletes = totalCount[0]?.count || 0;
      activeAthletes = activeCount[0]?.count || 0;
    }

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

    // Get measurements from last N days (configurable via DASHBOARD_STATS_WINDOW_DAYS)
    const windowStartDate = new Date();
    windowStartDate.setDate(windowStartDate.getDate() - DASHBOARD_STATS_WINDOW_DAYS);
    const today = new Date();

    const measurementConditions = [
      gte(measurements.date, windowStartDate.toISOString()),
      lte(measurements.date, today.toISOString()),
      eq(measurements.isVerified, true),
    ];

    // Filter by organization through team membership
    // Use JOIN to get user names in a single query (fixes N+1 query issue)
    let measurementsWithUsers: Array<{ metric: string; value: string; userId: string; userName: string }>;
    if (organizationId) {
      // Reuse cached athlete IDs from earlier query (prevents duplicate database query)
      if (cachedAthleteIds && cachedAthleteIds.length > 0) {
        measurementsWithUsers = await db
          .select({
            metric: measurements.metric,
            value: measurements.value,
            userId: measurements.userId,
            userName: users.fullName,
          })
          .from(measurements)
          .innerJoin(users, eq(measurements.userId, users.id))
          .where(
            and(
              ...measurementConditions,
              inArray(measurements.userId, cachedAthleteIds)
            )
          );
      } else {
        measurementsWithUsers = [];
      }
    } else {
      measurementsWithUsers = await db
        .select({
          metric: measurements.metric,
          value: measurements.value,
          userId: measurements.userId,
          userName: users.fullName,
        })
        .from(measurements)
        .innerJoin(users, eq(measurements.userId, users.id))
        .where(and(...measurementConditions));
    }

    // Calculate best for each metric using SQL aggregation (much faster than JavaScript reduce)
    const bestMetrics: Record<string, any> = {
      totalAthletes,
      activeAthletes,
      totalTeams,
    };

    // Optimized: Single query for all metrics using CASE WHEN
    // This eliminates N+1 query pattern (7 queries -> 1 query)
    // Database Index: idx_measurements_org_date_metric_verified (organization_id, date DESC, metric, is_verified)
    // See: migrations/0020_add_measurements_org_metric_analytics_index.sql
    const metricBests = await db
      .select({
        metric: measurements.metric,
        userId: users.id,
        userName: users.fullName,
        bestValue: sql<number>`
          CASE
            WHEN ${measurements.metric} IN ('FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD')
            THEN MIN(CAST(${measurements.value} AS NUMERIC))::float
            ELSE MAX(CAST(${measurements.value} AS NUMERIC))::float
          END
        `,
      })
      .from(measurements)
      .innerJoin(users, eq(measurements.userId, users.id))
      .where(
        and(
          ...measurementConditions,
          inArray(measurements.metric, VALID_METRICS.map(m => m.key)),
          ...(organizationId && cachedAthleteIds && cachedAthleteIds.length > 0
            ? [inArray(measurements.userId, cachedAthleteIds)]
            : [])
        )
      )
      .groupBy(measurements.metric, users.id, users.fullName);

    // Post-process: find best for each metric
    const metricMap = new Map<string, { lowerIsBetter: boolean }>();
    VALID_METRICS.forEach(m => metricMap.set(m.key, { lowerIsBetter: m.lowerIsBetter }));

    const bestByMetric = new Map<string, { value: number; userName: string }>();

    metricBests.forEach(result => {
      const metricInfo = metricMap.get(result.metric);
      if (!metricInfo) return;

      const existing = bestByMetric.get(result.metric);
      const isBetter = !existing ||
        (metricInfo.lowerIsBetter ? result.bestValue < existing.value : result.bestValue > existing.value);

      if (isBetter) {
        bestByMetric.set(result.metric, {
          value: result.bestValue,
          userName: result.userName,
        });
      }
    });

    // Populate results
    bestByMetric.forEach((best, metric) => {
      bestMetrics[`best${metric}Last30Days`] = best;
    });

    return bestMetrics as DashboardStats;
  }
}
