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
import { registerCustomOrgMetricRoutes } from "./custom-org-metric-routes";
import { registerBenchmarkRoutes } from "./benchmark-routes";
import { registerBenchmarkSetRoutes } from "./benchmark-set-routes";
import { registerBenchmarkAnalyticsRoutes } from "./benchmark-analytics-routes";
import { registerReportRoutes } from "./report-routes";
import { registerDashboardTrendsRoutes } from "./dashboard-trends";
import { registerSearchRoutes } from "./search-routes";
import siteSettingsRoutes from "./site-settings-routes";
import { registerWellnessRoutes } from "./wellness-routes";
import { registerAdminWellnessRoutes } from "./admin-wellness-routes";
import { registerAdminMetricExplanationRoutes } from "./admin-metric-explanation-routes";
import { registerWellnessScheduleRoutes } from "./wellness-schedule-routes";
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
import { registerEventRoutes } from "./event-routes";
import { registerEventRegistrationRoutes } from "./event-registration-routes";
import { registerEventInvitationRoutes } from "./event-invitation-routes";
import { registerEventMetricsRoutes } from "./event-metrics-routes";
import { registerEventMeasurementsRoutes } from "./event-measurements-routes";
import { registerEventResultsRoutes } from "./event-results-routes";
import { registerEventReportRoutes } from "./event-report-routes";
import enhancedAuthRoutes from "./enhanced-auth";
import { registerPushNotificationRoutes } from "./push-notification-routes";
import { registerNotificationPreferencesRoutes } from "./notification-preferences-routes";
import { registerOrgNotificationRoutes } from "./org-notification-routes";
import { registerAdminNotificationRoutes } from "./admin-notification-routes";
import { registerCoppaRoutes } from "./coppa-routes";
import { registerCoppaDeletionRoutes } from "./coppa-deletion-routes";
import { registerCoppaExportRoutes } from "./coppa-export-routes";
import { registerParentRoutes } from "./parent-routes";
import { registerParentLinkRequestRoutes } from "./parent-link-request-routes";
import { registerDeviceImportRoutes } from "./device-import-routes";
import { registerSprintFvRoutes } from "./sprint-fv-routes";

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

  // Custom organization metric routes
  registerCustomOrgMetricRoutes(app);

  // Benchmark management routes
  registerBenchmarkRoutes(app);

  // Benchmark sets routes (named collections of benchmarks)
  registerBenchmarkSetRoutes(app);

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

  // Admin metric explanation routes (site admin only)
  registerAdminMetricExplanationRoutes(app);

  // Wellness recurring schedule routes
  registerWellnessScheduleRoutes(app);

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

  // Device import routes (Dashr, OVR timing gate imports)
  registerDeviceImportRoutes(app);

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

  // Site admin notification routes (global settings and analytics)
  registerAdminNotificationRoutes(app);

  // Event registration routes (self-registration, approval, check-in)
  // IMPORTANT: Must be BEFORE registerEventRoutes because /api/events/my-registrations
  // must match before the parameterized /api/events/:eventId route
  registerEventRegistrationRoutes(app);

  // Event management routes (combines, camps, testing days)
  registerEventRoutes(app);

  // Event invitation routes (token-based invitations)
  registerEventInvitationRoutes(app);

  // Event metrics configuration routes
  registerEventMetricsRoutes(app);

  // Event measurements routes (measurements linked to events)
  registerEventMeasurementsRoutes(app);

  // Event results routes (results visibility and publishing)
  registerEventResultsRoutes(app);

  // Event report routes (event-specific reports with event percentiles)
  registerEventReportRoutes(app);

  // COPPA compliance routes (VPC flow, parental consent management)
  registerCoppaRoutes(app);

  // COPPA data deletion routes (parent data deletion requests)
  registerCoppaDeletionRoutes(app);

  // COPPA data export routes (parent data review/download)
  registerCoppaExportRoutes(app);

  // Parent account routes (linked children, read-only access)
  registerParentRoutes(app);

  // Parent link request routes (Link-a-Child workflow Phase 3)
  registerParentLinkRequestRoutes(app);

  // Sprint Force-Velocity profile routes (Morin F-V profiling)
  registerSprintFvRoutes(app);

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
