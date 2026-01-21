/**
 * Schema Relations
 *
 * All Drizzle ORM relations between tables.
 * This file is generated to avoid circular dependencies.
 */

import { relations } from "drizzle-orm";
import * as tables from "./tables";

// Import all table definitions for type safety
const {
  organizations,
  teams,
  users,
  athleteProfiles,
  userTeams,
  siteMetrics,
  organizationMetrics,
  customOrgMetrics,
  siteSports,
  sitePositions,
  siteBenchmarks,
  customBenchmarks,
  organizationBenchmarks,
  measurements,
  peerPercentileCache,
  userOrganizations,
  invitations,
  membershipRequests,
  auditLogs,
  sessions,
  emailVerificationTokens,
  accountLinkingTokens,
  siteSettings,
  reports,
  reportSnapshots,
  reportBenchmarks,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses,
  achievementDefinitions,
  userAchievements,
  goals,
  globalAthletes,
  userGlobalAthleteLinks,
  globalAthleteAuditLog,
  globalAthleteClaims,
  pushSubscriptions,
  notificationPreferences,
  notificationHistory,
  orgNotificationSettings,
  events,
  eventRegistrations,
  eventInvitations,
  eventMetrics,
  eventFreezeOverrides,
} = tables;

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));


export const organizationsRelations = relations(organizations, ({ many }) => ({
  teams: many(teams),
  userOrganizations: many(userOrganizations),
  invitations: many(invitations),
  membershipRequests: many(membershipRequests),
  organizationMetrics: many(organizationMetrics),
  customOrgMetrics: many(customOrgMetrics),
  customBenchmarks: many(customBenchmarks),
  organizationBenchmarks: many(organizationBenchmarks),
  reports: many(reports),
  wellnessTemplates: many(wellnessTemplates),
  wellnessRequests: many(wellnessRequests),
}));


export const siteMetricsRelations = relations(siteMetrics, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [siteMetrics.createdBy],
    references: [users.id],
  }),
  organizationMetrics: many(organizationMetrics),
}));


export const organizationMetricsRelations = relations(organizationMetrics, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMetrics.organizationId],
    references: [organizations.id],
  }),
  siteMetric: one(siteMetrics, {
    fields: [organizationMetrics.metricCode],
    references: [siteMetrics.code],
  }),
}));


export const customOrgMetricsRelations = relations(customOrgMetrics, ({ one }) => ({
  organization: one(organizations, {
    fields: [customOrgMetrics.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [customOrgMetrics.createdBy],
    references: [users.id],
  }),
}));


export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  userTeams: many(userTeams),
}));


export const usersRelations = relations(users, ({ many, one }) => ({
  userOrganizations: many(userOrganizations),
  userTeams: many(userTeams),
  measurements: many(measurements, { relationName: "userMeasurements" }),
  submittedMeasurements: many(measurements, { relationName: "submittedMeasurements" }),
  verifiedMeasurements: many(measurements, { relationName: "verifiedMeasurements" }),
  invitationsSent: many(invitations),
  emailVerificationTokens: many(emailVerificationTokens),
  sessions: many(sessions),
  reportsCreated: many(reports, { relationName: "reportsCreated" }),
  reportSnapshotsCreated: many(reportSnapshots, { relationName: "reportSnapshotsCreated" }),
  wellnessTemplatesCreated: many(wellnessTemplates, { relationName: "wellnessTemplatesCreated" }),
  wellnessRequestsCreated: many(wellnessRequests, { relationName: "wellnessRequestsCreated" }),
  goals: many(goals),
  athleteProfile: one(athleteProfiles, {
    fields: [users.id],
    references: [athleteProfiles.userId],
  }),
}));


export const athleteProfilesRelations = relations(athleteProfiles, ({ one }) => ({
  user: one(users, {
    fields: [athleteProfiles.userId],
    references: [users.id],
  }),
}));


export const userOrganizationsRelations = relations(userOrganizations, ({ one }) => ({
  user: one(users, {
    fields: [userOrganizations.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganizations.organizationId],
    references: [organizations.id],
  }),
}));


