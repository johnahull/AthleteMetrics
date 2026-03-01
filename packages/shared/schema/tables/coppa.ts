/**
 * COPPA Compliance Tables
 *
 * Supports verifiable parental consent (VPC) flow as required by the
 * Children's Online Privacy Protection Act (COPPA) for operators with
 * actual knowledge of under-13 users.
 *
 * Architecture notes:
 * - parentalConsents.athleteUserId references users.id (users → parentalConsents direction)
 * - users.parentConsentId is a plain varchar (no Drizzle FK) to break the circular reference
 * - coppaAuditLog has no DELETE path exposed in the service layer (immutable, 5-year retention)
 * - dataDeletionRequests and dataExportRequests tables created now for P1 use
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { users, organizations } from "./core";
import { coppaStatusEnum, consentStatusEnum } from "../enums";

/**
 * Parental consent records (VPC — Verifiable Parental Consent)
 * One record per consent initiation event. A new record is created
 * each time consent is re-requested (revoke + re-initiate).
 */
export const parentalConsents = pgTable("parental_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Athlete whose account requires consent
  athleteUserId: varchar("athlete_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Organization context (null for independent athletes)
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: 'set null' }),

  // Parent contact
  parentEmail: text("parent_email").notNull(),

  // Token stored as SHA-256 hash (never plaintext). Used to verify email link.
  tokenHash: text("token_hash").notNull().unique(),

  // Consent decision
  status: text("status", { enum: consentStatusEnum }).default('pending').notNull(),
  aiConsentGranted: boolean("ai_consent_granted"), // null = not yet decided

  // Expiry (30 days from initiation)
  expiresAt: timestamp("expires_at").notNull(),

  // Single-use enforcement
  confirmedAt: timestamp("confirmed_at"),
  revokedAt: timestamp("revoked_at"),

  // Audit fields (IP/UA for FTC record-keeping)
  initiatedIp: varchar("initiated_ip", { length: 45 }),
  initiatedUserAgent: varchar("initiated_user_agent", { length: 500 }),
  confirmedIp: varchar("confirmed_ip", { length: 45 }),
  confirmedUserAgent: varchar("confirmed_user_agent", { length: 500 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  athleteIdx: index("parental_consents_athlete_idx").on(table.athleteUserId),
  statusIdx: index("parental_consents_status_idx").on(table.status),
  expiresIdx: index("parental_consents_expires_idx").on(table.expiresAt),
  tokenHashIdx: index("parental_consents_token_hash_idx").on(table.tokenHash),
}));

/**
 * Parent-to-athlete relationships per organization.
 * A parent can be linked to multiple athletes across organizations.
 */
export const parentAthleteLinks = pgTable("parent_athlete_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentEmail: text("parent_email").notNull(),
  athleteUserId: varchar("athlete_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: 'set null' }),
  consentId: varchar("consent_id"), // References parentalConsents.id (plain varchar to avoid circular)
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  athleteIdx: index("parent_athlete_links_athlete_idx").on(table.athleteUserId),
  parentEmailIdx: index("parent_athlete_links_parent_email_idx").on(table.parentEmail),
}));

/**
 * COPPA audit trail — immutable, 5-year retention.
 * No DELETE path is exposed in the service layer.
 * retainUntil is computed at insert time (createdAt + 5 years).
 */
export const coppaAuditLog = pgTable("coppa_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Actor
  actorUserId: varchar("actor_user_id"), // null = system or parent (no account)
  actorEmail: text("actor_email"), // for parent actions without an account
  actorIp: varchar("actor_ip", { length: 45 }),
  actorUserAgent: varchar("actor_user_agent", { length: 500 }),

  // Subject
  athleteUserId: varchar("athlete_user_id"), // athlete whose data is affected
  consentId: varchar("consent_id"), // associated consent record

  // Event
  action: varchar("action", { length: 100 }).notNull(), // e.g., CONSENT_INITIATED, CONSENT_CONFIRMED
  details: text("details"), // JSON string (sanitized — no raw tokens)

  // Retention
  createdAt: timestamp("created_at").defaultNow().notNull(),
  retainUntil: timestamp("retain_until").notNull(), // createdAt + 5 years
}, (table) => ({
  athleteIdx: index("coppa_audit_log_athlete_idx").on(table.athleteUserId),
  actionIdx: index("coppa_audit_log_action_idx").on(table.action),
  createdAtIdx: index("coppa_audit_log_created_at_idx").on(table.createdAt),
  retainUntilIdx: index("coppa_audit_log_retain_until_idx").on(table.retainUntil),
}));

/**
 * Parent-initiated hard delete requests (P1 feature).
 * Table created now to avoid future migrations.
 */
export const dataDeletionRequests = pgTable("data_deletion_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  athleteUserId: varchar("athlete_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestedByEmail: text("requested_by_email").notNull(),
  consentId: varchar("consent_id"), // References parentalConsents.id
  status: text("status", { enum: ['pending', 'processing', 'completed', 'rejected'] }).default('pending').notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  processedBy: varchar("processed_by"), // site_admin user id
  notes: text("notes"),
}, (table) => ({
  athleteIdx: index("data_deletion_requests_athlete_idx").on(table.athleteUserId),
  statusIdx: index("data_deletion_requests_status_idx").on(table.status),
}));

/**
 * Parent-initiated data export requests (P1 feature).
 * Table created now to avoid future migrations.
 */
export const dataExportRequests = pgTable("data_export_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  athleteUserId: varchar("athlete_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestedByEmail: text("requested_by_email").notNull(),
  consentId: varchar("consent_id"), // References parentalConsents.id
  status: text("status", { enum: ['pending', 'processing', 'ready', 'delivered', 'expired'] }).default('pending').notNull(),
  downloadToken: text("download_token"), // Secure one-time download link token (hashed)
  downloadExpiresAt: timestamp("download_expires_at"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  deliveredAt: timestamp("delivered_at"),
}, (table) => ({
  athleteIdx: index("data_export_requests_athlete_idx").on(table.athleteUserId),
  statusIdx: index("data_export_requests_status_idx").on(table.status),
}));
