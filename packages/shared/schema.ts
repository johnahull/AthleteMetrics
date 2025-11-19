import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { PASSWORD_REQUIREMENTS, PASSWORD_REGEX } from "./password-requirements";
import { validateUsername } from "./username-validation";

// AI Coaching Insights constants
export const MAX_INSIGHTS_LENGTH = 10000;

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  location: text("location"),
  isActive: boolean("is_active").default(true).notNull(),
  // Benchmark feature flags (added in migration 0024)
  benchmarksEnabled: boolean("benchmarks_enabled").default(false).notNull(),
  allowCustomBenchmarks: boolean("allow_custom_benchmarks").default(false).notNull(),
  // AI Coaching Insights feature flags (added in migrations 0037)
  aiEnabledBySiteAdmin: boolean("ai_enabled_by_site_admin").default(false).notNull(),
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
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
  uniqueTeamPerOrg: unique().on(table.organizationId, table.name),
  // Performance index for common queries
  orgNameIndex: index("teams_org_name_idx").on(table.organizationId, table.name),
}));

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  emails: text("emails").array().notNull().default(sql`ARRAY[]::text[]`),
  password: text("password").notNull(),
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
  // System fields
  isSiteAdmin: boolean("is_site_admin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete - user marked as deleted but data preserved
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

// Site-level metric definitions (master catalog)
export const siteMetrics = pgTable("site_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(), // "FLY10_TIME", "CUSTOM_SPRINT_20M"
  label: varchar("label", { length: 100 }).notNull(), // "10-Yard Fly Time"
  category: varchar("category", { length: 50 }), // "speed", "agility", "strength", "power"
  unit: varchar("unit", { length: 20 }), // "s", "in", "mph", "m"
  lowerIsBetter: boolean("lower_is_better").default(true).notNull(),
  isSystemDefault: boolean("is_system_default").default(false).notNull(), // Cannot be deleted
  isActive: boolean("is_active").default(true).notNull(), // Can be globally disabled by site admin
  displayOrder: integer("display_order"),
  description: text("description"),
  // Advanced properties for sport-specific configuration
  sportAssociations: text("sport_associations").array(), // ["Soccer", "Basketball"]
  validationMin: decimal("validation_min", { precision: 10, scale: 3 }), // Minimum valid value
  validationMax: decimal("validation_max", { precision: 10, scale: 3 }), // Maximum valid value
  decimalPrecision: integer("decimal_precision").default(3).notNull(), // Decimal places for display
  // Display settings
  color: varchar("color", { length: 20 }), // Hex color or Tailwind class
  icon: varchar("icon", { length: 50 }), // Icon identifier
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }), // Site admin who created
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  activeIdx: index("site_metrics_active_idx").on(table.isActive),
  codeIdx: index("site_metrics_code_idx").on(table.code),
  categoryIdx: index("site_metrics_category_idx").on(table.category),
}));

// Organization-level metric enablement (org opt-in to site metrics)
export const organizationMetrics = pgTable("organization_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  displayOrder: integer("display_order"), // Org-specific ordering
  customLabel: varchar("custom_label", { length: 100 }), // Org can customize label
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  uniqueOrgMetric: unique().on(table.organizationId, table.metricCode),
  orgIdx: index("org_metrics_org_idx").on(table.organizationId),
  orgEnabledIdx: index("org_metrics_org_enabled_idx").on(table.organizationId, table.isEnabled),
}));

// Site-level benchmark definitions (master catalog)
export const siteBenchmarks = pgTable("site_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  benchmarkValue: decimal("benchmark_value", { precision: 10, scale: 3 }).notNull(),
  comparisonOperator: varchar("comparison_operator", { length: 10 }).default('lte').notNull(), // 'lte', 'gte', 'eq'
  // Athlete attribute filters (NULL = applies to all)
  gender: varchar("gender", { length: 20 }), // "Male", "Female", "Not Specified"
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  position: varchar("position", { length: 50 }),
  level: varchar("level", { length: 50 }),
  // Control flags
  isSystemDefault: boolean("is_system_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(999).notNull(),
  // Display settings
  color: varchar("color", { length: 20 }),
  icon: varchar("icon", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  metricIdx: index("site_benchmarks_metric_idx").on(table.metricCode),
  activeIdx: index("site_benchmarks_active_idx").on(table.isActive),
  metricActiveIdx: index("site_benchmarks_metric_active_idx").on(table.metricCode, table.isActive),
  // Composite index for filtering with INCLUDE clause (migration 0024)
  filtersIdx: index("site_benchmarks_filters_idx").on(table.metricCode, table.gender, table.level),
  // Unique constraint for semantic conflict resolution (migration 0030)
  uniqueMetricName: unique("site_benchmarks_metric_name_unique").on(table.metricCode, table.name),
}));