export const userTeamsRelations = relations(userTeams, ({ one }) => ({
  user: one(users, {
    fields: [userTeams.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [userTeams.teamId],
    references: [teams.id],
  }),
}));


export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
  player: one(users, {
    fields: [invitations.playerId],
    references: [users.id],
  }),
}));


export const membershipRequestsRelations = relations(membershipRequests, ({ one }) => ({
  user: one(users, {
    fields: [membershipRequests.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [membershipRequests.organizationId],
    references: [organizations.id],
  }),
  processedByUser: one(users, {
    fields: [membershipRequests.processedBy],
    references: [users.id],
  }),
}));


export const measurementsRelations = relations(measurements, ({ one }) => ({
  user: one(users, {
    fields: [measurements.userId],
    references: [users.id],
    relationName: "userMeasurements",
  }),
  submittedBy: one(users, {
    fields: [measurements.submittedBy],
    references: [users.id],
    relationName: "submittedMeasurements",
  }),
  verifiedBy: one(users, {
    fields: [measurements.verifiedBy],
    references: [users.id],
    relationName: "verifiedMeasurements",
  }),
}));


export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));


export const siteBenchmarksRelations = relations(siteBenchmarks, ({ one, many }) => ({
  metric: one(siteMetrics, {
    fields: [siteBenchmarks.metricCode],
    references: [siteMetrics.code],
  }),
  createdBy: one(users, {
    fields: [siteBenchmarks.createdBy],
    references: [users.id],
  }),
  organizationBenchmarks: many(organizationBenchmarks),
}));


export const customBenchmarksRelations = relations(customBenchmarks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [customBenchmarks.organizationId],
    references: [organizations.id],
  }),
  metric: one(siteMetrics, {
    fields: [customBenchmarks.metricCode],
    references: [siteMetrics.code],
  }),
  createdBy: one(users, {
    fields: [customBenchmarks.createdBy],
    references: [users.id],
  }),
  organizationBenchmarks: many(organizationBenchmarks),
}));


export const organizationBenchmarksRelations = relations(organizationBenchmarks, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationBenchmarks.organizationId],
    references: [organizations.id],
  }),
}));


export const reportsRelations = relations(reports, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [reports.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [reports.createdBy],
    references: [users.id],
    relationName: "reportsCreated",
  }),
  snapshots: many(reportSnapshots),
  benchmarks: many(reportBenchmarks),
}));


export const reportSnapshotsRelations = relations(reportSnapshots, ({ one }) => ({
  report: one(reports, {
    fields: [reportSnapshots.reportId],
    references: [reports.id],
  }),
  createdBy: one(users, {
    fields: [reportSnapshots.createdBy],
    references: [users.id],
    relationName: "reportSnapshotsCreated",
  }),
  revokedBy: one(users, {
    fields: [reportSnapshots.revokedBy],
    references: [users.id],
  }),
}));


export const reportBenchmarksRelations = relations(reportBenchmarks, ({ one }) => ({
  report: one(reports, {
    fields: [reportBenchmarks.reportId],
    references: [reports.id],
  }),
  metric: one(siteMetrics, {
    fields: [reportBenchmarks.metricCode],
    references: [siteMetrics.code],
  }),
}));


export const globalAthletesRelations = relations(globalAthletes, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [globalAthletes.createdBy],
    references: [users.id],
  }),
  links: many(userGlobalAthleteLinks),
  auditLogs: many(globalAthleteAuditLog),
}));


export const userGlobalAthleteLinksRelations = relations(userGlobalAthleteLinks, ({ one }) => ({
  user: one(users, {
    fields: [userGlobalAthleteLinks.userId],
    references: [users.id],
  }),
  globalAthlete: one(globalAthletes, {
    fields: [userGlobalAthleteLinks.globalAthleteId],
    references: [globalAthletes.id],
  }),
  proposedBy: one(users, {
    fields: [userGlobalAthleteLinks.proposedBy],
    references: [users.id],
    relationName: "proposedLinks",
  }),
  confirmedBy: one(users, {
    fields: [userGlobalAthleteLinks.confirmedBy],
    references: [users.id],
    relationName: "confirmedLinks",
  }),
}));


export const globalAthleteAuditLogRelations = relations(globalAthleteAuditLog, ({ one }) => ({
  globalAthlete: one(globalAthletes, {
    fields: [globalAthleteAuditLog.globalAthleteId],
    references: [globalAthletes.id],
  }),
  actor: one(users, {
    fields: [globalAthleteAuditLog.actorId],
    references: [users.id],
  }),
}));


