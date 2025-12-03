/**
 * Dashboard Trends Routes
 * Provides trend data with flexible timeframe filtering for KPI cards
 * Default: last 30 days vs prior 30 days (rolling comparison)
 * Supports: 7d, 30d, 90d, mtd, lm, qtd, ytd, all, custom
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { isSiteAdmin } from "../utils/auth-helpers";
import { db } from "../db";
import { users, userTeams, teams, measurements } from "@shared/schema";
import { eq, and, sql, gte, lt, inArray } from "drizzle-orm";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import {
  getPresetDateRange,
  calculateComparisonPeriods,
  type TimeframePreset
} from "@shared/dashboard-timeframe";

// Rate limiting for dashboard endpoints
const dashboardLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.ANALYTICS,
  message: {
    message: "Too many dashboard requests, please try again later."
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production' ||
                         process.env.RAILWAY_ENVIRONMENT === 'production';
    if (isProduction) {
      return false;
    }
    if (process.env.BYPASS_ANALYTICS_RATE_LIMIT === 'true') {
      return req.session?.user?.isSiteAdmin === true;
    }
    return false;
  },
});

interface TrendData {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

interface DashboardTrendsResponse {
  athletes: TrendData;
  measurements: TrendData;
  teams: TrendData;
  periodLabel?: string;
  comparisonLabel?: string;
}

/**
 * Threshold percentage for classifying trends as up/down vs flat
 * Changes within ±1% are considered flat
 */
const TREND_THRESHOLD_PERCENT = 1;

/**
 * Calculate trend direction based on percentage change
 * Uses TREND_THRESHOLD_PERCENT for up/down classification
 */
function calculateTrend(changePercent: number): 'up' | 'down' | 'flat' {
  if (changePercent > TREND_THRESHOLD_PERCENT) return 'up';
  if (changePercent < -TREND_THRESHOLD_PERCENT) return 'down';
  return 'flat';
}

/**
 * Calculate trend data from current and previous values
 */
function calculateTrendData(current: number, previous: number): TrendData {
  const change = current - previous;

  let changePercent: number;
  if (previous === 0) {
    // Handle division by zero
    if (current === 0) {
      changePercent = 0;
    } else {
      // New data (100% increase from 0)
      changePercent = 100;
    }
  } else {
    changePercent = Math.round(((change / previous) * 100) * 10) / 10; // Round to 1 decimal
  }

  return {
    current,
    previous,
    change,
    changePercent,
    trend: calculateTrend(changePercent)
  };
}

/**
 * Register dashboard trends routes
 */
