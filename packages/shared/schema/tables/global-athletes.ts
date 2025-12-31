/**
 * Global Athletes Tables
 *
 * globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog, globalAthleteClaims
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { linkStatusEnum, linkTypeEnum, actorTypeEnum, claimStatusEnum } from "../enums";
import { users } from "./core";

export const globalAthletes = pgTable("global_athletes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Verified identity information
  verifiedEmails: text("verified_emails").array().notNull().default(sql`ARRAY[]::text[]`),
  primaryEmail: text("primary_email"),
  // Canonical profile (denormalized for display)
  canonicalFirstName: text("canonical_first_name").notNull(),
  canonicalLastName: text("canonical_last_name").notNull(),
  canonicalFullName: text("canonical_full_name").notNull(),
  birthDate: date("birth_date"),
  // Privacy preferences
  allowCrossOrgLinking: boolean("allow_cross_org_linking").default(true).notNull(),
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  verifiedEmailsGinIdx: index("global_athletes_verified_emails_gin").using("gin", table.verifiedEmails),
  primaryEmailIdx: index("global_athletes_primary_email_idx").on(table.primaryEmail),
  canonicalNameIdx: index("global_athletes_canonical_name_idx").on(table.canonicalFirstName, table.canonicalLastName),
}));

export const userGlobalAthleteLinks = pgTable("user_global_athlete_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  globalAthleteId: varchar("global_athlete_id").notNull().references(() => globalAthletes.id, { onDelete: 'cascade' }),
  // Link status
  linkStatus: text("link_status", { enum: linkStatusEnum }).default('pending').notNull(),
  linkType: text("link_type", { enum: linkTypeEnum }).notNull(),
  // Approval workflow
  proposedBy: varchar("proposed_by").references(() => users.id, { onDelete: 'set null' }),
  proposedAt: timestamp("proposed_at").defaultNow().notNull(),
  confirmedBy: varchar("confirmed_by").references(() => users.id, { onDelete: 'set null' }),
  confirmedAt: timestamp("confirmed_at"),
  // Data sharing (per-link control)
  shareMeasurements: boolean("share_measurements").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Notification tracking
  notifiedAt: timestamp("notified_at"),
  notificationAcknowledgedAt: timestamp("notification_acknowledged_at"),
}, (table) => ({
  // One user links to at most one global athlete
  uniqueUserId: unique("user_global_athlete_links_user_id_unique").on(table.userId),
  globalAthleteIdIdx: index("ugal_global_athlete_id_idx").on(table.globalAthleteId),
  statusIdx: index("ugal_status_idx").on(table.linkStatus),
  // Composite index for confirmed links lookup
  globalConfirmedIdx: index("ugal_global_confirmed_idx").on(table.globalAthleteId, table.linkStatus),
}));

export const globalAthleteAuditLog = pgTable("global_athlete_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalAthleteId: varchar("global_athlete_id").notNull().references(() => globalAthletes.id, { onDelete: 'cascade' }),
  action: text("action").notNull(), // 'created', 'link_proposed', 'link_confirmed', 'link_rejected', 'privacy_changed', etc.
  actorId: varchar("actor_id").references(() => users.id, { onDelete: 'set null' }),
  actorType: text("actor_type", { enum: actorTypeEnum }).notNull(),
  details: jsonb("details").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  globalAthleteIdx: index("gaal_global_athlete_idx").on(table.globalAthleteId, table.createdAt),
  actionIdx: index("gaal_action_idx").on(table.action, table.createdAt),
}));

export const globalAthleteClaims = pgTable("global_athlete_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalAthleteId: varchar("global_athlete_id").notNull().references(() => globalAthletes.id, { onDelete: 'cascade' }),
  claimedEmail: text("claimed_email").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  status: text("status", { enum: claimStatusEnum }).default('pending').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
}, (table) => ({
  globalAthleteIdx: index("gac_global_athlete_idx").on(table.globalAthleteId),
  tokenIdx: index("gac_token_idx").on(table.token),
  emailIdx: index("gac_email_idx").on(table.claimedEmail),
  statusIdx: index("gac_status_idx").on(table.status),
}));
