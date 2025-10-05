/**
 * Main route registration - imports and registers all route modules
 */

import type { Express } from "express";
import { registerCsrfRoutes } from "./csrf-routes";
import { registerAuthRoutes } from "./auth-routes";
import { registerUserRoutes } from "./user-routes";
import { registerOrganizationRoutes } from "./organization-routes";
// import { registerTeamRoutes } from "./team-routes";
import { registerAthleteRoutes } from "./athlete-routes";
// import { registerMeasurementRoutes } from "./measurement-routes";
// import { registerAnalyticsRoutes } from "./analytics-routes";
// import { registerImportRoutes } from "./import-routes";
import { registerExportRoutes } from "./export-routes";
import { registerAdminRoutes } from "./admin-routes";

/**
 * Register all application routes
 */
export function registerAllRoutes(app: Express) {
  // CSRF protection (must be first)
  registerCsrfRoutes(app);

  // Authentication routes
  registerAuthRoutes(app);

  // User management routes
  registerUserRoutes(app);

  // Organization management routes
  registerOrganizationRoutes(app);

  // Athlete management routes
  registerAthleteRoutes(app);

  // Data export routes
  registerExportRoutes(app);

  // Admin & site management routes
  registerAdminRoutes(app);

  // TODO: Add remaining route modules
  // registerTeamRoutes(app);
  // registerMeasurementRoutes(app);
  // registerAnalyticsRoutes(app);
  // registerImportRoutes(app);

  console.log("✅ All routes registered successfully");
}

/**
 * Get route statistics for monitoring
 */
export function getRouteStats() {
  return {
    modules: {
      csrf: "✅ Registered",
      auth: "✅ Registered",
      users: "✅ Registered",
      organizations: "✅ Registered",
      athletes: "✅ Registered",
      exports: "✅ Registered",
      admin: "✅ Registered",
      teams: "🚧 Pending migration",
      measurements: "🚧 Pending migration",
      analytics: "🚧 Pending migration",
      imports: "🚧 Pending migration"
    },
    status: "Partial migration complete - 7/11 modules refactored"
  };
}