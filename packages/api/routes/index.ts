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
import { registerBenchmarkAnalyticsRoutes } from "./benchmark-analytics-routes";
import { registerReportRoutes } from "./report-routes";
import { registerDashboardTrendsRoutes } from "./dashboard-trends";
import { registerSearchRoutes } from "./search-routes";
import siteSettingsRoutes from "./site-settings-routes";
import { registerWellnessRoutes } from "./wellness-routes";
import { registerAdminWellnessRoutes } from "./admin-wellness-routes";
import { registerSportsRoutes } from "./sport-routes";
import { registerGoalRoutes } from "./goal-routes";
import { registerAchievementRoutes } from "./achievement-routes";
import { registerGlobalAthleteRoutes } from "./global-athlete-routes";
import { registerInvitationRoutes } from "./invitation-routes";
import { registerMembershipRequestRoutes } from "./membership-request-routes";
import { registerImportExportRoutes } from "./import-export-routes";
import { registerProfileRoutes } from "./profile-routes";
import { registerAdminUtilityRoutes } from "./admin-utility-routes";
import { registerAdminSecurityRoutes } from "./admin-security-routes";
import { registerRegistrationRoutes } from "./registration-routes";
import enhancedAuthRoutes from "./enhanced-auth";
import { registerPushNotificationRoutes } from "./push-notification-routes";
import { registerNotificationPreferencesRoutes } from "./notification-preferences-routes";
import { registerOrgNotificationRoutes } from "./org-notification-routes";

/**
 * Register all application routes
 */
export function registerAllRoutes(app: Express) {
  // Authentication routes
  registerAuthRoutes(app);

  // Enhanced authentication routes (MFA, email verification, password reset)
  app.use("/api/enhanced-auth", enhancedAuthRoutes);

  // Registration routes (public self-signup)
  registerRegistrationRoutes(app);

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

  // Benchmark analytics routes
  registerBenchmarkAnalyticsRoutes(app);

  // Report management routes
  registerReportRoutes(app);

  // Global search routes (command palette)
  registerSearchRoutes(app);

  // Site settings routes (AI model configuration)
  app.use("/api/site-settings", siteSettingsRoutes);

  // Wellness questionnaire routes
  registerWellnessRoutes(app);

  // Admin wellness routes (site admin only)
  registerAdminWellnessRoutes(app);

  // Sports and positions management routes
  registerSportsRoutes(app);

  // Goal management routes
  registerGoalRoutes(app);

  // Achievement & badge system routes
  registerAchievementRoutes(app);

  // Global athlete cross-organization identity routes
  registerGlobalAthleteRoutes(app);

  // Invitation management routes
  registerInvitationRoutes(app);

  // Membership request routes (athlete self-service join requests)
  registerMembershipRequestRoutes(app);

  // Import/Export routes (CSV/photo import and data export)
  registerImportExportRoutes(app);

  // Profile and user management routes
  registerProfileRoutes(app);

  // Admin utility routes (data cleanup, testing)
  registerAdminUtilityRoutes(app);

  // Admin security routes (security metrics, monitoring)
  registerAdminSecurityRoutes(app);

  // Push notification routes (Web Push subscription management)
  registerPushNotificationRoutes(app);

  // Notification preferences routes (user notification settings)
  registerNotificationPreferencesRoutes(app);

  // Organization notification routes (org admin settings)
  registerOrgNotificationRoutes(app);

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
      sports: "✅ Registered (new service)",
      goals: "✅ Registered (new service)",
      achievements: "✅ Registered (new service)",
      globalAthletes: "✅ Registered (new service)",
      invitations: "✅ Registered (new service)",
      importExport: "✅ Registered (new service)"
    },
    status: "Migration complete - 16/16 modules refactored"
  };
}