// Organization-specific custom benchmarks
export const customBenchmarks = pgTable("custom_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  benchmarkValue: decimal("benchmark_value", { precision: 10, scale: 3 }).notNull(),
  comparisonOperator: varchar("comparison_operator", { length: 10 }).default('lte').notNull(),
  // Athlete attribute filters
  gender: varchar("gender", { length: 20 }), // "Male", "Female", "Not Specified"
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  position: varchar("position", { length: 50 }),
  level: varchar("level", { length: 50 }),
  // Control flags
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(999).notNull(),
  // Display settings
  color: varchar("color", { length: 20 }),
  icon: varchar("icon", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  orgIdx: index("custom_benchmarks_org_idx").on(table.organizationId),
  metricIdx: index("custom_benchmarks_metric_idx").on(table.metricCode),
  orgActiveIdx: index("custom_benchmarks_org_active_idx").on(table.organizationId, table.isActive),
}));

// Organization-level benchmark enablement
export const organizationBenchmarks = pgTable("organization_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  benchmarkId: varchar("benchmark_id").notNull(),
  benchmarkType: varchar("benchmark_type", { length: 10 }).notNull(), // 'site' or 'custom'
  isEnabled: boolean("is_enabled").default(true).notNull(),
  customName: varchar("custom_name", { length: 100 }),
  displayOrder: integer("display_order").default(999).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  uniqueOrgBenchmark: unique().on(table.organizationId, table.benchmarkId, table.benchmarkType),
  // Partial unique index for display_order (migration 0024)
  displayOrderUnique: unique("org_benchmarks_display_order_unique").on(table.organizationId, table.displayOrder),
  // Note: orgIdx removed as redundant (org_benchmarks_org_enabled_idx covers single-column queries via leftmost prefix rule)
  orgEnabledIdx: index("org_benchmarks_org_enabled_idx").on(table.organizationId, table.isEnabled),
  benchmarkIdx: index("org_benchmarks_benchmark_idx").on(table.benchmarkId, table.benchmarkType),
  // Additional indexes from migrations 0026-0028
  typeIdIdx: index("org_benchmarks_type_id_idx").on(table.benchmarkType, table.benchmarkId),
  orgBenchmarkIdx: index("org_benchmarks_org_benchmark_idx").on(table.organizationId, table.benchmarkId),
  enabledIdx: index("org_benchmarks_enabled_idx").on(table.isEnabled),
}));

export const measurements = pgTable("measurements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Historical reference fields - NO foreign key constraints
  // These are immutable snapshots in time that may reference deleted users
  userId: varchar("user_id").notNull(), // Athlete - historical reference (no FK)
  submittedBy: varchar("submitted_by").notNull(), // Who recorded it - historical reference (no FK)
  verifiedBy: varchar("verified_by"), // Who verified it - historical reference (no FK)
  isVerified: boolean("is_verified").default(false).notNull(),
  date: date("date").notNull(),
  age: integer("age").notNull(), // User's age at time of measurement
  metric: text("metric").notNull(), // "FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI"
  value: decimal("value", { precision: 10, scale: 3 }).notNull(),
  units: text("units").notNull(), // "s" or "in"
  flyInDistance: decimal("fly_in_distance", { precision: 10, scale: 3 }), // Optional yards for FLY10_TIME
  notes: text("notes"),
  // Team context fields - immutable snapshot of team at time of measurement
  // IMPORTANT: teamId is historical reference WITHOUT foreign key constraint
  // This allows measurements to retain team context even after team deletion/rename
  teamId: varchar("team_id"), // Team ID at time of measurement (no FK - historical reference like userId)
  teamNameSnapshot: text("team_name_snapshot"), // Team name at time of measurement (immutable)
  organizationId: varchar("organization_id"), // Organization ID at time of measurement (no FK - historical reference)
  season: text("season"), // Season designation (e.g., "2024-Fall")
  teamContextAuto: boolean("team_context_auto").default(true).notNull(), // Whether team was auto-assigned vs manually selected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userOrganizations = pgTable("user_organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  role: text("role").notNull(), // "org_admin", "coach", "athlete" - EXACTLY ONE per user per organization
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Enforce exactly one role per user per organization
  uniqueUserOrgRole: sql`UNIQUE(${table.userId}, ${table.organizationId})`
}));

export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  firstName: text("first_name"), // Optional pre-filled name
  lastName: text("last_name"), // Optional pre-filled name
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  teamIds: text("team_ids").array(),
  playerId: varchar("player_id").references(() => users.id, { onDelete: 'set null' }), // Reference to existing athlete (kept as playerId for DB compatibility). NULL if user was deleted (preserves invitation history)
  role: text("role").notNull(), // "athlete", "coach", "org_admin"
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: 'set null' }), // User who sent invitation. NULL if user was deleted (preserves invitation history)
  token: text("token").notNull().unique(),
  // Enhanced tracking fields
  status: text("status").default("pending"), // "pending", "accepted", "expired", "cancelled" - made nullable for backward compatibility
  isUsed: boolean("is_used").default(false).notNull(),
  emailSent: boolean("email_sent").default(false).notNull(),
  emailSentAt: timestamp("email_sent_at"),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: 'set null' }), // User ID created from invitation
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by").references(() => users.id, { onDelete: 'set null' }),
  lastAttemptAt: timestamp("last_attempt_at"), // Track failed acceptance attempts
  attemptCount: integer("attempt_count").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Audit log for security-sensitive operations
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

