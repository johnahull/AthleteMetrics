/**
 * Analytics and statistics routes
 * Uses AnalyticsService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { AnalyticsService } from "../services/analytics-service";
import { AnalyticsService as AdvancedAnalyticsService } from "../analytics-simple";
import { validateAnalyticsRequest } from "../validation/analytics-validation";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { db } from "../db";
import { users, userTeams, teams } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
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
      // Note: For athletes, user.id IS their athleteId (they are the same)
      if (user.role === 'athlete' && user.id !== userId) {
        return res.status(403).json({ message: "Athletes can only view their own statistics" });
      }

      // Permission check: org admins/coaches can only view athletes in their organization
      if (!isSiteAdmin(user) && user.role !== 'athlete' && user.primaryOrganizationId) {
        // Check if athlete belongs to a team in the user's organization
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

        const isInOrganization = athleteTeams.some(t => t.organizationId === user.primaryOrganizationId);
        if (!isInOrganization) {
          return res.status(403).json({ message: "Access denied - athlete not in your organization" });
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

      // Get organizationId from query or user's primary organization
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        organizationId = user.primaryOrganizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // Permission check: non-admin users can only access their organization
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied - organization mismatch" });
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
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        organizationId = user.primaryOrganizationId;
      }

      // Site admins can view global dashboard without organizationId
      if (!organizationId && !isSiteAdmin(user)) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // Permission check: non-admin users can only access their organization
      if (organizationId && !isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied - organization mismatch" });
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
          const validTimeframes: TimeframePreset[] = ['7d', '30d', '90d', 'mtd', 'lm', 'qtd', 'ytd', 'all'];
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

      // Permission check: non-admin users can only access their organization
      if (!isSiteAdmin(user) && request.filters.organizationId !== user.primaryOrganizationId) {
        return res.status(403).json({ message: "Access denied - organization mismatch" });
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
      // Note: For athletes, user.id IS their athleteId (they are the same)
      if (user.role === 'athlete' && user.id !== userId) {
        return res.status(403).json({ message: "Athletes can only view their own statistics" });
      }

      // Permission check: org admins/coaches can only view athletes in their organization
      if (!isSiteAdmin(user) && user.role !== 'athlete' && user.primaryOrganizationId) {
        // Check if athlete belongs to a team in the user's organization
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

        const isInOrganization = athleteTeams.some(t => t.organizationId === user.primaryOrganizationId);
        if (!isInOrganization) {
          return res.status(403).json({ message: "Access denied - athlete not in your organization" });
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

      // Get organizationId from query or user's primary organization
      let organizationId = req.query.organizationId as string | undefined;

      if (!organizationId && !isSiteAdmin(user)) {
        organizationId = user.primaryOrganizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      // Permission check: non-admin users can only access their organization
      if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied - organization mismatch" });
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

      const trendsData = await analyticsService.getPerformanceTrends(organizationId, dateFrom, metrics);
      res.json(trendsData);
    } catch (error) {
      console.error("Get performance trends error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch performance trends";
      res.status(500).json({ message });
    }
  });
}
