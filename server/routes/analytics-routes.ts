/**
 * Analytics routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, asyncHandler } from "../middleware";
import { storage } from "../storage";

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

    const filters = { organizationId: organizationId as string | undefined };
    const measurements = await storage.getMeasurements(filters);

    // Basic analytics aggregation
    const analytics = {
      totalMeasurements: measurements.length,
      verifiedCount: measurements.filter(m => m.isVerified === true).length,
      metricBreakdown: measurements.reduce((acc, m) => {
        acc[m.metric] = (acc[m.metric] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    res.json(analytics);
  }));

  /**
   * Get dashboard analytics (POST for complex queries)
   */
  app.post("/api/analytics/dashboard", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId, metrics, dateRange } = req.body;

    const filters = {
      organizationId,
      metric: metrics?.join(','),
      startDate: dateRange?.start,
      endDate: dateRange?.end
    };

    const measurements = await storage.getMeasurements(filters);

    const analytics = {
      totalMeasurements: measurements.length,
      dateRange: dateRange || { start: null, end: null },
      results: measurements
    };

    res.json(analytics);
  }));

  /**
   * Get team analytics
   */
  app.get("/api/analytics/teams", analyticsLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const teams = await storage.getTeams(organizationId as string | undefined);

    const analytics = {
      totalTeams: teams.length,
      activeTeams: teams.filter(t => t.isArchived !== true).length,
      archivedTeams: teams.filter(t => t.isArchived === true).length,
      levelBreakdown: teams.reduce((acc, t) => {
        const level = t.level || 'Unknown';
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    res.json(analytics);
  }));
}