// PostgreSQL session store for connect-pg-simple
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

// Email verification tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  isUsed: boolean("is_used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient token lookup
  tokenIdx: sql`CREATE INDEX IF NOT EXISTS email_verification_tokens_token_idx ON ${table} (${table.token})`,
}));

// Site Settings - Global site configuration (singleton table)
export const siteSettings = pgTable("site_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  aiModel: text("ai_model").notNull().default("gpt-5-nano"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
});

// Reports - Performance reporting system
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),

  // Report identification
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  reportType: varchar("report_type", { length: 50 }).notNull(), // 'team' or 'individual'

  // Report configuration (JSONB for flexibility)
  config: jsonb("config").notNull(),
  /* config structure:
  {
    "timeframe": {
      "type": "preset" | "custom",
      "preset": "season" | "year" | "all_time",
      "customStart": "2025-01-01",
      "customEnd": "2025-12-31"
    },
    "metrics": ["FLY10_TIME", "VERTICAL_JUMP"],
    "benchmarks": {
      "site": ["benchmark-id-1"],
      "custom": ["custom-benchmark-id-1"],
      "userDefined": [
        {"metricCode": "FLY10_TIME", "value": 1.30, "label": "Coach Target"}
      ]
    },
    "compositeIndex": {
      "enabled": true,
      "weights": {"FLY10_TIME": 0.4, "VERTICAL_JUMP": 0.6}
    },
    "filters": {
      "teamIds": ["team-id-1"],
      "gender": "Male",
      "positions": ["F", "M"]
    }
  }
  */

  // AI Coaching Insights (added in migration 0038)
  coachingInsights: text("coaching_insights"),
  coachingInsightsGeneratedAt: timestamp("coaching_insights_generated_at"),
  coachingInsightsModel: text("coaching_insights_model"),

  // Metadata
  isTemplate: boolean("is_template").default(false).notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  orgIdx: index("reports_org_idx").on(table.organizationId),
  createdByIdx: index("reports_created_by_idx").on(table.createdBy),
  typeIdx: index("reports_type_idx").on(table.reportType),
  orgTypeIdx: index("reports_org_type_idx").on(table.organizationId, table.reportType),
  pinnedIdx: index("reports_pinned_idx").on(table.isPinned),
  orgPinnedIdx: index("reports_org_pinned_idx").on(table.organizationId, table.isPinned),
}));

// Public report snapshots (shareable URLs)
export const reportSnapshots = pgTable("report_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => reports.id, { onDelete: 'cascade' }),
  publicToken: varchar("public_token", { length: 64 }).notNull().unique(), // URL-safe token for public access

  // Snapshot data (immutable at creation time)
  snapshotData: jsonb("snapshot_data").notNull(),
  /* snapshotData structure:
  {
    "reportConfig": {...},
    "generatedAt": "2025-01-15T10:00:00Z",
    "generatedBy": "user-id",
    "dataSnapshot": {
      // All computed report data frozen at generation time
      "athletes": [...],
      "rankings": [...],
      "benchmarkComparisons": {...}
    }
  }
  */

  // Access control
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by").references(() => users.id, { onDelete: 'set null' }),

  // Analytics
  viewCount: integer("view_count").default(0).notNull(),
  lastViewedAt: timestamp("last_viewed_at"),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("report_snapshots_token_idx").on(table.publicToken),
  reportIdx: index("report_snapshots_report_idx").on(table.reportId),
  expiresIdx: index("report_snapshots_expires_idx").on(table.expiresAt),
  activeIdx: index("report_snapshots_active_idx").on(table.isActive),
  activeExpiresIdx: index("report_snapshots_active_expires_idx").on(table.isActive, table.expiresAt),
}));

// User-defined benchmarks for reports (in addition to site/custom benchmarks)
export const reportBenchmarks = pgTable("report_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => reports.id, { onDelete: 'cascade' }),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code),

  // Benchmark definition
  name: varchar("name", { length: 100 }).notNull(),
  benchmarkValue: decimal("benchmark_value", { precision: 10, scale: 3 }).notNull(),
  comparisonOperator: varchar("comparison_operator", { length: 10 }).default('lte').notNull(), // 'lte', 'gte', 'eq'

  // Optional filters (NULL = applies to all)
  gender: varchar("gender", { length: 20 }),
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  position: varchar("position", { length: 50 }),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  reportIdx: index("report_benchmarks_report_idx").on(table.reportId),
  metricIdx: index("report_benchmarks_metric_idx").on(table.metricCode),
}));

