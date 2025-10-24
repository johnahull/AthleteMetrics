/**
 * Analytics and statistics routes
 * Uses AnalyticsService for direct DB access instead of storage layer
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { AnalyticsService } from "../services/analytics-service";
import { requireAuth, requireSiteAdmin } from "../middleware";

// Helper function to check if user is site admin
function isSiteAdmin(user: any): boolean {
  return user?.isSiteAdmin === true;
}

// Rate limiting for analytics endpoints
// Analytics queries can be expensive, so we use stricter limits
const analyticsLimiter = rateLimit({
  windowMs: parseInt(process.env.ANALYTICS_RATE_WINDOW_MS || '900000'), // 15 minutes default
  limit: parseInt(process.env.ANALYTICS_RATE_LIMIT || '50'), // 50 requests per window default
  message: {
    message: process.env.ANALYTICS_RATE_LIMIT_MESSAGE || "Too many analytics requests, please try again later."
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    // Bypass rate limiting for site admins if BYPASS_ANALYTICS_RATE_LIMIT is set and not in production
    if (process.env.NODE_ENV === 'production') {
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
      if (user.role === 'athlete' && user.athleteId !== userId) {
        return res.status(403).json({ message: "Athletes can only view their own statistics" });
      }

      // TODO: Add permission check for org admins/coaches based on organization

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

      const dashboardStats = await analyticsService.getDashboardStats(organizationId);
      res.json(dashboardStats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch dashboard statistics";
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
      if (user.role === 'athlete' && user.athleteId !== userId) {
        return res.status(403).json({ message: "Athletes can only view their own statistics" });
      }

      // TODO: Add permission check for org admins/coaches based on organization

      const stats = await analyticsService.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Get user stats error:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch user statistics";
      res.status(500).json({ message });
    }
  });
}