export const wellnessTemplatesRelations = relations(wellnessTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [wellnessTemplates.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [wellnessTemplates.createdBy],
    references: [users.id],
  }),
  requests: many(wellnessRequests),
}));


export const wellnessRequestsRelations = relations(wellnessRequests, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [wellnessRequests.organizationId],
    references: [organizations.id],
  }),
  template: one(wellnessTemplates, {
    fields: [wellnessRequests.templateId],
    references: [wellnessTemplates.id],
  }),
  requestedBy: one(users, {
    fields: [wellnessRequests.requestedBy],
    references: [users.id],
  }),
  responses: many(wellnessResponses),
}));


export const wellnessResponsesRelations = relations(wellnessResponses, ({ one }) => ({
  request: one(wellnessRequests, {
    fields: [wellnessResponses.requestId],
    references: [wellnessRequests.id],
  }),
}));


export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, {
    fields: [goals.userId],
    references: [users.id],
  }),
}));


export const achievementDefinitionsRelations = relations(achievementDefinitions, ({ many }) => ({
  userAchievements: many(userAchievements),
}));


export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, {
    fields: [userAchievements.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userAchievements.organizationId],
    references: [organizations.id],
  }),
  achievement: one(achievementDefinitions, {
    fields: [userAchievements.achievementId],
    references: [achievementDefinitions.id],
  }),
}));


export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));


export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));


export const notificationHistoryRelations = relations(notificationHistory, ({ one }) => ({
  user: one(users, {
    fields: [notificationHistory.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [notificationHistory.orgId],
    references: [organizations.id],
  }),
}));


export const orgNotificationSettingsRelations = relations(orgNotificationSettings, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgNotificationSettings.orgId],
    references: [organizations.id],
  }),
  updatedByUser: one(users, {
    fields: [orgNotificationSettings.updatedBy],
    references: [users.id],
  }),
}));


export const eventsRelations = relations(events, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [events.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [events.createdBy],
    references: [users.id],
  }),
  resultsPublishedByUser: one(users, {
    fields: [events.resultsPublishedBy],
    references: [users.id],
  }),
  frozenByUser: one(users, {
    fields: [events.frozenBy],
    references: [users.id],
  }),
  registrations: many(eventRegistrations),
  invitations: many(eventInvitations),
  metrics: many(eventMetrics),
  freezeOverrides: many(eventFreezeOverrides),
}));


export const eventRegistrationsRelations = relations(eventRegistrations, ({ one }) => ({
  event: one(events, {
    fields: [eventRegistrations.eventId],
    references: [events.id],
  }),
  approvedByUser: one(users, {
    fields: [eventRegistrations.approvedBy],
    references: [users.id],
  }),
  declinedByUser: one(users, {
    fields: [eventRegistrations.declinedBy],
    references: [users.id],
  }),
  checkedInByUser: one(users, {
    fields: [eventRegistrations.checkedInBy],
    references: [users.id],
  }),
}));


export const eventInvitationsRelations = relations(eventInvitations, ({ one }) => ({
  event: one(events, {
    fields: [eventInvitations.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventInvitations.userId],
    references: [users.id],
  }),
  invitedByUser: one(users, {
    fields: [eventInvitations.invitedBy],
    references: [users.id],
  }),
  cancelledByUser: one(users, {
    fields: [eventInvitations.cancelledBy],
    references: [users.id],
  }),
}));


export const eventMetricsRelations = relations(eventMetrics, ({ one }) => ({
  event: one(events, {
    fields: [eventMetrics.eventId],
    references: [events.id],
  }),
  metric: one(siteMetrics, {
    fields: [eventMetrics.metricCode],
    references: [siteMetrics.code],
  }),
}));


export const eventFreezeOverridesRelations = relations(eventFreezeOverrides, ({ one }) => ({
  event: one(events, {
    fields: [eventFreezeOverrides.eventId],
    references: [events.id],
  }),
  overriddenByUser: one(users, {
    fields: [eventFreezeOverrides.overriddenBy],
    references: [users.id],
  }),
}));