export function registerDashboardTrendsRoutes(app: Express) {
  /**
   * GET /api/dashboard/trends
   * Get trend data for dashboard KPI cards
   * Supports timeframe filtering with rolling comparison periods
   * Default: last 30 days vs prior 30 days
   * Query params:
   * - organizationId (required): Organization UUID
   * - teamId (optional): Filter to specific team
   * - athleteId (optional): Filter to specific athlete
   * - timeframe (optional): 7d, 30d, 90d, mtd, lm, qtd, ytd, all, custom (default: 30d)
   * - dateFrom (required if timeframe=custom): ISO 8601 date (YYYY-MM-DD)
   * - dateTo (required if timeframe=custom): ISO 8601 date (YYYY-MM-DD)
   */
  app.get("/api/dashboard/trends", dashboardLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const organizationId = req.query.organizationId as string;

      // Validation
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId parameter is required" });
      }

      // UUID validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(organizationId)) {
        return res.status(400).json({ message: "Invalid organizationId format" });
      }

      // Authorization: Athletes cannot access trends
      if (user.role === 'athlete') {
        return res.status(403).json({ message: "Access denied - athletes cannot view dashboard trends" });
      }

      // Authorization: Non-site-admins can only access their own organization
      if (!isSiteAdmin(user)) {
        if (user.primaryOrganizationId !== organizationId) {
          return res.status(403).json({ message: "Access denied - you can only view trends for your organization" });
        }
      }

      // Parse optional filter parameters
      const teamId = req.query.teamId as string | undefined;
      const athleteId = req.query.athleteId as string | undefined;

      // Validate UUID format for filters
      if (teamId && !uuidRegex.test(teamId)) {
        return res.status(400).json({ message: "Invalid teamId format" });
      }
      if (athleteId && !uuidRegex.test(athleteId)) {
        return res.status(400).json({ message: "Invalid athleteId format" });
      }

      // Parse timeframe parameters
      const timeframe = (req.query.timeframe as string | undefined) || '30d'; // Default to last 30 days
      const dateFromStr = req.query.dateFrom as string | undefined;
      const dateToStr = req.query.dateTo as string | undefined;

      // Validate timeframe parameter
      const validTimeframes = ['7d', '30d', '90d', 'mtd', 'lm', 'qtd', 'ytd', 'all', 'custom'] as const;
      type ValidTimeframe = typeof validTimeframes[number];
      const isValidTimeframe = (value: string): value is ValidTimeframe =>
        (validTimeframes as readonly string[]).includes(value);

      if (!isValidTimeframe(timeframe)) {
        return res.status(400).json({ message: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}` });
      }

      // Calculate date ranges based on timeframe
      let currentPeriodStart: Date;
      let currentPeriodEnd: Date;

      if (timeframe === 'custom') {
        // Custom date range: require both dateFrom and dateTo
        if (!dateFromStr) {
          return res.status(400).json({ message: "dateFrom is required when timeframe=custom" });
        }
        if (!dateToStr) {
          return res.status(400).json({ message: "dateTo is required when timeframe=custom" });
        }

        // Validate date format (ISO 8601: YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateFromStr)) {
          return res.status(400).json({ message: "Invalid dateFrom format. Use ISO 8601 date format (YYYY-MM-DD)" });
        }
        if (!dateRegex.test(dateToStr)) {
          return res.status(400).json({ message: "Invalid dateTo format. Use ISO 8601 date format (YYYY-MM-DD)" });
        }

        currentPeriodStart = new Date(dateFromStr);
        currentPeriodEnd = new Date(dateToStr);

        // Validate dates are valid
        if (isNaN(currentPeriodStart.getTime()) || isNaN(currentPeriodEnd.getTime())) {
          return res.status(400).json({ message: "Invalid date format. Use ISO 8601 date format (YYYY-MM-DD)" });
        }

        // Validate date order: dateFrom must be before or equal to dateTo
        if (currentPeriodStart > currentPeriodEnd) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo" });
        }
      } else {
        // Preset timeframe: use shared utility
        const dateRange = getPresetDateRange(timeframe as TimeframePreset);
        currentPeriodStart = dateRange.start;
        currentPeriodEnd = dateRange.end;
      }

      // Calculate comparison periods using shared utility
      const comparisonPeriods = calculateComparisonPeriods(currentPeriodStart, currentPeriodEnd);
      const currentMonthStart = comparisonPeriods.current.start;
      const currentMonthEnd = comparisonPeriods.current.end;
      const previousMonthStart = comparisonPeriods.prior.start;
      const previousMonthEnd = comparisonPeriods.prior.end;

      // Get athlete IDs based on filter scope
      let athleteIds: string[];
      if (athleteId) {
        // Filter to specific athlete
        athleteIds = [athleteId];
      } else if (teamId) {
        // Verify team belongs to the organization (IDOR protection)
        const [team] = await db
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.id, teamId),
              eq(teams.organizationId, organizationId)
            )
          );

        if (!team) {
          return res.status(400).json({ message: "Team not found in organization" });
        }

        // Filter to athletes in specific team
        const teamAthleteIds = await db
          .select({ userId: userTeams.userId })
          .from(userTeams)
          .where(
            and(
              eq(userTeams.teamId, teamId),
              eq(userTeams.isActive, true)
            )
          )
          .groupBy(userTeams.userId);
        athleteIds = [...new Set(teamAthleteIds.map(a => a.userId))];
      } else {
        // Get all athlete IDs for organization
        const orgAthleteIds = await db
          .select({ userId: userTeams.userId })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .where(eq(teams.organizationId, organizationId))
          .groupBy(userTeams.userId);
        athleteIds = [...new Set(orgAthleteIds.map(a => a.userId))];
      }

      // Defensive check: if no athletes found, return early with empty data
      if (athleteIds.length === 0) {
        const emptyTrend: TrendData = { current: 0, previous: 0, change: 0, changePercent: 0, trend: 'flat' };
        return res.json({
          athletes: emptyTrend,
          teams: emptyTrend,
          measurements: emptyTrend
        });
      }

      // Athletes Trend (count athletes created in current vs previous month)
      let currentAthletes = 0;
      let previousAthletes = 0;

      if (athleteIds.length > 0) {
        // Query current period athletes using parameterized dates
        const currentAthletesResult = await db
          .select({
            count: sql<number>`count(*)::int`
          })
          .from(users)
          .where(
            and(
              inArray(users.id, athleteIds),
              gte(users.createdAt, currentMonthStart),
              lt(users.createdAt, currentMonthEnd)
            )
          );

        // Query previous period athletes using parameterized dates
        const previousAthletesResult = await db
          .select({
            count: sql<number>`count(*)::int`
          })
          .from(users)
          .where(
            and(
              inArray(users.id, athleteIds),
              gte(users.createdAt, previousMonthStart),
              lt(users.createdAt, previousMonthEnd)
            )
          );

        currentAthletes = currentAthletesResult[0]?.count || 0;
        previousAthletes = previousAthletesResult[0]?.count || 0;
      }

      // Measurements Trend (count measurements in current vs previous period)
      let currentMeasurements = 0;
      let previousMeasurements = 0;

      if (athleteIds.length > 0) {
        // Convert dates to YYYY-MM-DD format for date column comparison
        const currentMonthStartStr = currentMonthStart.toISOString().split('T')[0];
        const currentMonthEndStr = currentMonthEnd.toISOString().split('T')[0];
        const previousMonthStartStr = previousMonthStart.toISOString().split('T')[0];
        const previousMonthEndStr = previousMonthEnd.toISOString().split('T')[0];

        // Query current period measurements using parameterized dates
        const currentMeasurementsResult = await db
          .select({
            count: sql<number>`count(*)::int`
          })
          .from(measurements)
          .where(
            and(
              inArray(measurements.userId, athleteIds),
              gte(measurements.date, currentMonthStartStr),
              lt(measurements.date, currentMonthEndStr),
              eq(measurements.isVerified, true)
            )
          );

        // Query previous period measurements using parameterized dates
        const previousMeasurementsResult = await db
          .select({
            count: sql<number>`count(*)::int`
          })
          .from(measurements)
          .where(
            and(
              inArray(measurements.userId, athleteIds),
              gte(measurements.date, previousMonthStartStr),
              lt(measurements.date, previousMonthEndStr),
              eq(measurements.isVerified, true)
            )
          );

        currentMeasurements = currentMeasurementsResult[0]?.count || 0;
        previousMeasurements = previousMeasurementsResult[0]?.count || 0;
      }

      // Teams Trend (count teams created in current vs previous period)
      // Skip team trends when filtering by specific team (not meaningful)
      let currentTeams = 0;
      let previousTeams = 0;

      if (!teamId) {
        // Query current period teams using parameterized dates
        const currentTeamsResult = await db
          .select({
            count: sql<number>`count(*)::int`
          })
          .from(teams)
          .where(
            and(
              eq(teams.organizationId, organizationId),
              gte(teams.createdAt, currentMonthStart),
              lt(teams.createdAt, currentMonthEnd)
            )
          );

        // Query previous period teams using parameterized dates
        const previousTeamsResult = await db
          .select({
            count: sql<number>`count(*)::int`
          })
          .from(teams)
          .where(
            and(
              eq(teams.organizationId, organizationId),
              gte(teams.createdAt, previousMonthStart),
              lt(teams.createdAt, previousMonthEnd)
            )
          );

        currentTeams = currentTeamsResult[0]?.count || 0;
        previousTeams = previousTeamsResult[0]?.count || 0;
      }

      // Build response
      const response: DashboardTrendsResponse = {
        athletes: calculateTrendData(currentAthletes, previousAthletes),
        measurements: calculateTrendData(currentMeasurements, previousMeasurements),
        teams: calculateTrendData(currentTeams, previousTeams),
        periodLabel: comparisonPeriods.label,
        comparisonLabel: comparisonPeriods.comparisonLabel
      };

      res.json(response);
    } catch (error) {
      console.error("Dashboard trends error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch dashboard trends";
      res.status(500).json({ message });
    }
  });
}
