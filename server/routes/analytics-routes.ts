/**
 * Analytics routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { asyncHandler } from "../utils/errors";
import { AnalyticsService as DashboardAnalyticsService } from "../services/analytics-service";
import { AnalyticsService } from "../analytics";
import { env } from "../config/env";

const analyticsService = new AnalyticsService();
const dashboardAnalyticsService = new DashboardAnalyticsService();

const analyticsLimiter = rateLimit({
  windowMs: env.ANALYTICS_RATE_WINDOW_MS,
  limit: env.ANALYTICS_RATE_LIMIT,
  message: { message: env.ANALYTICS_RATE_LIMIT_MESSAGE },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerAnalyticsRoutes(app: Express) {
  /**
   * Get dashboard analytics (GET) - Simple dashboard stats
   */
  app.get("/api/analytics/dashboard", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const analytics = await dashboardAnalyticsService.getDashboardAnalytics(
      { organizationId: organizationId as string | undefined },
      req.session.user!.id
    );

    res.json(analytics);
  }));

  /**
   * Get dashboard analytics (POST) - Full analytics with charts
   */
  app.post("/api/analytics/dashboard", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    try {
      const request = req.body;
      
      // Validate request has required fields
      if (!request.filters || !request.metrics || !request.timeframe) {
        return res.status(400).json({ 
          message: 'Invalid request: missing required fields (filters, metrics, timeframe)' 
        });
      }
      
      // Compute full analytics response with chart data
      const analytics = await analyticsService.getAnalyticsData(request);

      res.json(analytics);
    } catch (error) {
      console.error('Analytics POST error:', error);
      throw error;
    }
  }));

  /**
   * Get team analytics
   */
  app.get("/api/analytics/teams", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const analytics = await dashboardAnalyticsService.getTeamAnalytics(
      organizationId as string | undefined,
      req.session.user!.id
    );

    res.json(analytics);
  }));
}
