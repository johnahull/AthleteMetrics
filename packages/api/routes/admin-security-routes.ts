/**
 * Admin security routes - security monitoring and metrics endpoints
 * Protected by requireSiteAdmin middleware
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { securityMetricsService } from "../services/security-metrics-service";

/**
 * Rate limiter for security metrics endpoint
 * Prevents DoS via expensive aggregation queries
 */
const securityMetricsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: 10, // 10 requests per minute
  standardHeaders: "draft-7",
  message: { message: "Too many requests. Please try again later." },
});

export function registerAdminSecurityRoutes(app: Express) {
  /**
   * Get security metrics including 403 error patterns
   * Query params:
   *   - window: time window in minutes (default: 60)
   *
   * Rate limited: 10 requests per minute (aggregation queries are expensive)
   */
  app.get(
    "/api/admin/security-metrics",
    requireAuth,
    requireSiteAdmin,
    securityMetricsLimiter,
    async (req, res) => {
      try {
        // Parse time window from query parameter
        const windowMinutes = req.query.window
          ? parseInt(req.query.window as string)
          : 60;

        // Validate window parameter
        if (isNaN(windowMinutes) || windowMinutes < 1 || windowMinutes > 10080) {
          return res.status(400).json({
            message:
              "Invalid time window. Must be between 1 minute and 7 days (10080 minutes).",
          });
        }

        // Fetch security metrics
        const metrics = await securityMetricsService.getMetrics(windowMinutes);

        res.json(metrics);
      } catch (error) {
        console.error("[security:metrics] Error fetching metrics:", error);
        res.status(500).json({
          message: "Failed to fetch security metrics. Please try again later.",
        });
      }
    }
  );

  console.log("✅ Admin security routes registered");
}
