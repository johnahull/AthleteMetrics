/**
 * Main route registration - imports and registers all route modules
 */

import type { Express } from "express";
import { registerAuthRoutes } from "./auth-routes";
import { registerUserRoutes } from "./user-routes";
import { registerOrganizationRoutes } from "./organization-routes";
import { registerTeamRoutes } from "./team-routes";
import { registerAthleteRoutes } from "./athlete-routes";
import { registerMeasurementRoutes } from "./measurement-routes";
import { registerAnalyticsRoutes } from "./analytics-routes";
import { registerMetricRoutes } from "./metric-routes";
import { registerBenchmarkRoutes } from "./benchmark-routes";
import { registerReportRoutes } from "./report-routes";
import { registerDashboardTrendsRoutes } from "./dashboard-trends";
import { registerSearchRoutes } from "./search-routes";
import siteSettingsRoutes from "./site-settings-routes";
import { registerWellnessRoutes } from "./wellness-routes";
import { registerAdminWellnessRoutes } from "./admin-wellness-routes";
// import { registerImportRoutes } from "./import-routes";

/**
 * Register all application routes
 */
export function registerAllRoutes(app: Express) {
  // Authentication routes
  registerAuthRoutes(app);

  // User management routes
  registerUserRoutes(app);

  // Organization management routes
  registerOrganizationRoutes(app);

  // Athlete management routes
  registerAthleteRoutes(app);

  // Team management routes
  registerTeamRoutes(app);

  // Measurement management routes
  registerMeasurementRoutes(app);

  // Analytics routes
  registerAnalyticsRoutes(app);

  // Dashboard trends routes
  registerDashboardTrendsRoutes(app);

  // Metric management routes
  registerMetricRoutes(app);

  // Benchmark management routes
  registerBenchmarkRoutes(app);

  // Report management routes
  registerReportRoutes(app);

  // Global search routes (command palette)
  registerSearchRoutes(app);

  // Site settings routes (AI model configuration)
  app.use("/api/site-settings", siteSettingsRoutes);

  // Wellness module routes
  registerWellnessRoutes(app);
  registerAdminWellnessRoutes(app);

  // TODO: Add remaining route modules
  // registerImportRoutes(app);

  console.log("✅ All routes registered successfully");
}

/**
 * Get route statistics for monitoring
 */
export function getRouteStats() {
  return {
    modules: {
      auth: "✅ Registered",
      users: "✅ Registered",
      organizations: "✅ Registered",
      teams: "✅ Registered (new service)",
      athletes: "✅ Registered",
      measurements: "✅ Registered (new service)",
      analytics: "✅ Registered (new service)",
      metrics: "✅ Registered (new service)",
      benchmarks: "✅ Registered (new service)",
      reports: "✅ Registered (new service)",
      wellness: "✅ Registered (new module)",
      imports: "🚧 Pending migration"
    },
    status: "Migration nearly complete - 11/12 modules refactored"
  };
}