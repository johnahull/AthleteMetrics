/**
 * AnalyticsService - Handles analytics and statistics calculations
 * Refactored to use direct database access instead of storage layer
 */

import { db } from '../db';
import { measurements, teams, organizations, users, userTeams, siteMetrics, VALID_METRICS, INVITATION_PENDING_PASSWORD } from '@shared/schema';
import { eq, and, gte, lte, lt, ne, desc, inArray, sql } from 'drizzle-orm';
import { getAthleteIdsForScope } from '../utils/athlete-filters';

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

interface WeeklyTrendDataPoint {
  weekStart: string;
  metric: string;
  bestValue: number;
}

interface LeaderboardEntry {
  rank: number;
  athleteId: string;
  athleteName: string;
  teamId: string | null;
  teamName: string | null;
  value: number;
  percentile: number;
  isPersonalBest: boolean;
}

interface LeaderboardResponse {
  rankings: LeaderboardEntry[];
  totalAthletes: number;
  metric: string;
  metricLabel: string;
  metricType: 'lower_is_better' | 'higher_is_better' | 'tracking';
}

interface MostImprovedEntry {
  athleteId: string;
  athleteName: string;
  teamId: string | null;
  teamName: string | null;
  previousValue: number;
  currentValue: number;
  improvementPercent: number;
  measurementCount: number;
  hasPersonalBest: boolean;
}

interface MostImprovedResponse {
  improvements: MostImprovedEntry[];
  totalAthletes: number;
  metric: string;
  metricLabel: string;
  metricType: 'lower_is_better' | 'higher_is_better' | 'tracking';
}

