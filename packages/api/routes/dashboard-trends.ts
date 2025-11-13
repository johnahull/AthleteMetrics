/**
 * Dashboard Trends Routes
 * Provides trend data comparing current month vs previous month for KPI cards
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { isSiteAdmin } from "../utils/auth-helpers";
import { db } from "../db";
import { users, userTeams, teams, measurements } from "@shared/schema";
import { eq, and, sql, gte, lt, inArray } from "drizzle-orm";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

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
   * Compares current month vs previous month
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

      // Calculate date ranges
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get athlete IDs for organization (used for filtering)
      const orgAthleteIds = await db
        .select({ userId: userTeams.userId })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(eq(teams.organizationId, organizationId))
        .groupBy(userTeams.userId);

      const athleteIds = [...new Set(orgAthleteIds.map(a => a.userId))];

      // Athletes Trend (count athletes created in current vs previous month)
      let currentAthletes = 0;
      let previousAthletes = 0;

      if (athleteIds.length > 0) {
        // Single query with GROUP BY to get both current and previous month counts
        const athleteCountsResult = await db
          .select({
            period: sql<string>`
              CASE
                WHEN ${users.createdAt} >= ${currentMonthStart}
                  AND ${users.createdAt} < ${currentMonthEnd} THEN 'current'
                WHEN ${users.createdAt} >= ${previousMonthStart}
                  AND ${users.createdAt} < ${previousMonthEnd} THEN 'previous'
              END
            `,
            count: sql<number>`count(*)::int`
          })
          .from(users)
          .where(
            and(
              inArray(users.id, athleteIds),
              gte(users.createdAt, previousMonthStart),
              lt(users.createdAt, currentMonthEnd)
            )
          )
          .groupBy(sql`1`);

        // Extract counts from result
        for (const row of athleteCountsResult) {
          if (row.period === 'current') {
            currentAthletes = row.count;
          } else if (row.period === 'previous') {
            previousAthletes = row.count;
          }
        }
      }

      // Measurements Trend (count measurements in current vs previous month)
      let currentMeasurements = 0;
      let previousMeasurements = 0;

      if (athleteIds.length > 0) {
        // Single query with GROUP BY to get both current and previous month counts
        const currentMonthStartStr = currentMonthStart.toISOString().split('T')[0];
        const currentMonthEndStr = currentMonthEnd.toISOString().split('T')[0];
        const previousMonthStartStr = previousMonthStart.toISOString().split('T')[0];
        const previousMonthEndStr = previousMonthEnd.toISOString().split('T')[0];

        const measurementCountsResult = await db
          .select({
            period: sql<string>`
              CASE
                WHEN ${measurements.date} >= ${currentMonthStartStr}
                  AND ${measurements.date} < ${currentMonthEndStr} THEN 'current'
                WHEN ${measurements.date} >= ${previousMonthStartStr}
                  AND ${measurements.date} < ${previousMonthEndStr} THEN 'previous'
              END
            `,
            count: sql<number>`count(*)::int`
          })
          .from(measurements)
          .where(
            and(
              inArray(measurements.userId, athleteIds),
              gte(measurements.date, previousMonthStartStr),
              lt(measurements.date, currentMonthEndStr),
              eq(measurements.isVerified, true)
            )
          )
          .groupBy(sql`1`);

        // Extract counts from result
        for (const row of measurementCountsResult) {
          if (row.period === 'current') {
            currentMeasurements = row.count;
          } else if (row.period === 'previous') {
            previousMeasurements = row.count;
          }
        }
      }

      // Teams Trend (count teams created in current vs previous month)
      // Single query with GROUP BY to get both current and previous month counts
      const teamCountsResult = await db
        .select({
          period: sql<string>`
            CASE
              WHEN ${teams.createdAt} >= ${currentMonthStart}
                AND ${teams.createdAt} < ${currentMonthEnd} THEN 'current'
              WHEN ${teams.createdAt} >= ${previousMonthStart}
                AND ${teams.createdAt} < ${previousMonthEnd} THEN 'previous'
            END
          `,
          count: sql<number>`count(*)::int`
        })
        .from(teams)
        .where(
          and(
            eq(teams.organizationId, organizationId),
            gte(teams.createdAt, previousMonthStart),
            lt(teams.createdAt, currentMonthEnd)
          )
        )
        .groupBy(sql`1`);

      // Extract counts from result
      let currentTeams = 0;
      let previousTeams = 0;
      for (const row of teamCountsResult) {
        if (row.period === 'current') {
          currentTeams = row.count;
        } else if (row.period === 'previous') {
          previousTeams = row.count;
        }
      }

      // Build response
      const response: DashboardTrendsResponse = {
        athletes: calculateTrendData(currentAthletes, previousAthletes),
        measurements: calculateTrendData(currentMeasurements, previousMeasurements),
        teams: calculateTrendData(currentTeams, previousTeams)
      };

      res.json(response);
    } catch (error) {
      console.error("Dashboard trends error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch dashboard trends";
      res.status(500).json({ message });
    }
  });
}
