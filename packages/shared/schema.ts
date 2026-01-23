/**
 * Database Schema - Refactored Barrel Export
 *
 * BACKWARD COMPATIBILITY GUARANTEE
 *
 * This file re-exports all schema components from the new domain-based structure in schema/.
 * All existing imports from "@shared/schema" continue to work without changes.
 *
 * Schema Organization:
 * -------------------
 * schema/
 * ├── enums.ts              - All PostgreSQL enum type definitions
 * ├── constants.ts          - Constants (MetricType object, TeamLevel, Gender, etc.)
 * ├── types.ts              - TypeScript type exports from tables and enums
 * ├── relations.ts          - Drizzle ORM relations between tables
 * ├── validation.ts         - Zod validation schemas (temporarily re-exports from original)
 * └── tables/               - Domain-based table definitions
 *     ├── core.ts           - organizations, teams, users, athleteProfiles, userTeams
 *     ├── metrics.ts        - siteMetrics, organizationMetrics, siteSports, sitePositions
 *     ├── benchmarks.ts     - siteBenchmarks, customBenchmarks, organizationBenchmarks
 *     ├── measurements.ts   - measurements, peerPercentileCache
 *     ├── membership.ts     - userOrganizations, invitations, membershipRequests
 *     ├── auth.ts           - auditLogs, sessions, emailVerificationTokens, accountLinkingTokens
 *     ├── settings.ts       - siteSettings
 *     ├── reports.ts        - reports, reportSnapshots, reportBenchmarks
 *     ├── wellness.ts       - wellnessTemplates, wellnessRequests, wellnessResponses
 *     ├── gamification.ts   - achievementDefinitions, userAchievements, goals
 *     ├── global-athletes.ts - globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog, globalAthleteClaims
 *     ├── notifications.ts  - pushSubscriptions, notificationPreferences, notificationHistory, orgNotificationSettings
 *     └── events.ts         - events, eventRegistrations, eventInvitations, eventMetrics, eventFreezeOverrides
 *
 * Migration Notes:
 * ---------------
 * - Validation schemas are still imported from the original schema-original.ts file
 * - Future work: Split validation schemas into domain-based files (validation/core.ts, etc.)
 * - The original monolithic schema.ts (3,328 lines) is backed up as schema-original.ts
 *
 * Benefits:
 * --------
 * - Improved maintainability: Domain-based organization makes finding tables easier
 * - Better IDE performance: Smaller files load and typecheck faster
 * - Easier collaboration: Reduces merge conflicts in large files
 * - Clearer dependencies: Import statements show cross-domain relationships
 * - Backward compatible: Zero breaking changes for existing code
 */

// Re-export everything from the new modular schema structure
export * from "./schema/index";

// Re-export validation schemas from the original schema (temporary)
// TODO: Migrate these to schema/validation/ domain files
export {
  insertOrganizationSchema,
  updateOrganizationStatusSchema,
  updateOrganizationSchema,
  deleteOrganizationSchema,
  insertTeamSchema,
  insertUserSchema,
  insertOAuthUserSchema,
  insertAthleteProfileSchema,
  insertUserOrganizationSchema,
  insertUserTeamSchema,
  insertInvitationSchema,
  insertMeasurementSchema,
  insertSiteMetricSchema,
  updateSiteMetricSchema,
  insertOrganizationMetricSchema,
  updateOrganizationMetricSchema,
  insertSiteSportSchema,
  updateSiteSportSchema,
  insertSitePositionSchema,
  updateSitePositionSchema,
  insertSiteBenchmarkSchema,
  updateSiteBenchmarkSchema,
  tierDefinitionSchema,
  insertTierGroupSchema,
  insertCustomBenchmarkSchema,
  updateCustomBenchmarkSchema,
  insertOrganizationBenchmarkSchema,
  updateOrganizationBenchmarkSchema,
  insertReportSchema,
  updateReportSchema,
  updateReportInsightsSchema,
  insertReportSnapshotSchema,
  insertReportBenchmarkSchema,
  insertAthleteSchema,
  insertSiteSettingsSchema,
  updateSiteSettingsSchema,
  insertGoalSchema,
  updateGoalSchema,
  insertMembershipRequestSchema,
  createMembershipRequestSchema,
  updateOrgMembershipSettingsSchema,
  insertPushSubscriptionSchema,
  updateNotificationPreferencesSchema,
  updateOrgNotificationSettingsSchema,
  insertEventSchema,
  updateEventSchema,
  insertEventRegistrationSchema,
  updateEventRegistrationSchema,
  insertEventInvitationSchema,
  insertEventMetricSchema,
  updateProfileSchema,
  changePasswordSchema,
  archiveTeamSchema,
  updateTeamMembershipSchema,
  createSiteAdminSchema,
  insertBenchmarkSetSchema,
  updateBenchmarkSetSchema,
  insertBenchmarkSetItemSchema,
  updateBenchmarkSetItemSchema,
  reorderBenchmarkSetItemsSchema,
} from "./schema-original";

// Re-export validation types
export type {
  InsertOrganization,
  UpdateOrganization,
  UpdateOrganizationStatus,
  DeleteOrganization,
  InsertTeam,
  InsertUser,
  InsertOAuthUser,
  UpdateProfile,
  ChangePassword,
  ArchiveTeam,
  UpdateTeamMembership,
  InsertAthleteProfile,
  CreateSiteAdmin,
  InsertUserOrganization,
  InsertUserTeam,
  InsertInvitation,
  InsertAuditLog,
  InsertEmailVerificationToken,
  InsertMeasurement,
  InsertSiteMetric,
  UpdateSiteMetric,
  InsertOrganizationMetric,
  UpdateOrganizationMetric,
  InsertSiteSport,
  UpdateSiteSport,
  InsertSitePosition,
  UpdateSitePosition,
  TierDefinition,
  InsertTierGroup,
  InsertSiteBenchmark,
  UpdateSiteBenchmark,
  InsertCustomBenchmark,
  UpdateCustomBenchmark,
  InsertOrganizationBenchmark,
  UpdateOrganizationBenchmark,
  InsertReport,
  UpdateReport,
  InsertReportSnapshot,
  InsertReportBenchmark,
  InsertAthlete,
  InsertGoal,
  UpdateGoal,
  InsertMembershipRequest,
  CreateMembershipRequest,
  UpdateOrgMembershipSettings,
  InsertPushSubscription,
  UpdateNotificationPreferences,
  UpdateOrgNotificationSettings,
  InsertEvent,
  UpdateEvent,
  InsertEventRegistration,
  UpdateEventRegistration,
  InsertEventInvitation,
  InsertEventMetric,
  InsertBenchmarkSet,
  UpdateBenchmarkSet,
  InsertBenchmarkSetItem,
  UpdateBenchmarkSetItem,
  ReorderBenchmarkSetItems,
} from "./schema-original";

// Note: Complex types (SiteSportWithPositions, EventWithCounts, etc.)
// are now defined in schema/types.ts and exported via schema/index.ts