interface PerformanceTrendsData {
  weeks: string[];
  metrics: {
    [metricKey: string]: (number | null)[];
  };
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
   * Get dashboard statistics for an organization, optionally filtered by team or athlete
   * @param organizationId Optional organization ID
   * @param options Optional filter options
   * @param options.teamId Filter to a specific team
   * @param options.athleteId Filter to a specific athlete (requires teamId)
   * @param options.startDate Optional start date for measurement filtering (defaults to 30 days ago)
   * @param options.endDate Optional end date for measurement filtering (defaults to today)
   * @returns Dashboard statistics
   */
  async getDashboardStats(
    organizationId?: string,
    options?: {
      teamId?: string;
      athleteId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<DashboardStats> {
    const { teamId, athleteId, startDate, endDate } = options || {};
    // Get all athletes in the organization (or filtered by team/athlete)
    // Get athlete counts using database-level filtering (more efficient than application-level)
    let totalAthletes: number;
    let activeAthletes: number;
    let cachedAthleteIds: string[] | undefined; // Cache athlete IDs to avoid duplicate query

    if (organizationId) {
      // If filtering by specific athlete, short-circuit to just that athlete
      if (athleteId) {
        cachedAthleteIds = [athleteId];
      } else {
        // Use helper to get athlete IDs for scope (org or team)
        cachedAthleteIds = await getAthleteIdsForScope(organizationId, teamId);
      }

      if (cachedAthleteIds.length > 0) {
        // Execute both counts in parallel using database filtering
        const [totalCount, activeCount] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(inArray(users.id, cachedAthleteIds)),
          db.select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(and(
              inArray(users.id, cachedAthleteIds),
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

    // Get team count (respects team/athlete filter)
    let totalTeams: number;
    if (teamId) {
      // If filtering by specific team, count is 1
      totalTeams = 1;
    } else {
      // Get all non-archived teams for the organization
      const teamConditions = [ne(teams.isArchived, true)];
      if (organizationId) {
        teamConditions.push(eq(teams.organizationId, organizationId));
      }

      const orgTeams = await db
        .select()
        .from(teams)
        .where(and(...teamConditions));

      totalTeams = orgTeams.length;
    }

    // Get measurements from specified date range or default to last N days
    // If custom dates provided, use them; otherwise default to last 30 days
    const windowStartDate = startDate || (() => {
      const date = new Date();
      date.setDate(date.getDate() - DASHBOARD_STATS_WINDOW_DAYS);
      return date;
    })();
    const windowEndDate = endDate || new Date();

    const measurementConditions = [
      gte(measurements.date, windowStartDate.toISOString()),
      lte(measurements.date, windowEndDate.toISOString()),
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

    // Optimized: Single query for all metrics using CASE WHEN with dynamic metric_type lookup
    // This eliminates N+1 query pattern (7 queries -> 1 query)
    // Database Index: idx_measurements_org_date_metric_verified (organization_id, date DESC, metric, is_verified)
    // See: migrations/0020_add_measurements_org_metric_analytics_index.sql
    //
    // Note: Tracking metrics (HEIGHT, WEIGHT) are excluded from dashboard best stats (filtered in post-processing)
    // The query uses JOIN with site_metrics to dynamically determine MIN/MAX based on metric_type column
    const metricBests = await db
      .select({
        metric: measurements.metric,
        userId: users.id,
        userName: users.fullName,
        bestValue: sql<number>`
          CASE
            WHEN ${siteMetrics.metricType} = 'lower_is_better'
            THEN MIN(CAST(${measurements.value} AS NUMERIC))::float
            ELSE MAX(CAST(${measurements.value} AS NUMERIC))::float
          END
        `,
      })
      .from(measurements)
      .innerJoin(users, eq(measurements.userId, users.id))
      .innerJoin(siteMetrics, eq(measurements.metric, siteMetrics.code))
      .where(
        and(
          ...measurementConditions,
          inArray(measurements.metric, VALID_METRICS.map(m => m.key)),
          ...(organizationId && cachedAthleteIds && cachedAthleteIds.length > 0
            ? [inArray(measurements.userId, cachedAthleteIds)]
            : [])
        )
      )
      .groupBy(measurements.metric, users.id, users.fullName, siteMetrics.metricType);

    // Post-process: find best for each metric
    const metricMap = new Map<string, { metricType: string }>();
    VALID_METRICS.forEach(m => metricMap.set(m.key, { metricType: m.metricType }));

    const bestByMetric = new Map<string, { value: number; userName: string }>();

    metricBests.forEach(result => {
      const metricInfo = metricMap.get(result.metric);
      if (!metricInfo) return;

      // Exclude tracking metrics from "best athlete" comparisons
      // Tracking metrics (HEIGHT, WEIGHT) have no performance direction
      if (metricInfo.metricType === 'tracking') return;

      const existing = bestByMetric.get(result.metric);
      const lowerIsBetter = metricInfo.metricType === 'lower_is_better';
      const isBetter = !existing ||
        (lowerIsBetter ? result.bestValue < existing.value : result.bestValue > existing.value);

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

  /**
   * Get weekly performance trends for specified metrics
   * Returns best measurement per week, aggregated server-side for efficiency
   * @param organizationId Organization to filter by
   * @param dateFrom Start date for trend analysis
   * @param metrics Array of metric keys to include (defaults to FLY10_TIME and VERTICAL_JUMP)
   * @returns Weekly trend data with best values per metric per week
   */
  async getPerformanceTrends(
    organizationId: string,
    dateFrom: Date,
    metrics: string[] = ['FLY10_TIME', 'VERTICAL_JUMP'],
    options?: { teamId?: string; athleteId?: string }
  ): Promise<PerformanceTrendsData> {
    // Get athlete IDs based on filter scope
    let uniqueAthleteIds: string[];

    if (options?.athleteId) {
      // Filter to specific athlete
      uniqueAthleteIds = [options.athleteId];
    } else {
      // Use helper to get athlete IDs for scope (org or team)
      uniqueAthleteIds = await getAthleteIdsForScope(organizationId, options?.teamId);
    }

    if (uniqueAthleteIds.length === 0) {
      // No athletes found, return empty data
      return { weeks: [], metrics: {} };
    }

    // Query measurements grouped by week with best values per metric
    // Uses PostgreSQL's date_trunc to group by week (starting Monday)
    // Dynamic metric_type lookup via JOIN ensures correct aggregation (MIN for lower_is_better, MAX for others)
    // For tracking metrics, MAX approximates "latest" within the week (acceptable since frontend filters by date)
    const weeklyData = await db
      .select({
        weekStart: sql<string>`date_trunc('week', ${measurements.date}::date)::date::text`,
        metric: measurements.metric,
        bestValue: sql<number>`
          CASE
            WHEN ${siteMetrics.metricType} = 'lower_is_better'
            THEN MIN(CAST(${measurements.value} AS NUMERIC))::float
            ELSE MAX(CAST(${measurements.value} AS NUMERIC))::float
          END
        `,
      })
      .from(measurements)
      .innerJoin(siteMetrics, eq(measurements.metric, siteMetrics.code))
      .where(
        and(
          gte(measurements.date, dateFrom.toISOString()),
          inArray(measurements.userId, uniqueAthleteIds),
          inArray(measurements.metric, metrics),
          eq(measurements.isVerified, true)
        )
      )
      .groupBy(
        sql`date_trunc('week', ${measurements.date}::date)`,
        measurements.metric,
        siteMetrics.metricType
      )
      .orderBy(sql`date_trunc('week', ${measurements.date}::date)`);

    // Transform data into chart-friendly format
    const weeksSet = new Set<string>();
    const metricData = new Map<string, Map<string, number>>();

    weeklyData.forEach(row => {
      weeksSet.add(row.weekStart);
      if (!metricData.has(row.metric)) {
        metricData.set(row.metric, new Map());
      }
      metricData.get(row.metric)!.set(row.weekStart, row.bestValue);
    });

    const weeks = Array.from(weeksSet).sort();
    const metricsOutput: { [metricKey: string]: (number | null)[] } = {};

    metrics.forEach(metric => {
      const metricValues = metricData.get(metric);
      metricsOutput[metric] = weeks.map(week =>
        metricValues?.get(week) ?? null
      );
    });

    return {
      weeks,
      metrics: metricsOutput,
    };
  }

  /**
   * Get leaderboard rankings for a specific metric
   * Returns top performers with percentile rankings
   * @param organizationId Organization to filter by
   * @param metric Metric code (e.g., FLY10_TIME, VERTICAL_JUMP)
   * @param options Filter options
   * @returns Leaderboard data with rankings and percentiles
   */
  async getLeaderboard(
    organizationId: string,
    metric: string,
    options?: {
      teamId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<LeaderboardResponse> {
    const { teamId, startDate, endDate, limit = 10 } = options || {};

    // Get metric info for display and sorting direction
    const metricInfo = await db
      .select({
        code: siteMetrics.code,
        label: siteMetrics.label,
        metricType: siteMetrics.metricType,
      })
      .from(siteMetrics)
      .where(eq(siteMetrics.code, metric))
      .limit(1);

    if (metricInfo.length === 0) {
      throw new Error(`Invalid metric: ${metric}`);
    }

    const { label: metricLabel, metricType } = metricInfo[0];
    const lowerIsBetter = metricType === 'lower_is_better';

    // Get athlete IDs based on scope
    const athleteIds = await getAthleteIdsForScope(organizationId, teamId);

    if (athleteIds.length === 0) {
      return {
        rankings: [],
        totalAthletes: 0,
        metric,
        metricLabel,
        metricType: metricType as 'lower_is_better' | 'higher_is_better' | 'tracking',
      };
    }

    // Build date filter conditions
    const dateConditions = [];
    if (startDate) {
      dateConditions.push(gte(measurements.date, startDate.toISOString().split('T')[0]));
    }
    if (endDate) {
      dateConditions.push(lte(measurements.date, endDate.toISOString().split('T')[0]));
    }

    // Get best measurement per athlete for the metric
    const bestPerAthlete = await db
      .select({
        athleteId: measurements.userId,
        athleteName: users.fullName,
        bestValue: lowerIsBetter
          ? sql<number>`MIN(CAST(${measurements.value} AS NUMERIC))::float`
          : sql<number>`MAX(CAST(${measurements.value} AS NUMERIC))::float`,
      })
      .from(measurements)
      .innerJoin(users, eq(measurements.userId, users.id))
      .where(
        and(
          inArray(measurements.userId, athleteIds),
          eq(measurements.metric, metric),
          eq(measurements.isVerified, true),
          ...dateConditions
        )
      )
      .groupBy(measurements.userId, users.fullName);

    // Sort by best value (ascending for lower_is_better, descending otherwise)
    const sorted = bestPerAthlete.sort((a, b) => {
      return lowerIsBetter
        ? a.bestValue - b.bestValue
        : b.bestValue - a.bestValue;
    });

    const totalAthletes = sorted.length;

    // Get team info for each athlete
    const athleteTeamInfo = await db
      .select({
        userId: userTeams.userId,
        teamId: teams.id,
        teamName: teams.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(
        and(
          inArray(userTeams.userId, sorted.slice(0, limit).map(s => s.athleteId)),
          eq(userTeams.isActive, true),
          ...(teamId ? [eq(userTeams.teamId, teamId)] : [eq(teams.organizationId, organizationId)])
        )
      );

    // Create a map of athlete -> team info (use first team if multiple)
    const teamMap = new Map<string, { teamId: string; teamName: string }>();
    athleteTeamInfo.forEach(info => {
      if (!teamMap.has(info.userId)) {
        teamMap.set(info.userId, { teamId: info.teamId, teamName: info.teamName });
      }
    });

    // Get all-time personal bests to check if current best is a PR
    const allTimeBests = await db
      .select({
        athleteId: measurements.userId,
        allTimeBest: lowerIsBetter
          ? sql<number>`MIN(CAST(${measurements.value} AS NUMERIC))::float`
          : sql<number>`MAX(CAST(${measurements.value} AS NUMERIC))::float`,
      })
      .from(measurements)
      .where(
        and(
          inArray(measurements.userId, sorted.slice(0, limit).map(s => s.athleteId)),
          eq(measurements.metric, metric),
          eq(measurements.isVerified, true)
        )
      )
      .groupBy(measurements.userId);

    const allTimeBestMap = new Map<string, number>();
    allTimeBests.forEach(b => allTimeBestMap.set(b.athleteId, b.allTimeBest));

    // Build rankings with percentile
    const rankings: LeaderboardEntry[] = sorted.slice(0, limit).map((entry, index) => {
      const rank = index + 1;
      // Percentile: rank 1 of 100 = 99th percentile (top 1%)
      const percentile = totalAthletes > 1
        ? Math.round((1 - (rank - 1) / (totalAthletes - 1)) * 100)
        : 100;

      const teamInfo = teamMap.get(entry.athleteId);
      const allTimeBest = allTimeBestMap.get(entry.athleteId);

      // Check if current best equals all-time best (is a personal record)
      const isPersonalBest = allTimeBest !== undefined &&
        Math.abs(entry.bestValue - allTimeBest) < 0.001;

      return {
        rank,
        athleteId: entry.athleteId,
        athleteName: entry.athleteName,
        teamId: teamInfo?.teamId || null,
        teamName: teamInfo?.teamName || null,
        value: entry.bestValue,
        percentile,
        isPersonalBest,
      };
    });

    return {
      rankings,
      totalAthletes,
      metric,
      metricLabel,
      metricType: metricType as 'lower_is_better' | 'higher_is_better' | 'tracking',
    };
  }

  /**
   * Get most improved athletes for a specific metric
   * Compares first measurement in period to best measurement in period
   * Requires minimum 2 measurements to qualify
   */
  async getMostImproved(
    organizationId: string,
    metric: string,
    options?: {
      teamId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<MostImprovedResponse> {
    const { teamId, startDate, endDate, limit = 5 } = options || {};

    // Get metric info for display and sorting direction
    const metricInfo = await db
      .select({
        code: siteMetrics.code,
        label: siteMetrics.label,
        metricType: siteMetrics.metricType,
      })
      .from(siteMetrics)
      .where(eq(siteMetrics.code, metric))
      .limit(1);

    if (metricInfo.length === 0) {
      throw new Error(`Invalid metric: ${metric}`);
    }

    const { label: metricLabel, metricType } = metricInfo[0];
    const lowerIsBetter = metricType === 'lower_is_better';

    // Get athlete IDs based on scope
    const athleteIds = await getAthleteIdsForScope(organizationId, teamId);

    if (athleteIds.length === 0) {
      return {
        improvements: [],
        totalAthletes: 0,
        metric,
        metricLabel,
        metricType: metricType as 'lower_is_better' | 'higher_is_better' | 'tracking',
      };
    }

    // Use SQL window functions to calculate improvement in database
    // Build date filter conditions for SQL
    const startDateStr = startDate ? startDate.toISOString().split('T')[0] : null;
    const endDateStr = endDate ? endDate.toISOString().split('T')[0] : null;

    const improvementQuery = sql<{
      athleteId: string;
      previousValue: number;
      currentValue: number;
      improvementPercent: number;
      measurementCount: number;
    }>`
      WITH ordered_measurements AS (
        SELECT
          user_id as athlete_id,
          CAST(value AS NUMERIC) as value,
          date,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date ASC) as first_row,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date DESC) as last_row
        FROM measurements
        WHERE user_id = ANY(${athleteIds})
          AND metric = ${metric}
          AND is_verified = true
          ${startDateStr ? sql`AND date >= ${startDateStr}` : sql``}
          ${endDateStr ? sql`AND date < ${endDateStr}` : sql``}
      ),
      athlete_stats AS (
        SELECT
          athlete_id,
          MIN(CASE WHEN first_row = 1 THEN value END) as first_value,
          ${lowerIsBetter
            ? sql`MIN(value)`
            : sql`MAX(value)`
          } as best_value,
          COUNT(*) as measurement_count
        FROM ordered_measurements
        GROUP BY athlete_id
        HAVING COUNT(*) >= 2
      )
      SELECT
        athlete_id::text as "athleteId",
        first_value::float as "previousValue",
        best_value::float as "currentValue",
        ${lowerIsBetter
          ? sql`((first_value - best_value) / NULLIF(first_value, 0)) * 100`
          : sql`((best_value - first_value) / NULLIF(first_value, 0)) * 100`
        }::float as "improvementPercent",
        measurement_count::int as "measurementCount"
      FROM athlete_stats
      WHERE first_value > 0
        AND ${lowerIsBetter
          ? sql`((first_value - best_value) / first_value) * 100`
          : sql`((best_value - first_value) / first_value) * 100`
        } > 0
      ORDER BY "improvementPercent" DESC
      LIMIT ${limit}
    `;

    const topImprovements = await db.execute(improvementQuery) as any[];

    if (topImprovements.length === 0) {
      return {
        improvements: [],
        totalAthletes: 0,
        metric,
        metricLabel,
        metricType: metricType as 'lower_is_better' | 'higher_is_better' | 'tracking',
      };
    }

    // Get athlete info
    const topAthleteIds = topImprovements.map((i: any) => i.athleteId);
    const athleteInfo = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.id, topAthleteIds));

    const athleteMap = new Map<string, string>();
    athleteInfo.forEach(a => athleteMap.set(a.id, `${a.firstName} ${a.lastName}`));

    // Get team info for athletes
    const athleteTeamInfo = await db
      .select({
        userId: userTeams.userId,
        teamId: teams.id,
        teamName: teams.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(
        and(
          inArray(userTeams.userId, topAthleteIds),
          eq(userTeams.isActive, true)
        )
      );

    const teamMap = new Map<string, { teamId: string; teamName: string }>();
    athleteTeamInfo.forEach(info => {
      if (!teamMap.has(info.userId)) {
        teamMap.set(info.userId, { teamId: info.teamId, teamName: info.teamName });
      }
    });

    // Get all-time personal bests to check if current best is a PR
    const allTimeBests = await db
      .select({
        athleteId: measurements.userId,
        allTimeBest: lowerIsBetter
          ? sql<number>`MIN(CAST(${measurements.value} AS NUMERIC))::float`
          : sql<number>`MAX(CAST(${measurements.value} AS NUMERIC))::float`,
      })
      .from(measurements)
      .where(
        and(
          inArray(measurements.userId, topAthleteIds),
          eq(measurements.metric, metric),
          eq(measurements.isVerified, true)
        )
      )
      .groupBy(measurements.userId);

    const allTimeBestMap = new Map<string, number>();
    allTimeBests.forEach(b => allTimeBestMap.set(b.athleteId, b.allTimeBest));

    // Build response
    const result: MostImprovedEntry[] = topImprovements.map((entry: any) => {
      const teamInfo = teamMap.get(entry.athleteId);
      const allTimeBest = allTimeBestMap.get(entry.athleteId);
      const hasPersonalBest = allTimeBest !== undefined &&
        Math.abs(entry.currentValue - allTimeBest) < 0.001;

      return {
        athleteId: entry.athleteId,
        athleteName: athleteMap.get(entry.athleteId) || 'Unknown',
        teamId: teamInfo?.teamId || null,
        teamName: teamInfo?.teamName || null,
        previousValue: entry.previousValue,
        currentValue: entry.currentValue,
        improvementPercent: Math.round(entry.improvementPercent * 100) / 100,
        measurementCount: entry.measurementCount,
        hasPersonalBest,
      };
    });

    return {
      improvements: result,
      totalAthletes: topImprovements.length, // Total athletes with improvement
      metric,
      metricLabel,
      metricType: metricType as 'lower_is_better' | 'higher_is_better' | 'tracking',
    };
  }

  /**
   * Get at-risk athletes (declining performance or inactive)
   * Returns athletes with performance decline > 5% or no measurements in N days
   *
   * Decline Detection:
   * - Compare average of last 3 measurements to average of previous 3 measurements
   * - Requires minimum 6 measurements total
   * - Flag if decline > 5%
   * - Handle lower_is_better metrics (improvement = DOWN, decline = UP)
   * - Handle higher_is_better metrics (improvement = UP, decline = DOWN)
   *
   * Inactivity Detection:
   * - Athletes with no measurements in the last N days
   */
  async getAtRiskAthletes(
    organizationId: string,
    options?: {
      teamId?: string;
      inactivityThreshold?: number;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    declining: Array<{
      athleteId: string;
      athleteName: string;
      teamId: string | null;
      teamName: string | null;
      metric: string;
      metricLabel: string;
      declinePercent: number;
      previousValue: number;
      currentValue: number;
    }>;
    inactive: Array<{
      athleteId: string;
      athleteName: string;
      teamId: string | null;
      teamName: string | null;
      lastMeasurementDate: string;
      daysSinceLastMeasurement: number;
    }>;
    atRiskCount: number;
    totalCount: number;
  }> {
    const { teamId, inactivityThreshold = 14, limit = 20, offset = 0 } = options || {};

    // Get athlete IDs based on scope
    const athleteIds = await getAthleteIdsForScope(organizationId, teamId);

    if (athleteIds.length === 0) {
      return {
        declining: [],
        inactive: [],
        atRiskCount: 0,
        totalCount: 0,
      };
    }

    // PART 1: Detect declining performance using SQL window functions
    // Get metric metadata for determining decline direction
    const metricsMetadata = await db
      .select({
        code: siteMetrics.code,
        label: siteMetrics.label,
        metricType: siteMetrics.metricType,
      })
      .from(siteMetrics)
      .where(inArray(siteMetrics.code, VALID_METRICS.map(m => m.key)));

    const metricMap = new Map<string, { label: string; metricType: string }>();
    metricsMetadata.forEach(m => metricMap.set(m.code, { label: m.label, metricType: m.metricType }));

    // Use SQL window functions to calculate decline in database
    const decliningQuery = sql<{
      athleteId: string;
      metric: string;
      declinePercent: number;
      previousValue: number;
      currentValue: number;
    }>`
      WITH ranked_measurements AS (
        SELECT
          user_id as athlete_id,
          metric,
          CAST(value AS NUMERIC) as value,
          date,
          ROW_NUMBER() OVER (PARTITION BY user_id, metric ORDER BY date DESC) as row_num
        FROM measurements
        WHERE user_id = ANY(${athleteIds})
          AND is_verified = true
      ),
      recent_measurements AS (
        SELECT
          athlete_id,
          metric,
          value,
          row_num
        FROM ranked_measurements
        WHERE row_num <= 6
      ),
      averaged_measurements AS (
        SELECT
          athlete_id,
          metric,
          AVG(CASE WHEN row_num <= 3 THEN value END) as current_avg,
          AVG(CASE WHEN row_num BETWEEN 4 AND 6 THEN value END) as previous_avg,
          COUNT(DISTINCT row_num) as total_measurements
        FROM recent_measurements
        GROUP BY athlete_id, metric
        HAVING COUNT(DISTINCT row_num) >= 6
      )
      SELECT
        athlete_id::text as "athleteId",
        metric,
        CASE
          WHEN metric IN ('FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD')
            THEN ((current_avg - previous_avg) / NULLIF(previous_avg, 0)) * 100
          ELSE ((previous_avg - current_avg) / NULLIF(previous_avg, 0)) * 100
        END as "declinePercent",
        previous_avg::float as "previousValue",
        current_avg::float as "currentValue"
      FROM averaged_measurements
      WHERE
        previous_avg > 0
        AND (
          CASE
            WHEN metric IN ('FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD')
              THEN ((current_avg - previous_avg) / previous_avg) * 100
            ELSE ((previous_avg - current_avg) / previous_avg) * 100
          END
        ) > 5
    `;

    const decliningPerformances = await db.execute(decliningQuery) as any[];

    // PART 2: Detect inactive athletes
    const inactivityDate = new Date();
    inactivityDate.setDate(inactivityDate.getDate() - inactivityThreshold);

    // Get last measurement date for each athlete
    const lastMeasurements = await db
      .select({
        athleteId: measurements.userId,
        lastDate: sql<string>`MAX(${measurements.date})::text`,
      })
      .from(measurements)
      .where(
        and(
          inArray(measurements.userId, athleteIds),
          eq(measurements.isVerified, true)
        )
      )
      .groupBy(measurements.userId);

    const inactiveAthletes: Array<{
      athleteId: string;
      lastMeasurementDate: string;
      daysSinceLastMeasurement: number;
    }> = [];

    lastMeasurements.forEach(m => {
      const lastDate = new Date(m.lastDate);
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSince >= inactivityThreshold) {
        inactiveAthletes.push({
          athleteId: m.athleteId,
          lastMeasurementDate: m.lastDate,
          daysSinceLastMeasurement: daysSince,
        });
      }
    });

    // Athletes with no measurements at all
    const athletesWithMeasurements = new Set(lastMeasurements.map(m => m.athleteId));
    athleteIds.forEach(athleteId => {
      if (!athletesWithMeasurements.has(athleteId)) {
        inactiveAthletes.push({
          athleteId,
          lastMeasurementDate: '',
          daysSinceLastMeasurement: 999, // Arbitrary large number for never measured
        });
      }
    });

    // Get athlete info
    const allAtRiskAthleteIds = [
      ...new Set([
        ...decliningPerformances.map((d: any) => d.athleteId),
        ...inactiveAthletes.map(i => i.athleteId),
      ])
    ];

    if (allAtRiskAthleteIds.length === 0) {
      return {
        declining: [],
        inactive: [],
        atRiskCount: 0,
        totalCount: 0,
      };
    }

    const athleteInfo = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.id, allAtRiskAthleteIds));

    const athleteNameMap = new Map<string, string>();
    athleteInfo.forEach(a => athleteNameMap.set(a.id, `${a.firstName} ${a.lastName}`));

    // Get team info for athletes
    const athleteTeamInfo = await db
      .select({
        userId: userTeams.userId,
        teamId: teams.id,
        teamName: teams.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(
        and(
          inArray(userTeams.userId, allAtRiskAthleteIds),
          eq(userTeams.isActive, true)
        )
      );

    const teamInfoMap = new Map<string, { teamId: string; teamName: string }>();
    athleteTeamInfo.forEach(info => {
      if (!teamInfoMap.has(info.userId)) {
        teamInfoMap.set(info.userId, { teamId: info.teamId, teamName: info.teamName });
      }
    });

    // Build declining results
    const decliningResults = decliningPerformances.map((entry: any) => {
      const teamInfo = teamInfoMap.get(entry.athleteId);
      const metricInfo = metricMap.get(entry.metric);

      return {
        athleteId: entry.athleteId,
        athleteName: athleteNameMap.get(entry.athleteId) || 'Unknown',
        teamId: teamInfo?.teamId || null,
        teamName: teamInfo?.teamName || null,
        metric: entry.metric,
        metricLabel: metricInfo?.label || entry.metric,
        declinePercent: Math.round(entry.declinePercent * 100) / 100,
        previousValue: entry.previousValue,
        currentValue: entry.currentValue,
      };
    });

    // Build inactive results
    const inactiveResults = inactiveAthletes.map(entry => {
      const teamInfo = teamInfoMap.get(entry.athleteId);

      return {
        athleteId: entry.athleteId,
        athleteName: athleteNameMap.get(entry.athleteId) || 'Unknown',
        teamId: teamInfo?.teamId || null,
        teamName: teamInfo?.teamName || null,
        lastMeasurementDate: entry.lastMeasurementDate,
        daysSinceLastMeasurement: entry.daysSinceLastMeasurement,
      };
    });

    // Calculate unique at-risk count (athlete can be both declining and inactive)
    const uniqueAtRiskAthletes = new Set([
      ...decliningPerformances.map((d: any) => d.athleteId),
      ...inactiveAthletes.map(i => i.athleteId),
    ]);

    // Store total count before pagination
    const totalDeclining = decliningResults.length;
    const totalInactive = inactiveResults.length;
    const totalCount = uniqueAtRiskAthletes.size;

    // Apply pagination by combining and sorting all at-risk entries
    const allAtRisk = [
      ...decliningResults.map(d => ({ ...d, type: 'declining' as const })),
      ...inactiveResults.map(i => ({ ...i, type: 'inactive' as const })),
    ];

    // Sort by athlete name for consistent pagination
    allAtRisk.sort((a, b) => a.athleteName.localeCompare(b.athleteName));

    // Apply offset and limit
    const paginatedResults = allAtRisk.slice(offset, offset + limit);

    // Separate back into declining and inactive
    const paginatedDeclining = paginatedResults
      .filter(r => r.type === 'declining')
      .map(({ type, ...rest }) => rest);
    const paginatedInactive = paginatedResults
      .filter(r => r.type === 'inactive')
      .map(({ type, ...rest }) => rest);

    return {
      declining: paginatedDeclining,
      inactive: paginatedInactive,
      atRiskCount: uniqueAtRiskAthletes.size,
      totalCount,
    };
  }
}
