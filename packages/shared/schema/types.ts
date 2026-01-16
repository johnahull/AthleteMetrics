/**
 * Schema Types
 *
 * Type exports derived from database schemas.
 */

import { z } from "zod";
import * as tables from "./tables";
import * as enums from "./enums";
import * as constants from "./constants";

// ============================================================================
// Core Tables
// ============================================================================

export type Organization = typeof tables.organizations.$inferSelect;
export type Team = typeof tables.teams.$inferSelect;
export type User = typeof tables.users.$inferSelect;
export type AthleteProfile = typeof tables.athleteProfiles.$inferSelect;
export type UserTeam = typeof tables.userTeams.$inferSelect;

// ============================================================================
// Metrics Tables
// ============================================================================

export type SiteMetric = typeof tables.siteMetrics.$inferSelect;
export type OrganizationMetric = typeof tables.organizationMetrics.$inferSelect;
export type CustomOrgMetric = typeof tables.customOrgMetrics.$inferSelect;
export type InsertCustomOrgMetric = typeof tables.customOrgMetrics.$inferInsert;
export type UpdateCustomOrgMetric = Partial<InsertCustomOrgMetric>;
export type SiteSport = typeof tables.siteSports.$inferSelect;
export type SitePosition = typeof tables.sitePositions.$inferSelect;

// ============================================================================
// Benchmarks Tables
// ============================================================================

export type SiteBenchmark = typeof tables.siteBenchmarks.$inferSelect;
export type CustomBenchmark = typeof tables.customBenchmarks.$inferSelect;
export type OrganizationBenchmark = typeof tables.organizationBenchmarks.$inferSelect;

// ============================================================================
// Measurements Tables
// ============================================================================

export type Measurement = typeof tables.measurements.$inferSelect;
export type PeerPercentileCache = typeof tables.peerPercentileCache.$inferSelect;

// ============================================================================
// Membership Tables
// ============================================================================

export type UserOrganization = typeof tables.userOrganizations.$inferSelect;
export type Invitation = typeof tables.invitations.$inferSelect;
export type MembershipRequest = typeof tables.membershipRequests.$inferSelect;

// ============================================================================
// Auth Tables
// ============================================================================

export type AuditLog = typeof tables.auditLogs.$inferSelect;
export type EmailVerificationToken = typeof tables.emailVerificationTokens.$inferSelect;

// ============================================================================
// Settings Tables
// ============================================================================

export type SiteSettings = typeof tables.siteSettings.$inferSelect;

// ============================================================================
// Reports Tables
// ============================================================================

export type Report = typeof tables.reports.$inferSelect;
export type ReportSnapshot = typeof tables.reportSnapshots.$inferSelect;
export type ReportBenchmark = typeof tables.reportBenchmarks.$inferSelect;
export type ReportShare = typeof tables.reportShares.$inferSelect;

// ============================================================================
// Wellness Tables
// ============================================================================

export type WellnessTemplate = typeof tables.wellnessTemplates.$inferSelect;
export type WellnessRequest = typeof tables.wellnessRequests.$inferSelect;
export type WellnessResponse = typeof tables.wellnessResponses.$inferSelect;

// ============================================================================
// Gamification Tables
// ============================================================================

export type AchievementDefinition = typeof tables.achievementDefinitions.$inferSelect;
export type UserAchievement = typeof tables.userAchievements.$inferSelect;
export type Goal = typeof tables.goals.$inferSelect;

// ============================================================================
// Global Athletes Tables
// ============================================================================

export type GlobalAthlete = typeof tables.globalAthletes.$inferSelect;
export type UserGlobalAthleteLink = typeof tables.userGlobalAthleteLinks.$inferSelect;
export type GlobalAthleteAuditLog = typeof tables.globalAthleteAuditLog.$inferSelect;
export type GlobalAthleteClaim = typeof tables.globalAthleteClaims.$inferSelect;

// ============================================================================
// Notifications Tables
// ============================================================================

export type PushSubscriptionRecord = typeof tables.pushSubscriptions.$inferSelect;
export type NotificationPreferencesRecord = typeof tables.notificationPreferences.$inferSelect;
export type NotificationHistoryRecord = typeof tables.notificationHistory.$inferSelect;
export type OrgNotificationSettingsRecord = typeof tables.orgNotificationSettings.$inferSelect;

// ============================================================================
// Events Tables
// ============================================================================

