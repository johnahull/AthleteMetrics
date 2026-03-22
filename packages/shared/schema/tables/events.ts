/**
 * Events Tables
 *
 * events, eventRegistrations, eventInvitations, eventMetrics, eventFreezeOverrides
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { eventVisibilityEnum, eventStatusEnum, registrationModeEnum, resultsVisibilityEnum, registrationStatusEnum, eventInvitationStatusEnum } from "../enums";
import { organizations, teams, users } from "./core";
import { siteMetrics } from "./metrics";
import { reports } from "./reports";

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: 'cascade' }),

  // Event details
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  location: text("location"),
  eventType: varchar("event_type", { length: 50 }),

  // Scheduling
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  timezone: varchar("timezone", { length: 50 }).default("America/New_York").notNull(),

  // Visibility and registration
  visibility: text("visibility", { enum: eventVisibilityEnum }).default("org_private").notNull(),
  registrationMode: text("registration_mode", { enum: registrationModeEnum }).default("open").notNull(),
  status: text("status", { enum: eventStatusEnum }).default("draft").notNull(),

  // Registration settings
  registrationOpensAt: timestamp("registration_opens_at"),
  registrationClosesAt: timestamp("registration_closes_at"),
  maxRegistrations: integer("max_registrations"),
  eventCode: varchar("event_code", { length: 20 }).unique(),

  // Results publishing
  resultsVisibility: text("results_visibility", { enum: resultsVisibilityEnum }).default("after_event").notNull(),
  resultsPublishedAt: timestamp("results_published_at"),
  resultsPublishedBy: varchar("results_published_by").references(() => users.id, { onDelete: 'set null' }),

  // Auto-share reports on finalization
  autoShareReports: boolean("auto_share_reports").default(false).notNull(),
  autoShareReportTemplateId: varchar("auto_share_report_template_id").references(() => reports.id, { onDelete: 'set null' }),
  autoShareMessage: text("auto_share_message"),
  finalizedAt: timestamp("finalized_at"),

  // Freeze mechanism
  isFrozen: boolean("is_frozen").default(false).notNull(),
  frozenAt: timestamp("frozen_at"),
  frozenBy: varchar("frozen_by").references(() => users.id, { onDelete: 'set null' }),
  frozenReason: text("frozen_reason"),

  // Audit
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  orgIdx: index("events_org_idx").on(table.organizationId),
  statusIdx: index("events_status_idx").on(table.status),
  visibilityIdx: index("events_visibility_idx").on(table.visibility),
  startDateIdx: index("events_start_date_idx").on(table.startDate),
  codeIdx: index("events_code_idx").on(table.eventCode),
  orgStatusIdx: index("events_org_status_idx").on(table.organizationId, table.status),
}));

export const eventRegistrations = pgTable("event_registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),

  // Historical snapshot (no FK for user - like measurements)
  userId: varchar("user_id").notNull(),
  userFullNameSnapshot: text("user_full_name_snapshot").notNull(),
  organizationIdSnapshot: varchar("organization_id_snapshot"),
  organizationNameSnapshot: text("organization_name_snapshot"),

  // Registration details
  status: text("status", { enum: registrationStatusEnum }).default("pending").notNull(),
  registrationNumber: integer("registration_number"),
  discoveryMethod: text("discovery_method"),
  waitlistPosition: integer("waitlist_position"),

  // Workflow timestamps
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  declinedAt: timestamp("declined_at"),
  declinedBy: varchar("declined_by").references(() => users.id, { onDelete: 'set null' }),
  declineReason: text("decline_reason"),

  // Check-in tracking
  checkedInAt: timestamp("checked_in_at"),
  checkedInBy: varchar("checked_in_by").references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp("completed_at"),

  // Notes
  athleteNotes: text("athlete_notes"),
  adminNotes: text("admin_notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  uniqueUserPerEvent: unique("event_registrations_event_user_unique").on(table.eventId, table.userId),
  eventIdx: index("event_registrations_event_idx").on(table.eventId),
  userIdx: index("event_registrations_user_idx").on(table.userId),
  statusIdx: index("event_registrations_status_idx").on(table.status),
  eventStatusIdx: index("event_registrations_event_status_idx").on(table.eventId, table.status),
  waitlistIdx: index("event_registrations_waitlist_idx").on(table.eventId, table.waitlistPosition),
}));

export const eventInvitations = pgTable("event_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  email: text("email"),
  token: text("token").notNull().unique(),
  status: text("status", { enum: eventInvitationStatusEnum }).default("pending").notNull(),
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by").references(() => users.id, { onDelete: 'set null' }),
  emailSent: boolean("email_sent").default(false).notNull(),
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  eventIdx: index("event_invitations_event_idx").on(table.eventId),
  userIdx: index("event_invitations_user_idx").on(table.userId),
  tokenIdx: index("event_invitations_token_idx").on(table.token),
  emailIdx: index("event_invitations_email_idx").on(table.email),
  statusIdx: index("event_invitations_status_idx").on(table.status),
}));

export const eventMetrics = pgTable("event_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  displayOrder: integer("display_order").default(999).notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  customLabel: varchar("custom_label", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueMetricPerEvent: unique("event_metrics_event_metric_unique").on(table.eventId, table.metricCode),
  eventIdx: index("event_metrics_event_idx").on(table.eventId),
  displayOrderIdx: index("event_metrics_display_order_idx").on(table.eventId, table.displayOrder),
}));

export const eventFreezeOverrides = pgTable("event_freeze_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: varchar("resource_id"),
  overriddenBy: varchar("overridden_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  justification: text("justification"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  eventIdx: index("event_freeze_overrides_event_idx").on(table.eventId),
  actionIdx: index("event_freeze_overrides_action_idx").on(table.action),
  userIdx: index("event_freeze_overrides_user_idx").on(table.overriddenBy),
}));