// Relations
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
  organizationMetrics: many(organizationMetrics),
  customBenchmarks: many(customBenchmarks),
  organizationBenchmarks: many(organizationBenchmarks),
  reports: many(reports),
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

// Insert schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  isActive: true, // Managed by system
  deletedAt: true, // Managed by system
});

// Organization status update schema
export const updateOrganizationStatusSchema = z.object({
  isActive: z.boolean(),
});

// Organization general update schema (for settings page)
export const updateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(200, "Organization name must be 200 characters or less").optional(),
  description: z.string().max(1000, "Description must be 1000 characters or less").optional().nullable(),
  location: z.string().max(200, "Location must be 200 characters or less").optional().nullable(),
  isActive: z.boolean().optional(),
  benchmarksEnabled: z.boolean().optional(),
  allowCustomBenchmarks: z.boolean().optional(),
  aiEnabledBySiteAdmin: z.boolean().optional(), // Only site admin can set this
  aiEnabled: z.boolean().optional(), // Org admin can set this
}).refine(
  (data) => {
    // If allowCustomBenchmarks is being set to true, benchmarksEnabled must also be true
    if (data.allowCustomBenchmarks === true && data.benchmarksEnabled === false) {
      return false;
    }
    return true;
  },
  {
    message: "Custom benchmarks can only be enabled when benchmarks feature is enabled",
    path: ["allowCustomBenchmarks"],
  }
);

// Organization deletion validation schema
export const deleteOrganizationSchema = z.object({
  confirmationName: z.string().min(1, "Organization name confirmation is required"),
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  archivedAt: true, // Managed by system
  isArchived: true, // Managed by system
}).extend({
  name: z.string().trim().min(1, "Team name is required"),
  organizationId: z.string().optional(), // Made optional for client-side, server will provide it
  season: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  level: z.enum(['Club', 'HS', 'College']).optional(),
  sport: z.string().trim().optional(), // "Soccer", "Basketball", etc.
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  fullName: true,
  birthYear: true, // birthYear is computed from birthDate, so exclude from input
}).extend({
  username: z.string().refine((username) => {
    const result = validateUsername(username);
    return result.valid;
  }, (username) => {
    const result = validateUsername(username);
    return { message: result.errors[0] || "Invalid username" };
  }),
  emails: z.array(z.string().email("Invalid email format")).min(1, "At least one email is required"),
  password: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
    .regex(PASSWORD_REGEX.lowercase, "Password must contain at least one lowercase letter")
    .regex(PASSWORD_REGEX.uppercase, "Password must contain at least one uppercase letter")
    .regex(PASSWORD_REGEX.number, "Password must contain at least one number")
    .regex(PASSWORD_REGEX.specialChar, "Password must contain at least one special character"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["site_admin", "org_admin", "coach", "athlete"]).default("athlete"),
  isSiteAdmin: z.boolean().default(false).optional(),
  birthDate: z.string().optional().refine((date) => {
    if (!date) return true;
    const d = new Date(date);
    return !isNaN(d.getTime()) && d <= new Date();
  }, "Invalid birth date or future date"),
  teamIds: z.array(z.string().min(1, "Team ID required")).optional(),
  sports: z.array(z.enum(["Soccer"])).optional(),
  positions: z.array(z.enum(["F", "M", "D", "GK"])).optional(),
  phoneNumbers: z.array(z.string().min(1, "Phone number cannot be empty")).optional(),
  gender: z.enum(["Male", "Female", "Not Specified"]).optional(),
});

export const insertAthleteProfileSchema = createInsertSchema(athleteProfiles).omit({
  id: true,
  createdAt: true,
});

export const updateProfileSchema = z.object({
  emails: z.array(z.string().email("Invalid email format")).optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength, `New password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
    .regex(PASSWORD_REGEX.lowercase, "New password must contain at least one lowercase letter")
    .regex(PASSWORD_REGEX.uppercase, "New password must contain at least one uppercase letter")
    .regex(PASSWORD_REGEX.number, "New password must contain at least one number")
    .regex(PASSWORD_REGEX.specialChar, "New password must contain at least one special character"),
  confirmPassword: z.string().min(PASSWORD_REQUIREMENTS.minLength, `Confirm password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Team archiving schemas
export const archiveTeamSchema = z.object({
  teamId: z.string().min(1, "Team ID is required"),
  archiveDate: z.coerce.date()
    .optional() // Defaults to now
    .refine((date) => !date || date <= new Date(), "Archive date cannot be in the future"),
  season: z.string().min(1, "Season is required"), // "2024-Fall Soccer"
});

export const updateTeamMembershipSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  teamId: z.string().min(1, "Team ID is required"),
  leftAt: z.coerce.date().optional(),
  season: z.string().optional(),
  joinedAt: z.coerce.date().optional(), // For validation purposes
}).refine((data) => {
  // Validate that leftAt is after joinedAt when both are present
  if (data.leftAt && data.joinedAt) {
    return data.leftAt >= data.joinedAt;
  }
  return true;
}, {
  message: "Team membership end date must be after join date",
  path: ["leftAt"]
}).refine((data) => {
  // Validate that dates are not unreasonably in the future
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  
  if (data.leftAt && data.leftAt > oneYearFromNow) {
    return false;
  }
  if (data.joinedAt && data.joinedAt > oneYearFromNow) {
    return false;
  }
  return true;
}, {
  message: "Dates cannot be more than one year in the future",
  path: ["leftAt"]
});