export type Event = typeof tables.events.$inferSelect;
export type EventRegistration = typeof tables.eventRegistrations.$inferSelect;
export type EventInvitation = typeof tables.eventInvitations.$inferSelect;
export type EventMetric = typeof tables.eventMetrics.$inferSelect;
export type EventFreezeOverride = typeof tables.eventFreezeOverrides.$inferSelect;

// ============================================================================
// Enum Types
// ============================================================================

// OrganizationType type alias - exported from enums
export type OrganizationType = (typeof enums.organizationTypeEnum)[number];
// Note: There's also an OrganizationType constant object in constants.ts

// MetricType type alias - derived from metricTypeEnum
export type MetricType = (typeof enums.metricTypeEnum)[number];
// Note: There's also a MetricType constant object in constants.ts with metric code values
export type SportCode = (typeof enums.sportCodeEnum)[number];
export type MembershipRequestStatus = (typeof enums.membershipRequestStatusEnum)[number];
export type MembershipRequestDiscoveryMethod = (typeof enums.membershipRequestDiscoveryMethodEnum)[number];
export type AchievementCategory = (typeof enums.achievementCategoryEnum)[number];
export type AchievementRarity = (typeof enums.achievementRarityEnum)[number];
export type GoalType = (typeof enums.goalTypeEnum)[number];
export type GoalStatus = (typeof enums.goalStatusEnum)[number];
export type LinkStatus = (typeof enums.linkStatusEnum)[number];
export type LinkType = (typeof enums.linkTypeEnum)[number];
export type ActorType = (typeof enums.actorTypeEnum)[number];
export type ClaimStatus = (typeof enums.claimStatusEnum)[number];
export type NotificationType = (typeof enums.notificationTypeEnum)[number];
export type NotificationDeliveryStatus = (typeof enums.notificationDeliveryStatusEnum)[number];
export type NotificationChannel = (typeof enums.notificationChannelEnum)[number];
export type EventVisibility = (typeof enums.eventVisibilityEnum)[number];
export type EventStatus = (typeof enums.eventStatusEnum)[number];
export type RegistrationMode = (typeof enums.registrationModeEnum)[number];
export type ResultsVisibility = (typeof enums.resultsVisibilityEnum)[number];
export type RegistrationStatus = (typeof enums.registrationStatusEnum)[number];
export type EventInvitationStatus = (typeof enums.eventInvitationStatusEnum)[number];

// ============================================================================
// Special Types (from constants or complex derivations)
// ============================================================================

export type AIModel = typeof constants.AI_MODELS[number];

// Alias for backward compatibility
export type Athlete = User;

// ============================================================================
// Enriched/Composite Types
// ============================================================================

// Sport with its positions (for sport management UI)
export type SiteSportWithPositions = SiteSport & {
  positions: SitePosition[];
};

// Sport usage count for deletion warning
export type SiteSportUsage = {
  athleteCount: number;
  teamCount: number;
  metricCount: number;
};

// Position usage count for deletion warning
export type SitePositionUsage = {
  athleteCount: number;
};

// Enriched type for organization benchmarks with full benchmark details
export type OrganizationBenchmarkWithDetails = OrganizationBenchmark & {
  // Benchmark details (from either site_benchmarks or custom_benchmarks)
  name: string;
  metricCode: string;
  description: string | null;
  benchmarkValue: number | null;
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  minValue: number | null;
  maxValue: number | null;
  // Athlete filters
  ageMin: number | null;
  ageMax: number | null;
  gender: 'Male' | 'Female' | 'Not Specified' | null;
  position: string | null;
  level: 'college' | 'high_school' | 'club' | null;
  // Status (from site benchmarks only, custom benchmarks don't have isActive)
  isActive?: boolean;
};

// Event with registration counts
export type EventWithCounts = Event & {
  registrationCount: number;
  approvedCount: number;
  waitlistCount: number;
};

// Event metric with full details
export type EventMetricWithDetails = EventMetric & {
  metricLabel: string;
  metricType: string;
  units: string;
};

// ============================================================================
// Onboarding Types
// ============================================================================

/**
 * Response from GET /api/profile/onboarding-status
 * Note: User role is not included here as it's available from auth session context
 */
export interface OnboardingStatusResponse {
  hasCompletedOnboarding: boolean;
  isSiteAdmin: boolean;
}
