/**
 * Wellness Tables
 *
 * wellnessTemplates, wellnessRequests, wellnessResponses
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";

export const wellnessTemplates = pgTable("wellness_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: 'cascade' }), // Nullable for system templates
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  config: jsonb("config").notNull(), // Question definitions and settings
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  // Library fields (added in wellness library feature)
  category: text("category"), // e.g., "general", "recovery", "performance", "injury", "training"
  tags: text("tags").array(), // e.g., ["daily", "wellness", "fatigue"]
  isSystemSeeded: boolean("is_system_seeded").default(false).notNull(), // True for pre-built system templates
  sourceTemplateId: varchar("source_template_id"), // ID of template this was cloned from (self-reference, no FK to allow deleting source)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Existing indexes (migrations 0002, 0003)
  orgIdx: index("wellness_templates_org_idx").on(table.organizationId),
  activeIdx: index("wellness_templates_active_idx").on(table.isActive),
  categoryIdx: index("wellness_templates_category_idx").on(table.category),
  systemSeededIdx: index("wellness_templates_system_seeded_idx").on(table.isSystemSeeded),

  // Performance indexes (migration 0056)
  // Active system templates for library queries
  systemActiveIdx: index("idx_wellness_templates_system_active")
    .on(table.isSystemSeeded, table.isActive, table.createdAt.desc())
    .where(sql`${table.organizationId} IS NULL AND ${table.isActive} = true`),
  // Organization's active templates
  orgActiveIdx: index("idx_wellness_templates_org_active")
    .on(table.organizationId, table.isActive, table.createdAt.desc())
    .where(sql`${table.organizationId} IS NOT NULL`),
}));

export const wellnessRequests = pgTable("wellness_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull().references(() => wellnessTemplates.id, { onDelete: 'cascade' }),
  requestedBy: varchar("requested_by").references(() => users.id, { onDelete: 'set null' }),
  distributionMethod: varchar("distribution_method", { length: 50 }).notNull(), // 'magic_link', 'athlete_account', 'team_link', 'qr_code'
  targetAthleteIds: text("target_athlete_ids").array(), // Specific athletes
  targetTeamIds: text("target_team_ids").array(), // All athletes in teams
  publicToken: varchar("public_token", { length: 64 }).unique(), // For magic links/QR codes
  requiresAuth: boolean("requires_auth").default(false).notNull(),
  scheduledFor: timestamp("scheduled_for"), // For scheduled requests
  expiresAt: timestamp("expires_at"), // Optional expiration
  status: varchar("status", { length: 20 }).default('active').notNull(), // 'active', 'completed', 'expired', 'cancelled'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("wellness_requests_org_idx").on(table.organizationId),
  tokenIdx: index("wellness_requests_token_idx").on(table.publicToken),
  statusIdx: index("wellness_requests_status_idx").on(table.status),
  scheduledIdx: index("wellness_requests_scheduled_idx").on(table.scheduledFor),
}));

export const wellnessResponses = pgTable("wellness_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Historical references - NO foreign key constraints (follows measurements table pattern)
  requestId: varchar("request_id").references(() => wellnessRequests.id, { onDelete: 'set null' }),
  organizationId: varchar("organization_id").notNull(), // Historical reference (no FK)
  templateId: varchar("template_id").notNull(), // Historical reference (no FK)
  userId: varchar("user_id").notNull(), // Historical reference (no FK)
  userFullName: text("user_full_name").notNull(), // Snapshot at submission
  teamId: varchar("team_id"), // Historical reference (no FK)
  teamNameSnapshot: text("team_name_snapshot"), // Team name at submission
  submittedAt: timestamp("submitted_at").notNull(),
  date: date("date").notNull(), // Date of wellness assessment
  responses: jsonb("responses").notNull(), // Question answers
  accessMethod: varchar("access_method", { length: 50 }), // How athlete accessed the form
  ipAddress: varchar("ip_address", { length: 45 }), // IPv6 max length
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Existing indexes (migrations 0002, 0049)
  userIdx: index("wellness_responses_user_idx").on(table.userId),
  orgIdx: index("wellness_responses_org_idx").on(table.organizationId),
  dateIdx: index("wellness_responses_date_idx").on(table.date),
  teamIdx: index("wellness_responses_team_idx").on(table.teamId),
  submittedIdx: index("wellness_responses_submitted_idx").on(table.submittedAt),
  // Composite index for user + date queries (common pattern)
  userDateIdx: index("wellness_responses_user_date_idx").on(table.userId, table.date),

  // Performance indexes (migration 0056)
  // Recent responses index for dashboard queries
  recentIdx: index("idx_wellness_responses_recent")
    .on(table.submittedAt.desc()),
  // Composite org + date + submitted_at for dashboard queries
  orgDateSubmittedIdx: index("idx_wellness_responses_org_date_submitted")
    .on(table.organizationId, table.date.desc(), table.submittedAt.desc()),
  // Request completion lookups (duplicate submission checks)
  requestUserIdx: index("idx_wellness_responses_request_user")
    .on(table.requestId, table.userId)
    .where(sql`${table.requestId} IS NOT NULL`),
  // Team + date composite for team analytics
  teamDateSubmittedIdx: index("idx_wellness_responses_team_date_submitted")
    .on(table.teamId, table.date.desc(), table.submittedAt.desc())
    .where(sql`${table.teamId} IS NOT NULL`),
  // User response history with ordering for pagination
  userSubmittedIdx: index("idx_wellness_responses_user_submitted")
    .on(table.userId, table.submittedAt.desc()),
}));

export const wellnessSchedules = pgTable("wellness_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull(),
  createdBy: varchar("created_by").notNull(),
  // Distribution config
  distributionMethod: varchar("distribution_method", { length: 50 }).notNull(),
  targetAthleteIds: text("target_athlete_ids").array(),
  targetTeamIds: text("target_team_ids").array(),
  requiresAuth: boolean("requires_auth").notNull().default(false),
  // Recurrence config
  recurrenceType: varchar("recurrence_type", { length: 20 }).notNull(), // 'daily', 'weekly', 'custom'
  daysOfWeek: integer("days_of_week").array(), // 0=Sun..6=Sat (for weekly)
  customIntervalDays: integer("custom_interval_days"), // e.g. 3 = every 3 days (for custom)
  scheduledTime: varchar("scheduled_time", { length: 5 }).notNull(), // HH:mm format
  timezone: varchar("timezone", { length: 50 }).notNull().default('America/New_York'),
  // End conditions
  endDate: timestamp("end_date"),
  maxOccurrences: integer("max_occurrences"),
  occurrencesSent: integer("occurrences_sent").notNull().default(0),
  // Lifecycle
  nextRunAt: timestamp("next_run_at").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('active'), // 'active', 'paused', 'completed', 'cancelled'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  nextRunIdx: index("wellness_schedules_next_run_idx").on(table.nextRunAt, table.status),
  orgIdx: index("wellness_schedules_org_idx").on(table.organizationId),
}));