export const insertUserOrganizationSchema = createInsertSchema(userOrganizations).omit({
  id: true,
  createdAt: true,
});

export const insertUserTeamSchema = createInsertSchema(userTeams).omit({
  id: true,
  createdAt: true,
  joinedAt: true, // Managed by system
  isActive: true, // Managed by system
}).extend({
  season: z.string().optional(),
  leftAt: z.coerce.date().optional(),
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
  token: true,
  isUsed: true,
}).extend({
  email: z.string().email("Invalid email format"),
  role: z.enum(["athlete", "coach", "org_admin"]), // Removed site_admin from invitations
  teamIds: z.array(z.string()).optional(),
});

export const insertMeasurementSchema = createInsertSchema(measurements).omit({
  id: true,
  age: true, // Age is calculated automatically
  createdAt: true,
  units: true,
  verifiedBy: true,
  isVerified: true,
  submittedBy: true, // Backend handles this automatically based on session
  teamContextAuto: true, // Managed by system
}).extend({
  userId: z.string().min(1, "User is required"), // Changed from playerId to userId
  date: z.string().date("Date must be in YYYY-MM-DD format"), // Strict date validation
  metric: z.enum(["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI", "TOP_SPEED"]),
  value: z.number().positive("Value must be positive"),
  flyInDistance: z.number().positive().optional(),
  notes: z.string().max(1000, "Notes cannot exceed 1000 characters").optional(),
  // Optional team context - will be auto-populated if not provided
  teamId: z.string().optional(),
  season: z.string().optional(),
});

export const insertSiteMetricSchema = createInsertSchema(siteMetrics).omit({
  id: true,
  createdAt: true,
  createdBy: true, // Set by backend from session
  updatedAt: true, // Managed by system
  isSystemDefault: true, // Only set internally
}).extend({
  code: z.string()
    .min(1, "Metric code is required")
    .max(50, "Metric code must be 50 characters or less")
    .regex(/^[A-Z0-9_]+$/, "Metric code must contain only uppercase letters, numbers, and underscores")
    .refine((code) => !code.startsWith("_"), "Metric code cannot start with underscore"),
  label: z.string().min(1, "Label is required").max(100, "Label must be 100 characters or less"),
  category: z.string().max(50, "Category must be 50 characters or less").optional(),
  unit: z.string().max(20, "Unit must be 20 characters or less").optional(),
  lowerIsBetter: z.boolean().default(true),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().optional(),
  description: z.string().optional(),
  sportAssociations: z.array(z.string()).optional(),
  validationMin: z.number().optional(),
  validationMax: z.number().optional(),
  decimalPrecision: z.number().int().min(0).max(10).default(3),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});

export const updateSiteMetricSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  category: z.string().max(50).optional(),
  unit: z.string().max(20).optional(),
  lowerIsBetter: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  description: z.string().optional(),
  sportAssociations: z.array(z.string()).optional(),
  validationMin: z.number().optional(),
  validationMax: z.number().optional(),
  decimalPrecision: z.number().int().min(0).max(10).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});

export const insertOrganizationMetricSchema = createInsertSchema(organizationMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  organizationId: z.string().min(1, "Organization ID is required"),
  metricCode: z.string().min(1, "Metric code is required"),
  isEnabled: z.boolean().default(true),
  displayOrder: z.number().int().optional(),
  customLabel: z.string().max(100).optional(),
});

export const updateOrganizationMetricSchema = z.object({
  isEnabled: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  customLabel: z.string().max(100).optional(),
});

// Benchmark Schemas
export const insertSiteBenchmarkSchema = createInsertSchema(siteBenchmarks).omit({
  id: true,
  createdAt: true,
  createdBy: true, // Set by backend from session
  updatedAt: true, // Managed by system
  isSystemDefault: true, // Only set internally
}).extend({
  metricCode: z.string().min(1, "Metric code is required").max(50),
  name: z.string().min(1, "Benchmark name is required").max(100),
  description: z.string().optional(),
  benchmarkValue: z.number().positive("Benchmark value must be positive"),
  comparisonOperator: z.enum(['lte', 'gte', 'eq']).default('lte'),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  position: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
}).refine(
  (data) => {
    if (data.ageMin !== undefined && data.ageMax !== undefined) {
      return data.ageMin <= data.ageMax;
    }
    return true;
  },
  { message: "Age minimum must be less than or equal to age maximum", path: ["ageMin"] }
);

