/**
 * Schema Barrel Export
 *
 * Internal re-export of all schema components organized by domain.
 * This file is used by the main schema.ts for backward compatibility.
 */

// Enums
export * from "./enums";

// Tables (all domains)
export * from "./tables";

// Relations
export * from "./relations";

// Constants - export first so constant objects take precedence
export * from "./constants";

// Types - selectively export to avoid conflicts with constants
export type {
  // COPPA
  ParentalConsent, InsertParentalConsent, ParentAthleteLink, CoppaAuditLog,
  DataDeletionRequest, DataExportRequest, CoppaStatus, ConsentStatus,
  // Core
  Organization, Team, User, AthleteProfile, UserTeam,
  // Metrics
  SiteMetric, OrganizationMetric, CustomOrgMetric, InsertCustomOrgMetric, UpdateCustomOrgMetric, SiteSport, SitePosition,
  // Benchmarks
  SiteBenchmark, CustomBenchmark, OrganizationBenchmark, BenchmarkSet, BenchmarkSetItem, OrganizationBenchmarkSet,
  // Measurements
  Measurement, PeerPercentileCache,
  // Membership
  UserOrganization, Invitation, MembershipRequest,
  // Auth
  AuditLog, EmailVerificationToken,
  // Settings
  SiteSettings,
  // Reports
  Report, ReportSnapshot, ReportBenchmark, ReportShare,
  // Wellness
  WellnessTemplate, WellnessRequest, WellnessResponse, WellnessSchedule,
  // Gamification
  AchievementDefinition, UserAchievement, Goal,
  // Global Athletes
  GlobalAthlete, UserGlobalAthleteLink, GlobalAthleteAuditLog, GlobalAthleteClaim,
  // Notifications
  PushSubscriptionRecord, NotificationPreferencesRecord, NotificationHistoryRecord, OrgNotificationSettingsRecord,
  // Events
  Event, EventRegistration, EventInvitation, EventMetric, EventFreezeOverride,
  // Enum types (aliased from enums, not conflicting with constants)
  SportCode, MembershipRequestStatus, MembershipRequestDiscoveryMethod,
  AchievementCategory, AchievementRarity, GoalType, GoalStatus,
  LinkStatus, LinkType, ActorType, ClaimStatus,
  NotificationType, NotificationDeliveryStatus, NotificationChannel,
  EventVisibility, EventStatus, RegistrationMode, ResultsVisibility,
  RegistrationStatus, EventInvitationStatus,
  // Special types
  AIModel, Athlete,
  // Enriched/composite types
  SiteSportWithPositions, SiteSportUsage, SitePositionUsage,
  OrganizationBenchmarkWithDetails, EventWithCounts, EventMetricWithDetails,
  BenchmarkSetWithItems,
} from "./types";

// Re-export the type aliases that share names with constants
// TypeScript keeps types and values in separate namespaces, so both can coexist
export type { OrganizationType, MetricType } from "./types";

// Validation schemas (temporarily re-exported from original schema.ts)
export * from "./validation";
