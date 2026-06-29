/**
 * Analytics and statistics routes
 * Uses AnalyticsService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { AnalyticsService } from "../services/analytics-service";
import { AnalyticsService as AdvancedAnalyticsService } from "../analytics-simple";
import { storage } from "../storage";
import { validateAnalyticsRequest } from "../validation/analytics-validation";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import {
  canViewUserStats,
  canAccessLeaderboard,
  canAccessMostImproved,
  canAccessAtRiskData,
} from "../permissions/index";
import { hasOrganizationAccess, validateOrganizationAccess } from "../helpers/org-access";
import { getAuthorizationError, AUTH_ERRORS } from "../helpers/auth-errors";
import { db } from "../db";
import {
  users,
  userTeams,
  teams,
  userOrganizations,
  measurements,
  siteMetrics,
  siteBenchmarks,
  customBenchmarks,
  organizationBenchmarks,
} from "@shared/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { evaluateTierBenchmark } from "../services/benchmark-tiers";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import {
  getPresetDateRange,
  type TimeframePreset
} from "@shared/dashboard-timeframe";

// Rate limiting for analytics endpoints
// Analytics queries can be expensive, so we use stricter limits
const analyticsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.ANALYTICS,
  message: {
    message: process.env.ANALYTICS_RATE_LIMIT_MESSAGE || "Too many analytics requests, please try again later."
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    // Bypass rate limiting for site admins if BYPASS_ANALYTICS_RATE_LIMIT is set and not in production
    // Check both NODE_ENV and RAILWAY_ENVIRONMENT for stronger production detection
    const isProduction = process.env.NODE_ENV === 'production' ||
                         process.env.RAILWAY_ENVIRONMENT === 'production';
    if (isProduction) {
      return false; // Never bypass in production
    }
    if (process.env.BYPASS_ANALYTICS_RATE_LIMIT === 'true') {
      return req.session?.user?.isSiteAdmin === true;
    }
    return false;
  },
});

export function registerAnalyticsRoutes(app: Express) {
  const analyticsService = new AnalyticsService();
  const advancedAnalyticsService = new AdvancedAnalyticsService();

  /**
   * Get athlete statistics (best performances, measurement count)
   */
  app.get("/api/analytics/athletes/:userId/stats", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.params.userId;

      // Permission check: athletes can only view their own stats
      const statsPermission = canViewUserStats(user, userId);
      if (!statsPermission.allowed) {
        return res.status(403).json({ message: statsPermission.reason });
      }

      // Permission check: org admins/coaches can only view athletes in their organization
      // SECURITY: Validate using database-verified org memberships, not session data
      if (!isSiteAdmin(user) && user.role !== 'athlete') {
        // Get user's org memberships from database
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.NO_ORG_MEMBERSHIP) });
        }
        const userOrgIds = new Set(userOrgs.map(o => o.organizationId));

        // Check if athlete belongs to a team in any of the user's organizations
        const athleteTeams = await db
          .select({ organizationId: teams.organizationId })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .where(
            and(
              eq(userTeams.userId, userId),
              eq(userTeams.isActive, true)
            )
          );

        const isInOrganization = athleteTeams.some(t => userOrgIds.has(t.organizationId));
        if (!isInOrganization) {
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ATHLETE_ORG_MISMATCH) });
        }
      }

      const stats = await analyticsService.getAthleteStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Get athlete stats error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch athlete statistics";
      res.status(500).json({ message });
    }
  });

  /**
   * Get team statistics for all teams in an organization
   */
  app.get("/api/analytics/teams/stats", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // SECURITY: Get organizationId from query or user's database-validated membership
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        // Use database-validated org membership instead of session
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(400).json({ message: "organizationId is required - no organization membership" });
        }
        organizationId = userOrgs[0].organizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // SECURITY: Validate user has access to requested organization via database membership
      const hasAccess = await hasOrganizationAccess(user, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ORG_ACCESS_DENIED) });
      }

      const teamStats = await analyticsService.getTeamStats(organizationId);
      res.json(teamStats);
    } catch (error) {
      console.error("Get team stats error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch team statistics";
      res.status(500).json({ message });
    }
  });

  /**
   * Get dashboard statistics (athlete counts, team counts, best performances from last 30 days)
   */
  app.get("/api/analytics/dashboard", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get organizationId from query or user's primary organization
      const requestedOrgId = req.query.organizationId as string | undefined;

      // SECURITY: Validate organization access and get effective org ID
      const orgAccessResult = await validateOrganizationAccess(user, requestedOrgId);
      if (!orgAccessResult.allowed) {
        return res.status(403).json({
          message: getAuthorizationError(orgAccessResult.error!)
        });
      }

      // Site admins can view global dashboard without organizationId
      const organizationId = orgAccessResult.effectiveOrgId;
      if (!organizationId && !isSiteAdmin(user)) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // Parse optional filter parameters
      const teamId = req.query.teamId as string | undefined;
      const athleteId = req.query.athleteId as string | undefined;

      // Validate UUID format for filters
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (teamId && !uuidRegex.test(teamId)) {
        return res.status(400).json({ message: "Invalid teamId format" });
      }
      if (athleteId && !uuidRegex.test(athleteId)) {
        return res.status(400).json({ message: "Invalid athleteId format" });
      }

      // athleteId requires teamId
      if (athleteId && !teamId) {
        return res.status(400).json({ message: "athleteId requires teamId to be specified" });
      }

      // SECURITY: Verify athlete belongs to organization (IDOR protection)
      if (athleteId) {
        // athleteId filtering requires organizationId
        if (!organizationId) {
          return res.status(400).json({ message: "organizationId is required when filtering by athleteId" });
        }

        const athleteBelongsToOrg = await db
          .select({ userId: userTeams.userId })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .where(
            and(
              eq(userTeams.userId, athleteId),
              eq(teams.organizationId, organizationId)
            )
          )
          .limit(1);

        if (athleteBelongsToOrg.length === 0) {
          return res.status(403).json({ message: "Access denied - athlete does not belong to organization" });
        }
      }

      // Parse timeframe parameters (optional)
      const timeframe = req.query.timeframe as string | undefined;
      const dateFromStr = req.query.dateFrom as string | undefined;
      const dateToStr = req.query.dateTo as string | undefined;

      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (timeframe || dateFromStr || dateToStr) {
        // If any timeframe params provided, calculate date range
        if (timeframe && timeframe !== 'custom') {
          // Preset timeframe
          const validTimeframes: TimeframePreset[] = ['7d', '30d', '90d', '180d', '1y', 'ytd', 'all'];
          if (!validTimeframes.includes(timeframe as TimeframePreset)) {
            return res.status(400).json({ message: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}, custom` });
          }
          const dateRange = getPresetDateRange(timeframe as TimeframePreset);
          startDate = dateRange.start;
          endDate = dateRange.end;
        } else if (timeframe === 'custom') {
          // Custom date range
          if (!dateFromStr || !dateToStr) {
            return res.status(400).json({ message: "dateFrom and dateTo are required when timeframe=custom" });
          }
          startDate = new Date(dateFromStr);
          endDate = new Date(dateToStr);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ message: "Invalid date format. Use ISO 8601 date format (YYYY-MM-DD)" });
          }

          // Validate date range constraints (defense in depth - frontend also validates)
          const maxRangeDays = 730; // 2 years
          const rangeDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

          if (rangeDays > maxRangeDays) {
            return res.status(400).json({
              message: `Date range exceeds maximum of ${maxRangeDays} days (2 years)`
            });
          }

          if (startDate > endDate) {
            return res.status(400).json({ message: "dateFrom must be before dateTo" });
          }

          const today = new Date();
          if (endDate > today) {
            return res.status(400).json({ message: "dateTo cannot be in the future" });
          }
        }
      }

      const dashboardStats = await analyticsService.getDashboardStats(organizationId, {
        teamId,
        athleteId,
        startDate,
        endDate,
      });
      res.json(dashboardStats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch dashboard statistics";
      res.status(500).json({ message });
    }
  });

  /**
   * POST analytics dashboard data with complex filters
   * Used by CoachAnalytics page for detailed measurement analysis
   */
  app.post("/api/analytics/dashboard", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body
      const validation = validateAnalyticsRequest(req.body);
      if (!validation.success || !validation.data) {
        return res.status(400).json({
          message: "Invalid analytics request",
          errors: validation.errors
        });
      }

      const request = validation.data;

      // SECURITY: Validate user has access to requested organization via database membership
      if (request.filters.organizationId) {
        const hasAccess = await hasOrganizationAccess(user, request.filters.organizationId);
        if (!hasAccess) {
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ORG_ACCESS_DENIED) });
        }
      }

      // Call the advanced analytics service
      const analyticsData = await advancedAnalyticsService.getAnalyticsData(request);
      res.json(analyticsData);
    } catch (error) {
      console.error("POST analytics dashboard error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch analytics data";
      res.status(500).json({ message });
    }
  });

  /**
   * Alias endpoint for getUserStats (backward compatibility)
   */
  app.get("/api/analytics/users/:userId/stats", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userId = req.params.userId;

      // Permission check: athletes can only view their own stats
      const statsPermission = canViewUserStats(user, userId);
      if (!statsPermission.allowed) {
        return res.status(403).json({ message: statsPermission.reason });
      }

      // Permission check: org admins/coaches can only view athletes in their organization
      // SECURITY: Validate using database-verified org memberships, not session data
      if (!isSiteAdmin(user) && user.role !== 'athlete') {
        // Get user's org memberships from database
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.NO_ORG_MEMBERSHIP) });
        }
        const userOrgIds = new Set(userOrgs.map(o => o.organizationId));

        // Check if athlete belongs to a team in any of the user's organizations
        const athleteTeams = await db
          .select({ organizationId: teams.organizationId })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .where(
            and(
              eq(userTeams.userId, userId),
              eq(userTeams.isActive, true)
            )
          );

        const isInOrganization = athleteTeams.some(t => userOrgIds.has(t.organizationId));
        if (!isInOrganization) {
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ATHLETE_ORG_MISMATCH) });
        }
      }

      const stats = await analyticsService.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Get user stats error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch user statistics";
      res.status(500).json({ message });
    }
  });

  /**
   * Get performance trends (weekly best measurements)
   */
  app.get("/api/analytics/performance-trends", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // SECURITY: Get organizationId from query or user's database-validated membership
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        // Use database-validated org membership instead of session
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(400).json({ message: "organizationId is required - no organization membership" });
        }
        organizationId = userOrgs[0].organizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // SECURITY: Validate user has access to requested organization via database membership
      const hasAccess = await hasOrganizationAccess(user, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ORG_ACCESS_DENIED) });
      }

      // Parse dateFrom parameter (required)
      const dateFromStr = req.query.dateFrom as string | undefined;
      if (!dateFromStr) {
        return res.status(400).json({ message: "dateFrom parameter is required" });
      }

      const dateFrom = new Date(dateFromStr);
      if (isNaN(dateFrom.getTime())) {
        return res.status(400).json({ message: "Invalid dateFrom format. Use ISO 8601 date string." });
      }

      // Parse optional metrics parameter (comma-separated)
      const metricsParam = req.query.metrics as string | undefined;
      const metrics = metricsParam
        ? metricsParam.split(',').map(m => m.trim())
        : ['FLY10_TIME', 'VERTICAL_JUMP'];

      // Parse optional team/athlete filters
      const teamId = req.query.teamId as string | undefined;
      const athleteId = req.query.athleteId as string | undefined;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (teamId && !uuidRegex.test(teamId)) {
        return res.status(400).json({ message: "Invalid teamId format" });
      }
      if (athleteId && !uuidRegex.test(athleteId)) {
        return res.status(400).json({ message: "Invalid athleteId format" });
      }

      // athleteId requires teamId
      if (athleteId && !teamId) {
        return res.status(400).json({ message: "athleteId requires teamId to be specified" });
      }

      // SECURITY: Verify athlete belongs to organization (IDOR protection)
      if (athleteId) {
        // athleteId filtering requires organizationId
        if (!organizationId) {
          return res.status(400).json({ message: "organizationId is required when filtering by athleteId" });
        }

        const athleteBelongsToOrg = await db
          .select({ userId: userTeams.userId })
          .from(userTeams)
          .innerJoin(teams, eq(userTeams.teamId, teams.id))
          .where(
            and(
              eq(userTeams.userId, athleteId),
              eq(teams.organizationId, organizationId)
            )
          )
          .limit(1);

        if (athleteBelongsToOrg.length === 0) {
          return res.status(403).json({ message: "Access denied - athlete does not belong to organization" });
        }
      }

      const trendsData = await analyticsService.getPerformanceTrends(
        organizationId,
        dateFrom,
        metrics,
        { teamId, athleteId }
      );
      res.json(trendsData);
    } catch (error) {
      console.error("Get performance trends error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch performance trends";
      res.status(500).json({ message });
    }
  });

  /**
   * Get leaderboard rankings for a specific metric
   * Returns top performers with percentile rankings
   */
  app.get("/api/analytics/leaderboard", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Permission check: only coaches and admins can access leaderboard
      const leaderboardPermission = canAccessLeaderboard(user);
      if (!leaderboardPermission.allowed) {
        return res.status(403).json({ message: leaderboardPermission.reason });
      }

      // SECURITY: Get organizationId from query or user's database-validated membership
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        // Use database-validated org membership instead of session
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(400).json({ message: "organizationId is required - no organization membership" });
        }
        organizationId = userOrgs[0].organizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // SECURITY: Validate user has access to requested organization via database membership
      const hasAccess = await hasOrganizationAccess(user, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ORG_ACCESS_DENIED) });
      }

      // Validate required metric parameter
      const metric = req.query.metric as string | undefined;
      if (!metric) {
        return res.status(400).json({ message: "metric parameter is required" });
      }

      // Validate optional parameters
      const teamId = req.query.teamId as string | undefined;
      const limitStr = req.query.limit as string | undefined;
      const limit = limitStr ? parseInt(limitStr, 10) : 10;

      if (isNaN(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "limit must be a number between 1 and 100" });
      }

      // Validate UUID format for filters
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (teamId && !uuidRegex.test(teamId)) {
        return res.status(400).json({ message: "Invalid teamId format" });
      }

      // Parse timeframe parameters
      const timeframe = req.query.timeframe as string | undefined;
      const dateFromStr = req.query.dateFrom as string | undefined;
      const dateToStr = req.query.dateTo as string | undefined;

      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (timeframe && timeframe !== 'custom' && timeframe !== 'all') {
        const validTimeframes: TimeframePreset[] = ['7d', '30d', '90d', '180d', '1y', 'ytd'];
        if (!validTimeframes.includes(timeframe as TimeframePreset)) {
          return res.status(400).json({ message: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}, all, custom` });
        }
        const dateRange = getPresetDateRange(timeframe as TimeframePreset);
        startDate = dateRange.start;
        endDate = dateRange.end;
      } else if (timeframe === 'custom') {
        if (!dateFromStr || !dateToStr) {
          return res.status(400).json({ message: "dateFrom and dateTo are required when timeframe=custom" });
        }
        startDate = new Date(dateFromStr);
        endDate = new Date(dateToStr);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format. Use ISO 8601 date format (YYYY-MM-DD)" });
        }
      }
      // If timeframe is 'all' or undefined, startDate and endDate remain undefined (no filter)

      const leaderboardData = await analyticsService.getLeaderboard(organizationId, metric, {
        teamId,
        startDate,
        endDate,
        limit,
      });

      res.json(leaderboardData);
    } catch (error) {
      console.error("Get leaderboard error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch leaderboard";
      res.status(500).json({ message });
    }
  });

  /**
   * Get most improved athletes for a specific metric
   * Returns athletes with highest improvement percentage over a time period
   */
  app.get("/api/analytics/most-improved", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Permission check: only coaches and admins can access most-improved
      const mostImprovedPermission = canAccessMostImproved(user);
      if (!mostImprovedPermission.allowed) {
        return res.status(403).json({ message: mostImprovedPermission.reason });
      }

      // SECURITY: Get organizationId from query or user's database-validated membership
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        // Use database-validated org membership instead of session
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(400).json({ message: "organizationId is required - no organization membership" });
        }
        organizationId = userOrgs[0].organizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // SECURITY: Validate user has access to requested organization via database membership
      const hasAccess = await hasOrganizationAccess(user, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ORG_ACCESS_DENIED) });
      }

      // Validate required metric parameter
      const metric = req.query.metric as string | undefined;
      if (!metric) {
        return res.status(400).json({ message: "metric parameter is required" });
      }

      // Validate optional parameters
      const teamId = req.query.teamId as string | undefined;
      const limitStr = req.query.limit as string | undefined;
      const limit = limitStr ? parseInt(limitStr, 10) : 5;

      if (isNaN(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "limit must be a number between 1 and 100" });
      }

      // Validate UUID format for filters
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (teamId && !uuidRegex.test(teamId)) {
        return res.status(400).json({ message: "Invalid teamId format" });
      }

      // Parse timeframe parameters
      const timeframe = req.query.timeframe as string | undefined;
      const dateFromStr = req.query.dateFrom as string | undefined;
      const dateToStr = req.query.dateTo as string | undefined;

      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (timeframe && timeframe !== 'custom' && timeframe !== 'all') {
        const validTimeframes: TimeframePreset[] = ['7d', '30d', '90d', '180d', '1y', 'ytd'];
        if (!validTimeframes.includes(timeframe as TimeframePreset)) {
          return res.status(400).json({ message: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}, all, custom` });
        }
        const dateRange = getPresetDateRange(timeframe as TimeframePreset);
        startDate = dateRange.start;
        endDate = dateRange.end;
      } else if (timeframe === 'custom') {
        if (!dateFromStr || !dateToStr) {
          return res.status(400).json({ message: "dateFrom and dateTo are required when timeframe=custom" });
        }
        startDate = new Date(dateFromStr);
        endDate = new Date(dateToStr);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format. Use ISO 8601 date format (YYYY-MM-DD)" });
        }
      }
      // If timeframe is 'all' or undefined, startDate and endDate remain undefined (no filter)

      const mostImprovedData = await analyticsService.getMostImproved(organizationId, metric, {
        teamId,
        startDate,
        endDate,
        limit,
      });

      res.json(mostImprovedData);
    } catch (error) {
      console.error("Get most-improved error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch improvement rankings";
      res.status(500).json({ message });
    }
  });

  /**
   * Get at-risk athletes (declining performance or inactive)
   * Returns athletes with performance decline > 5% or no measurements in N days
   */
  app.get("/api/analytics/at-risk", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Permission check: only coaches and admins can access at-risk data
      const atRiskPermission = canAccessAtRiskData(user);
      if (!atRiskPermission.allowed) {
        return res.status(403).json({ message: atRiskPermission.reason });
      }

      // SECURITY: Get organizationId from query or user's database-validated membership
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        // Use database-validated org membership instead of session
        const userOrgs = await storage.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
          return res.status(400).json({ message: "organizationId is required - no organization membership" });
        }
        organizationId = userOrgs[0].organizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // SECURITY: Validate user has access to requested organization via database membership
      const hasAccess = await hasOrganizationAccess(user, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ORG_ACCESS_DENIED) });
      }

      // Validate optional parameters
      const teamId = req.query.teamId as string | undefined;
      const inactivityThresholdStr = req.query.inactivityThreshold as string | undefined;
      const inactivityThreshold = inactivityThresholdStr ? parseInt(inactivityThresholdStr, 10) : 14;

      // Validate pagination parameters
      const limitStr = req.query.limit as string | undefined;
      const offsetStr = req.query.offset as string | undefined;
      const limit = limitStr ? parseInt(limitStr, 10) : 20;
      const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

      if (isNaN(inactivityThreshold) || inactivityThreshold < 1 || inactivityThreshold > 365) {
        return res.status(400).json({ message: "inactivityThreshold must be a number between 1 and 365" });
      }

      if (isNaN(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "limit must be a number between 1 and 100" });
      }

      if (isNaN(offset) || offset < 0) {
        return res.status(400).json({ message: "offset must be a non-negative number" });
      }

      // Validate UUID format for teamId filter
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (teamId && !uuidRegex.test(teamId)) {
        return res.status(400).json({ message: "Invalid teamId format" });
      }

      const atRiskData = await analyticsService.getAtRiskAthletes(organizationId, {
        teamId,
        inactivityThreshold,
        limit,
        offset,
      });

      res.json(atRiskData);
    } catch (error) {
      console.error("Get at-risk athletes error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch at-risk athletes";
      res.status(500).json({ message });
    }
  });

  /**
   * Get tier-comparison data for a single athlete + metric.
   *
   * Evaluates the athlete's best value for `metric` against the organization's
   * active tier benchmark group (site benchmarks enabled for the org, plus the
   * org's own custom benchmarks) using the shared `evaluateTierBenchmark` logic.
   *
   * Org resolution: the athlete's organization is used. Non-site-admin callers
   * must share that organization with the athlete (mirrors the org access check
   * on the sibling stats endpoint, but uses org membership since tier benchmarks
   * are org-scoped and independent athletes may have no team).
   *
   * No-data contract: returns `{ comparison: null }` (HTTP 200) when the athlete
   * has no measurement for the metric or the org has no tier benchmarks for it.
   */
  app.get("/api/analytics/benchmark-tiers", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const athleteId = req.query.athleteId as string;
      const metric = req.query.metric as string;
      if (!athleteId || !metric) {
        return res.status(400).json({ message: "athleteId and metric are required" });
      }

      // Permission check: athletes can only view their own data
      const statsPermission = canViewUserStats(user, athleteId);
      if (!statsPermission.allowed) {
        return res.status(403).json({ message: statsPermission.reason });
      }

      // Resolve the organization whose tier benchmarks apply to this athlete.
      // SECURITY: Validate the requester shares the athlete's org via DB membership.
      const athleteOrgs = await db
        .select({ organizationId: userOrganizations.organizationId })
        .from(userOrganizations)
        .where(eq(userOrganizations.userId, athleteId));
      const athleteOrgIds = athleteOrgs.map((o) => o.organizationId);

      let organizationId: string | null = null;
      if (isSiteAdmin(user)) {
        organizationId = athleteOrgIds[0] ?? null;
      } else {
        const requesterOrgs = await storage.getUserOrganizations(user.id);
        const requesterOrgIds = new Set(requesterOrgs.map((o) => o.organizationId));
        organizationId = athleteOrgIds.find((id) => requesterOrgIds.has(id)) ?? null;
        if (!organizationId) {
          return res.status(403).json({ message: getAuthorizationError(AUTH_ERRORS.ATHLETE_ORG_MISMATCH) });
        }
      }

      // No organization context → no org tier benchmarks apply.
      if (!organizationId) {
        return res.json({ comparison: null });
      }

      // Fetch the org's active tier benchmarks for this metric from both sources:
      // site benchmarks enabled for the org, and the org's own custom benchmarks.
      const [siteRows, customRows] = await Promise.all([
        db
          .select({ b: siteBenchmarks })
          .from(siteBenchmarks)
          .innerJoin(
            organizationBenchmarks,
            and(
              eq(organizationBenchmarks.benchmarkId, siteBenchmarks.id),
              eq(organizationBenchmarks.benchmarkType, "site"),
              eq(organizationBenchmarks.organizationId, organizationId),
              eq(organizationBenchmarks.isEnabled, true)
            )
          )
          .where(
            and(
              eq(siteBenchmarks.isActive, true),
              eq(siteBenchmarks.metricCode, metric),
              isNotNull(siteBenchmarks.tierGroupId)
            )
          ),
        db
          .select({ b: customBenchmarks })
          .from(customBenchmarks)
          .innerJoin(
            organizationBenchmarks,
            and(
              eq(organizationBenchmarks.benchmarkId, customBenchmarks.id),
              eq(organizationBenchmarks.benchmarkType, "custom"),
              eq(organizationBenchmarks.organizationId, organizationId),
              eq(organizationBenchmarks.isEnabled, true)
            )
          )
          .where(
            and(
              eq(customBenchmarks.organizationId, organizationId),
              eq(customBenchmarks.isActive, true),
              eq(customBenchmarks.metricCode, metric),
              isNotNull(customBenchmarks.tierGroupId)
            )
          ),
      ]);

      // Group tiers by source-namespaced tierGroupId (matching report-service).
      // An org may have multiple tier groups enabled for a metric; pick one
      // deterministically (lowest displayOrder, then group key) and evaluate it.
      const allTierRows = [
        ...siteRows.map(({ b }) => ({ ...b, _source: "site" })),
        ...customRows.map(({ b }) => ({ ...b, _source: "custom" })),
      ];
      const groups = new Map<string, any[]>();
      for (const row of allTierRows) {
        const key = `${row._source}:${row.tierGroupId}`;
        const group = groups.get(key) || [];
        group.push(row);
        groups.set(key, group);
      }

      let tiers: any[] = [];
      if (groups.size > 0) {
        const sortedKeys = [...groups.keys()].sort((a, b) => {
          const minOrder = (g: any[]) => Math.min(...g.map((t) => t.displayOrder ?? 999));
          const da = minOrder(groups.get(a)!);
          const dbOrder = minOrder(groups.get(b)!);
          if (da !== dbOrder) return da - dbOrder;
          return a < b ? -1 : a > b ? 1 : 0;
        });
        tiers = groups
          .get(sortedKeys[0])!
          .slice()
          .sort((x, y) => (x.tierOrder ?? 0) - (y.tierOrder ?? 0));
      }

      // Determine metric direction (mirrors ReportService.getMetricInfo).
      const metricRow = await db
        .select({ metricType: siteMetrics.metricType })
        .from(siteMetrics)
        .where(eq(siteMetrics.code, metric))
        .limit(1)
        .then((rows) => rows[0]);
      const lowerIsBetter = metricRow ? metricRow.metricType === "lower_is_better" : true;

      // Compute the athlete's best verified value for the metric in this org.
      const measurementRows = await db
        .select({ value: measurements.value })
        .from(measurements)
        .where(
          and(
            eq(measurements.userId, athleteId),
            eq(measurements.metric, metric),
            eq(measurements.isVerified, true),
            eq(measurements.organizationId, organizationId)
          )
        );
      const values = measurementRows
        .map((r) => parseFloat(String(r.value)))
        .filter((v) => !Number.isNaN(v));
      const bestValue =
        values.length === 0 ? null : lowerIsBetter ? Math.min(...values) : Math.max(...values);

      const comparison =
        bestValue == null || tiers.length === 0
          ? null
          : evaluateTierBenchmark(bestValue, lowerIsBetter, tiers);

      res.json({ comparison });
    } catch (err) {
      console.error("[GET /api/analytics/benchmark-tiers]", err);
      res.status(500).json({ message: "Failed to compute benchmark tiers" });
    }
  });
}
