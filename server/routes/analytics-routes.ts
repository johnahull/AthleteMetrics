/**
 * Analytics routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware";
import { asyncHandler } from "../utils/errors";
import { AnalyticsService } from "../services/analytics-service";

const analyticsService = new AnalyticsService();

const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { message: "Too many analytics requests, please try again later." },
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
    const { organizationId, metrics, dateRange } = req.body;

    const analytics = await analyticsService.getDashboardAnalytics(
      { organizationId, metrics, dateRange },
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