export const updateSiteBenchmarkSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  benchmarkValue: z.number().positive().optional(),
  comparisonOperator: z.enum(['lte', 'gte', 'eq']).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  position: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
}).refine(
  (data) => {
    if (data.ageMin !== undefined && data.ageMax !== undefined) {
      return data.ageMin <= data.ageMax;
    }
    return true;
  },
  { message: "Age minimum must be less than or equal to age maximum", path: ["ageMin"] }
);

export const insertCustomBenchmarkSchema = createInsertSchema(customBenchmarks).omit({
  id: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
}).extend({
  organizationId: z.string().min(1, "Organization ID is required"),
  metricCode: z.string().min(1, "Metric code is required").max(50),
  name: z.string().min(1, "Benchmark name is required").max(100),
  description: z.string().optional(),
  benchmarkValue: z.number().positive("Benchmark value must be positive"),
  comparisonOperator: z.enum(['lte', 'gte', 'eq']).default('lte'),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  position: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
}).refine(
  (data) => {
    if (data.ageMin !== undefined && data.ageMax !== undefined) {
      return data.ageMin <= data.ageMax;
    }
    return true;
  },
  { message: "Age minimum must be less than or equal to age maximum", path: ["ageMin"] }
);

export const updateCustomBenchmarkSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  benchmarkValue: z.number().positive().optional(),
  comparisonOperator: z.enum(['lte', 'gte', 'eq']).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  position: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
}).refine(
  (data) => {
    if (data.ageMin !== undefined && data.ageMax !== undefined) {
      return data.ageMin <= data.ageMax;
    }
    return true;
  },
  { message: "Age minimum must be less than or equal to age maximum", path: ["ageMin"] }
);

export const insertOrganizationBenchmarkSchema = createInsertSchema(organizationBenchmarks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  organizationId: z.string().min(1, "Organization ID is required"),
  benchmarkId: z.string().min(1, "Benchmark ID is required"),
  benchmarkType: z.enum(['site', 'custom']),
  isEnabled: z.boolean().default(true),
  customName: z.string().max(100).optional(),
  displayOrder: z.number().int().optional(),
});

export const updateOrganizationBenchmarkSchema = z.object({
  isEnabled: z.boolean().optional(),
  customName: z.string().max(100).optional(),
  displayOrder: z.number().int().optional(),
});

// Report Schemas
export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true, // Set from session
}).extend({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z.string().min(1, "Report name is required").max(200),
  description: z.string().optional(),
  reportType: z.enum(['team', 'individual']),
  config: z.object({
    timeframe: z.object({
      type: z.enum(['preset', 'custom']),
      preset: z.enum(['season', 'year', 'all_time']).optional(),
      customStart: z.string().optional(), // ISO date string
      customEnd: z.string().optional(), // ISO date string
    }),
    metrics: z.array(z.string()).min(1, "At least one metric is required"),
    benchmarks: z.object({
      site: z.array(z.string()).optional(), // Site benchmark IDs
      custom: z.array(z.string()).optional(), // Custom benchmark IDs
      userDefined: z.array(z.object({
        metricCode: z.string(),
        value: z.number().positive(),
        label: z.string().max(100),
      })).optional(),
    }).optional(),
    compositeIndex: z.object({
      enabled: z.boolean(),
      weights: z.record(z.string(), z.number().min(0).max(1)), // metricCode -> weight (0-1)
    }).optional(),
    filters: z.object({
      teamIds: z.array(z.string()).optional(),
      gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
      positions: z.array(z.string()).optional(),
    }).optional(),
    // Individual report athlete identifiers
    athleteIds: z.array(z.string()).optional(), // Array of athlete IDs (used in creation)
    athleteId: z.string().optional(), // Single athlete ID (stored in database)
  }),
  isTemplate: z.boolean().default(false),
});

export const updateReportSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  config: z.object({
    timeframe: z.object({
      type: z.enum(['preset', 'custom']),
      preset: z.enum(['season', 'year', 'all_time']).optional(),
      customStart: z.string().optional(),
      customEnd: z.string().optional(),
    }).optional(),
    metrics: z.array(z.string()).min(1).optional(),
    benchmarks: z.object({
      site: z.array(z.string()).optional(),
      custom: z.array(z.string()).optional(),
      userDefined: z.array(z.object({
        metricCode: z.string(),
        value: z.number().positive(),
        label: z.string().max(100),
      })).optional(),
    }).optional(),
    compositeIndex: z.object({
      enabled: z.boolean(),
      weights: z.record(z.string(), z.number().min(0).max(1)),
    }).optional(),
    filters: z.object({
      teamIds: z.array(z.string()).optional(),
      gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
      positions: z.array(z.string()).optional(),
    }).optional(),
    // Individual report athlete identifiers
    athleteIds: z.array(z.string()).optional(), // Array of athlete IDs (used in creation)
    athleteId: z.string().optional(), // Single athlete ID (stored in database)
  }).optional(),
  isTemplate: z.boolean().optional(),
});

