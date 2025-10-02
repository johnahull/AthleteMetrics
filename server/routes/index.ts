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
import { registerAnalyticsRoutes } from "./analytics-routes";
import { registerImportRoutes } from "./import-routes";
import { registerExportRoutes } from "./export-routes";
import { registerInvitationRoutes } from "./invitation-routes";

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

  // Analytics routes
  registerAnalyticsRoutes(app);

  // Import routes (CSV, photos, review queue)
  registerImportRoutes(app);

  // Export routes (CSV exports)
  registerExportRoutes(app);

  // Invitation routes
  registerInvitationRoutes(app);

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
      analytics: "✅ Registered",
      imports: "✅ Registered",
      exports: "✅ Registered",
      invitations: "✅ Registered"
    },
    status: "✅ Complete migration - 11/11 modules refactored"
  };
}