/**
 * Auth Tables
 *
 * auditLogs, sessions, emailVerificationTokens, accountLinkingTokens
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { users } from "./core";

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  // Foreign key with ON DELETE SET NULL to preserve audit logs when user is deleted
  // Maintains compliance trail while allowing user cleanup
  // Note: Nullable by default in Drizzle (no .notNull() call)
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  action: varchar("action", { length: 100 }).notNull(), // e.g., "site_admin_access", "role_change", "user_create"
  resourceType: varchar("resource_type", { length: 50 }), // e.g., "organization", "user", "team"
  resourceId: varchar("resource_id", { length: 255 }), // ID of the affected resource
  details: text("details"), // JSON string with additional context (sanitized to prevent log injection)
  ipAddress: varchar("ip_address", { length: 45 }), // IPv6 max length is 45 characters
  userAgent: varchar("user_agent", { length: 500 }), // User agents can be long, but limit to prevent abuse
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient querying by user and time
  userTimeIdx: sql`CREATE INDEX IF NOT EXISTS audit_logs_user_time_idx ON ${table} (${table.userId}, ${table.createdAt} DESC)`,
  // Index for querying by action type
  actionIdx: sql`CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON ${table} (${table.action}, ${table.createdAt} DESC)`,
  // Index for querying by resource type and ID (compliance queries)
  resourceIdx: sql`CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON ${table} (${table.resourceType}, ${table.resourceId}, ${table.createdAt} DESC)`,
  // Index for time-based queries (data retention policies)
  createdAtIdx: sql`CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON ${table} (${table.createdAt} DESC)`,
}));

export const sessions = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { mode: 'date' }).notNull(),
  // Denormalized userId for efficient queries and foreign key constraint
  // Nullable to support pre-authentication sessions (flash messages, CSRF tokens, redirect tracking)
  // Provides 10-100x faster lookups than JSONB extraction
  // Partial index on non-null values ensures performance for user session lookups
  // Uses 'set null' instead of 'cascade' to require explicit session revocation with audit logging
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  // Index for efficient session cleanup and expiration queries (preserved for connect-pg-simple compatibility)
  expireIdx: index("IDX_session_expire").on(table.expire),
  // Partial BTREE index on userId column (only indexes non-null values)
  // Excludes pre-authentication sessions (null userId) for better performance
  // Native column index is 10-100x faster than JSONB expression index
  userIdIdx: sql`CREATE INDEX IF NOT EXISTS session_user_id_idx ON ${table} (${table.userId}) WHERE ${table.userId} IS NOT NULL`,
}));

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  isUsed: boolean("is_used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient token lookup
  tokenIdx: sql`CREATE INDEX IF NOT EXISTS email_verification_tokens_token_idx ON ${table} (${table.token})`,
}));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // SHA-256 hash of the reset token — the raw token is only ever in the emailed
  // link, never stored, so a leaked DB row cannot be used to reset a password.
  tokenHash: text("token_hash").notNull().unique(),
  isUsed: boolean("is_used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashIdx: sql`CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON ${table} (${table.tokenHash})`,
}));

export const securityEvents = pgTable("security_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  eventType: text("event_type").notNull(),
  eventData: text("event_data"),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  severity: text("severity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accountLinkingTokens = pgTable("account_linking_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text("token").notNull().unique(),
  provider: text("provider").notNull().$type<"google" | "apple">(),
  providerId: text("provider_id").notNull(), // googleId or appleId from OAuth provider
  providerEmail: text("provider_email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient token lookup
  tokenIdx: sql`CREATE INDEX IF NOT EXISTS account_linking_tokens_token_idx ON ${table} (${table.token})`,
  // Index for user_id lookups
  userIdIdx: sql`CREATE INDEX IF NOT EXISTS account_linking_tokens_user_id_idx ON ${table} (${table.userId})`,
  // Index for token expiry cleanup (added in migration 0072)
  expiresAtIdx: sql`CREATE INDEX IF NOT EXISTS account_linking_tokens_expires_at_idx ON ${table} (${table.expiresAt})`,
}));
