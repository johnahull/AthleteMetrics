/**
 * Main route registration - imports and registers all route modules
 */

import type { Express } from "express";
import { registerAuthRoutes } from "./auth-routes";
import { registerUserRoutes } from "./user-routes";
import { registerOrganizationRoutes } from "./organization-routes";
// import { registerTeamRoutes } from "./team-routes";
import { registerAthleteRoutes } from "./athlete-routes";
// import { registerMeasurementRoutes } from "./measurement-routes";
// import { registerAnalyticsRoutes } from "./analytics-routes";
// import { registerImportRoutes } from "./import-routes";
import { registerAgentExampleRoutes } from "./agent-example-routes";
import { registerCodeReviewRoutes } from "./code-review-routes";

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

  // Agent routes
  registerAgentExampleRoutes(app);
  registerCodeReviewRoutes(app);

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
      auth: "✅ Registered",
      users: "✅ Registered", 
      organizations: "✅ Registered",
      teams: "🚧 Pending migration",
      athletes: "✅ Registered",
      measurements: "🚧 Pending migration", 
      analytics: "🚧 Pending migration",
      imports: "🚧 Pending migration"
    },
    status: "Partial migration complete - 4/8 modules refactored"
  };
}