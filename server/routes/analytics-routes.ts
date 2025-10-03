/**
 * Analytics routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { asyncHandler } from "../utils/errors";
import { AnalyticsService } from "../services/analytics-service";
import { env } from "../config/env";

const analyticsService = new AnalyticsService();

const analyticsLimiter = rateLimit({
  windowMs: env.ANALYTICS_RATE_WINDOW_MS,
  limit: env.ANALYTICS_RATE_LIMIT,
  message: { message: env.ANALYTICS_RATE_LIMIT_MESSAGE },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerAnalyticsRoutes(app: Express) {
  /**
   * Get dashboard analytics (GET)
   */
  app.get("/api/analytics/dashboard", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const analytics = await analyticsService.getDashboardAnalytics(
      { organizationId: organizationId as string | undefined },
      req.session.user!.id
    );

    res.json(analytics);
  }));

  /**
   * Get dashboard analytics (POST for complex queries)
   */
  app.post("/api/analytics/dashboard", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId, metrics, dateRange, filters } = req.body;

    // Convert MetricSelection object to string array if needed
    let metricsArray: string[] | undefined;
    if (metrics) {
      if (typeof metrics === 'object' && 'primary' in metrics) {
        // New format: { primary: string, additional: string[] }
        metricsArray = [metrics.primary, ...(metrics.additional || [])];
      } else if (Array.isArray(metrics)) {
        // Old format: string[]
        metricsArray = metrics;
      }
    }

    const analytics = await analyticsService.getDashboardAnalytics(
      { 
        organizationId: organizationId || filters?.organizationId, 
        metrics: metricsArray, 
        dateRange 
      },
      req.session.user!.id
    );

    res.json(analytics);
  }));

  /**
   * Get team analytics
   */
  app.get("/api/analytics/teams", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const analytics = await analyticsService.getTeamAnalytics(
      organizationId as string | undefined,
      req.session.user!.id
    );

    res.json(analytics);
  }));
}