export const insertReportSnapshotSchema = createInsertSchema(reportSnapshots).omit({
  id: true,
  publicToken: true, // Generated by backend
  createdAt: true,
  createdBy: true, // Set from session
  viewCount: true, // Managed by system
  lastViewedAt: true, // Managed by system
  revokedAt: true, // Managed by system
  revokedBy: true, // Managed by system
}).extend({
  reportId: z.string().min(1, "Report ID is required"),
  snapshotData: z.object({
    reportConfig: z.any(), // Full report configuration
    generatedAt: z.string(), // ISO timestamp
    generatedBy: z.string(), // User ID
    dataSnapshot: z.any(), // Complete computed report data
  }),
  expiresAt: z.date().or(z.string()), // Allow Date object or ISO string
  isActive: z.boolean().default(true),
});

export const insertReportBenchmarkSchema = createInsertSchema(reportBenchmarks).omit({
  id: true,
  createdAt: true,
}).extend({
  reportId: z.string().min(1, "Report ID is required"),
  metricCode: z.string().min(1, "Metric code is required").max(50),
  name: z.string().min(1, "Benchmark name is required").max(100),
  benchmarkValue: z.number().positive("Benchmark value must be positive"),
  comparisonOperator: z.enum(['lte', 'gte', 'eq']).default('lte'),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  position: z.string().max(50).optional(),
}).refine(
  (data) => {
    if (data.ageMin !== undefined && data.ageMax !== undefined) {
      return data.ageMin <= data.ageMax;
    }
    return true;
  },
  { message: "Age minimum must be less than or equal to age maximum", path: ["ageMin"] }
);

// Types
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type UpdateOrganizationStatus = z.infer<typeof updateOrganizationStatusSchema>;
export type DeleteOrganization = z.infer<typeof deleteOrganizationSchema>;

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type ArchiveTeam = z.infer<typeof archiveTeamSchema>;
export type UpdateTeamMembership = z.infer<typeof updateTeamMembershipSchema>;

export type InsertAthleteProfile = z.infer<typeof insertAthleteProfileSchema>;
export type AthleteProfile = typeof athleteProfiles.$inferSelect;

// Schema for creating site admin users
export const createSiteAdminSchema = z.object({
  username: z.string().refine((username) => {
    const result = validateUsername(username);
    return result.valid;
  }, (username) => {
    const result = validateUsername(username);
    return { message: result.errors[0] || "Invalid username" };
  }),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
    .regex(PASSWORD_REGEX.lowercase, "Password must contain at least one lowercase letter")
    .regex(PASSWORD_REGEX.uppercase, "Password must contain at least one uppercase letter")
    .regex(PASSWORD_REGEX.number, "Password must contain at least one number")
    .regex(PASSWORD_REGEX.specialChar, "Password must contain at least one special character"),
});

export type CreateSiteAdmin = z.infer<typeof createSiteAdminSchema>;

export type InsertUserOrganization = z.infer<typeof insertUserOrganizationSchema>;
export type UserOrganization = typeof userOrganizations.$inferSelect;

export type InsertUserTeam = z.infer<typeof insertUserTeamSchema>;
export type UserTeam = typeof userTeams.$inferSelect;

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export type InsertMeasurement = z.infer<typeof insertMeasurementSchema>;
export type Measurement = typeof measurements.$inferSelect;

export type InsertSiteMetric = z.infer<typeof insertSiteMetricSchema>;
export type SiteMetric = typeof siteMetrics.$inferSelect;
export type UpdateSiteMetric = z.infer<typeof updateSiteMetricSchema>;

export type InsertOrganizationMetric = z.infer<typeof insertOrganizationMetricSchema>;
export type OrganizationMetric = typeof organizationMetrics.$inferSelect;
export type UpdateOrganizationMetric = z.infer<typeof updateOrganizationMetricSchema>;

export type InsertSiteBenchmark = z.infer<typeof insertSiteBenchmarkSchema>;
export type SiteBenchmark = typeof siteBenchmarks.$inferSelect;
export type UpdateSiteBenchmark = z.infer<typeof updateSiteBenchmarkSchema>;

export type InsertCustomBenchmark = z.infer<typeof insertCustomBenchmarkSchema>;
export type CustomBenchmark = typeof customBenchmarks.$inferSelect;
export type UpdateCustomBenchmark = z.infer<typeof updateCustomBenchmarkSchema>;

export type InsertOrganizationBenchmark = z.infer<typeof insertOrganizationBenchmarkSchema>;
export type OrganizationBenchmark = typeof organizationBenchmarks.$inferSelect;
export type UpdateOrganizationBenchmark = z.infer<typeof updateOrganizationBenchmarkSchema>;

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;
export type UpdateReport = z.infer<typeof updateReportSchema>;

export type InsertReportSnapshot = z.infer<typeof insertReportSnapshotSchema>;
export type ReportSnapshot = typeof reportSnapshots.$inferSelect;

