/**
 * Core Tables
 *
 * Core entities for multi-tenant structure: Organizations, Teams, Users, Athlete Profiles, and User-Team relationships.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, date, boolean, unique, index } from "drizzle-orm/pg-core";
import { organizationTypeEnum } from "../enums";

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  location: text("location"),
  // Organization type for metric and benchmark filtering
  orgType: text("org_type", { enum: organizationTypeEnum }).default('club').notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Benchmark feature flags (added in migration 0024)
  benchmarksEnabled: boolean("benchmarks_enabled").default(false).notNull(),
  allowCustomBenchmarks: boolean("allow_custom_benchmarks").default(false).notNull(),
  // AI Coaching Insights feature flags (added in migrations 0037)
  aiEnabledBySiteAdmin: boolean("ai_enabled_by_site_admin").default(false).notNull(),
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
  // Wellness module feature flag (added in migration 0054)
  wellnessEnabled: boolean("wellness_enabled").default(true).notNull(),
  // Membership request feature flags (added in migration 0069)
  joinCode: varchar("join_code", { length: 20 }).unique(),
  isPublicDirectory: boolean("is_public_directory").default(false).notNull(),
  allowMembershipRequests: boolean("allow_membership_requests").default(true).notNull(),
  autoApproveRequests: boolean("auto_approve_requests").default(false).notNull(),
  // Events module feature flag (added in migration 0079)
  eventsEnabled: boolean("events_enabled").default(false).notNull(),
  // Custom organization metrics feature flag (added in migration 0093)
  customMetricsEnabled: boolean("custom_metrics_enabled").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  level: text("level"), // "Club", "HS", "College"
  sport: text("sport"), // "Soccer", "Basketball", etc.
  notes: text("notes"),
  // Temporal archiving fields
  archivedAt: timestamp("archived_at"),
  season: text("season"), // "2024-Fall", "2025-Spring"
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: team names must be unique within an organization
  uniqueTeamPerOrg: unique("teams_organization_id_name_unique").on(table.organizationId, table.name),
  // Performance index for common queries
  orgNameIndex: index("teams_org_name_idx").on(table.organizationId, table.name),
}));

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  emails: text("emails").array().notNull().default(sql`ARRAY[]::text[]`),
  password: text("password"), // Nullable for OAuth-only accounts
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  fullName: text("full_name").notNull(),
  // Athlete-specific fields (optional)
  birthDate: date("birth_date"), // Changed from birthday to birthDate
  birthYear: integer("birth_year"), // Computed from birthDate
  graduationYear: integer("graduation_year"),
  school: text("school"),
  phoneNumbers: text("phone_numbers").array(),
  sports: text("sports").array(), // ["Soccer"] - restricted to soccer only
  positions: text("positions").array(), // ["F", "M", "D", "GK"] for soccer positions
  height: integer("height"), // inches
  weight: integer("weight"), // pounds
  gender: text("gender").$type<"Male" | "Female" | "Not Specified">(), // CHECK constraint in migration
  // Enhanced Authentication fields
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  mfaSecret: text("mfa_secret"), // TOTP secret
  backupCodes: text("backup_codes").array(), // Recovery codes
  lastLoginAt: timestamp("last_login_at"),
  loginAttempts: integer("login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  isEmailVerified: boolean("is_email_verified").default(false).notNull(),
  requiresPasswordChange: boolean("requires_password_change").default(false).notNull(),
  passwordChangedAt: timestamp("password_changed_at"),
  // OAuth provider fields
  googleId: text("google_id").unique(),
  appleId: text("apple_id").unique(),
  oauthProvider: text("oauth_provider").$type<"google" | "apple" | "password">(),
  oauthEmail: text("oauth_email"),
  oauthEmailVerified: boolean("oauth_email_verified").default(false).notNull(),
  lastAuthMethod: text("last_auth_method").$type<"password" | "google" | "apple">(),
  accountLinkedAt: timestamp("account_linked_at"),
  // System fields
  isSiteAdmin: boolean("is_site_admin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete - user marked as deleted but data preserved
  // Peer comparison display preference (controls UI visibility, not data sharing - all measurements contribute to anonymous peer pool)
  showPeerComparisons: boolean("show_peer_comparisons").default(true).notNull(),
  peerComparisonConsentedAt: timestamp("peer_comparison_consented_at"), // Legacy: kept for historical records
  /**
   * Legal acceptance tracking
   *
   * legalAcceptedAt: Timestamp when user accepted Terms of Service and Privacy Policy
   *   - NULL for grandfathered users (existed before legal acceptance requirement)
   *   - Required for all new users (registration, invitation, OAuth signup)
   *
   * legalAcceptedVersion: Version identifier for accepted terms (YYYY-MM-DD format)
   *   - Represents the date/time when user accepted, NOT the policy document version
   *   - Used for compliance auditing and potential future re-acceptance flows
   *   - Example: "2024-12-13"
   *
   * Compliance notes:
   *   - Both fields must be set together for new users
   *   - Audit logs are created in parallel (see audit_logs table)
   *   - Grandfathered users (NULL values) are assumed to have implicitly accepted
   */
  legalAcceptedAt: timestamp("legal_accepted_at"),
  legalAcceptedVersion: text("legal_accepted_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Optional athlete profiles for performance-specific data
export const athleteProfiles = pgTable("athlete_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  emergencyContact: text("emergency_contact"),
  medicalNotes: text("medical_notes"),
  coachNotes: text("coach_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userTeams = pgTable("user_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  // Temporal membership fields
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"), // NULL = currently active
  season: text("season"), // "2024-Fall", "2025-Spring"
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
