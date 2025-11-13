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
      imports: "🚧 Pending migration"
    },
    status: "Migration nearly complete - 10/11 modules refactored"
  };
}