export type InsertReportBenchmark = z.infer<typeof insertReportBenchmarkSchema>;
export type ReportBenchmark = typeof reportBenchmarks.$inferSelect;

export type SiteSettings = typeof siteSettings.$inferSelect;

// Enriched type for organization benchmarks with full benchmark details
export type OrganizationBenchmarkWithDetails = OrganizationBenchmark & {
  // Benchmark details (from either site_benchmarks or custom_benchmarks)
  name: string;
  metricCode: string;
  description: string | null;
  benchmarkValue: number;
  comparisonOperator: 'lte' | 'gte' | 'eq';
  // Athlete filters
  ageMin: number | null;
  ageMax: number | null;
  gender: 'Male' | 'Female' | 'Not Specified' | null;
  position: string | null;
  level: 'college' | 'high_school' | 'club' | null;
  // Status (from site benchmarks only, custom benchmarks don't have isActive)
  isActive?: boolean;
};

// Enums
export const MetricType = {
  FLY10_TIME: "FLY10_TIME",
  VERTICAL_JUMP: "VERTICAL_JUMP",
  AGILITY_505: "AGILITY_505",
  AGILITY_5105: "AGILITY_5105",
  T_TEST: "T_TEST",
  DASH_40YD: "DASH_40YD",
  RSI: "RSI",
  TOP_SPEED: "TOP_SPEED",
} as const;

// Valid metrics for analytics with optimization hints
// Defines which metrics should be minimized (lower is better) vs maximized (higher is better)
export const VALID_METRICS = [
  { key: 'FLY10_TIME', lowerIsBetter: true },
  { key: 'VERTICAL_JUMP', lowerIsBetter: false },
  { key: 'AGILITY_505', lowerIsBetter: true },
  { key: 'AGILITY_5105', lowerIsBetter: true },
  { key: 'T_TEST', lowerIsBetter: true },
  { key: 'DASH_40YD', lowerIsBetter: true },
  { key: 'RSI', lowerIsBetter: false },
] as const;

export const TeamLevel = {
  CLUB: "Club",
  HS: "HS",
  COLLEGE: "College",
} as const;

export const Gender = {
  MALE: "Male",
  FEMALE: "Female",
  NOT_SPECIFIED: "Not Specified",
} as const;

export const SoccerPosition = {
  FORWARD: "F",
  MIDFIELDER: "M",
  DEFENDER: "D",
  GOALKEEPER: "GK",
} as const;

// Available sports - add new sports here
// NOTE: MVP currently supports only Soccer. Add more sports here as needed.
export const Sport = {
  SOCCER: "Soccer",
} as const;

// Array of sport values for use in dropdowns
export const AVAILABLE_SPORTS = Object.values(Sport);

// Organization-specific roles only
export const UserRole = {
  ORG_ADMIN: "org_admin",
  COACH: "coach",
  ATHLETE: "athlete",
} as const;

/**
 * Sentinel value for user passwords that are pending invitation acceptance
 * Users with this password value have not yet completed registration
 * @constant
 */
export const INVITATION_PENDING_PASSWORD = 'INVITATION_PENDING';

export const OrganizationRole = {
  ORG_ADMIN: "org_admin",
  COACH: "coach",
  ATHLETE: "athlete",
} as const;

// Unified athlete schema
export type Athlete = User;
export type InsertAthlete = z.infer<typeof insertAthleteSchema>;

// Consolidated athlete creation schema
export const insertAthleteSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  emails: z.array(z.string().email("Invalid email format")).optional(),
  birthDate: z.string().optional(),
  graduationYear: z.coerce.number().int().min(2000).max(2040).optional(),
  school: z.string().optional(),
  phoneNumbers: z.array(z.string()).optional(),
  sports: z.array(z.enum(["Soccer"])).optional(),
  positions: z.array(z.enum(["F", "M", "D", "GK"])).optional(),
  height: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  gender: z.enum(["Male", "Female", "Not Specified"]).optional(),
  teamIds: z.array(z.string()).optional(),
  organizationId: z.string().optional()
});

// Legacy compatibility exports removed - use Athlete types instead

// Site Settings validation schemas
export const AI_MODELS = [
  "gpt-5-nano",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "claude-haiku-3",
  "claude-haiku-4.5",
  "gemini-2.5-pro",
  "claude-sonnet-4.5",
] as const;

export type AIModel = typeof AI_MODELS[number];

export const updateSiteSettingsSchema = z.object({
  aiModel: z.enum(AI_MODELS),
});

export const insertSiteSettingsSchema = createInsertSchema(siteSettings).omit({
  id: true,
  updatedAt: true,
  updatedBy: true,
});

// Report Insights validation schemas
export const updateReportInsightsSchema = z.object({
  coachingInsights: z.string().min(1, "Insights cannot be empty").max(10000, "Insights must be 10000 characters or less"),
});

export const generateReportInsightsSchema = z.object({
  reportId: z.string().uuid(),
});