/**
 * Main route registration - imports and registers all route modules
 */

import type { Express } from "express";
import { registerAuthRoutes } from "./auth-routes";
import { registerUserRoutes } from "./user-routes";
import { registerOrganizationRoutes } from "./organization-routes";
import { registerTeamRoutes } from "./team-routes";
import { registerAthleteRoutes } from "./athlete-routes";
import { registerHealthRoutes } from "./health-routes";
import { registerMeasurementRoutes } from "./measurement-routes";
import { registerAdminRoutes } from "./admin-routes";
// import { registerAnalyticsRoutes } from "./analytics-routes";
// import { registerImportRoutes } from "./import-routes";
// import { registerExportRoutes } from "./export-routes";
// import { registerInvitationRoutes } from "./invitation-routes";

/**
 * Register all application routes
 */
export function registerAllRoutes(app: Express) {
  // Health check routes (no auth required)
  registerHealthRoutes(app);

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

  // Measurement routes
  registerMeasurementRoutes(app);

  // Admin routes (impersonation, etc.)
  registerAdminRoutes(app);

  // TODO: Add remaining route modules
  // registerAnalyticsRoutes(app);
  // registerImportRoutes(app);
  // registerExportRoutes(app);
  // registerInvitationRoutes(app);

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
      teams: "✅ Registered",
      athletes: "✅ Registered",
      measurements: "✅ Registered",
      admin: "✅ Registered",
      analytics: "🚧 Pending migration",
      imports: "🚧 Pending migration",
      exports: "🚧 Pending migration",
      invitations: "🚧 Pending migration"
    },
    status: "Partial migration complete - 7/11 modules refactored"
  };
}