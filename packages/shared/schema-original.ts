import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { PASSWORD_REQUIREMENTS, PASSWORD_REGEX } from "./password-requirements";
import { validateUsername } from "./username-validation";
import { isSafePublicUrl } from "./url-safety";

// AI Coaching Insights constants
export const MAX_INSIGHTS_LENGTH = 10000;

/**
 * Organization type enum for multi-tenant filtering
 * @see organization-type-utils.ts for utilities and constants related to organization types
 */
export const organizationTypeEnum = ['youth', 'high_school', 'college', 'club', 'private_facility', 'elite_academy'] as const;

/**
 * Metric type enum for determining if metrics are better when higher/lower or just tracked
 * - lower_is_better: Decreasing values = improvement (e.g., FLY10_TIME, DASH_40YD)
 * - higher_is_better: Increasing values = improvement (e.g., VERTICAL_JUMP, TOP_SPEED)
 * - tracking: No better/worse direction, just informational (e.g., HEIGHT, WEIGHT)
 */
export const metricTypeEnum = ['lower_is_better', 'higher_is_better', 'tracking'] as const;

/**
 * Sport code enum for metric sport associations
 * These codes correspond to the 'code' field in the site_sports table
 */
export const sportCodeEnum = ['SOCCER', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'BASEBALL', 'FOOTBALL', 'HOCKEY', 'LACROSSE'] as const;

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

// Site-level metric definitions (master catalog)
export const siteMetrics = pgTable("site_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(), // "FLY10_TIME", "CUSTOM_SPRINT_20M"
  label: varchar("label", { length: 100 }).notNull(), // "10-Yard Fly Time"
  category: varchar("category", { length: 50 }), // "speed", "agility", "strength", "power"
  unit: varchar("unit", { length: 20 }), // "s", "in", "mph", "m"
  metricType: text("metric_type", { enum: metricTypeEnum }).default('lower_is_better').notNull(),
  isSystemDefault: boolean("is_system_default").default(false).notNull(), // Cannot be deleted
  isActive: boolean("is_active").default(true).notNull(), // Can be globally disabled by site admin
  displayOrder: integer("display_order"),
  description: text("description"),
  // Organization type availability (NULL = available to all org types)
  availableOrgTypes: text("available_org_types").array().$type<(typeof organizationTypeEnum)[number][]>(),
  // Advanced properties for sport-specific configuration
  sportAssociations: text("sport_associations").array(), // ["Soccer", "Basketball"]
  validationMin: decimal("validation_min", { precision: 10, scale: 3 }), // Minimum valid value
  validationMax: decimal("validation_max", { precision: 10, scale: 3 }), // Maximum valid value
  decimalPrecision: integer("decimal_precision").default(3).notNull(), // Decimal places for display
  // Display settings
  color: varchar("color", { length: 20 }), // Hex color or Tailwind class
  icon: varchar("icon", { length: 50 }), // Icon identifier
  // Derived metrics configuration
  isDerived: boolean("is_derived").default(false).notNull(), // Whether this metric is calculated from other metrics
  formula: text("formula"), // Formula for calculation (e.g., "10 / fly10_time * 2.045")
  dependentMetrics: text("dependent_metrics").array(), // Metric codes this formula depends on
  calculationConfig: jsonb("calculation_config").$type<{
    dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
    maxDateDifference?: number;
    missingSourceBehavior: 'skip' | 'error';
    constants?: Record<string, number>;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }), // Site admin who created
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  activeIdx: index("site_metrics_active_idx").on(table.isActive),
  codeIdx: index("site_metrics_code_idx").on(table.code),
  categoryIdx: index("site_metrics_category_idx").on(table.category),
  // Index for organization type filtering
  availableOrgTypesIdx: index("site_metrics_available_org_types_idx").on(table.availableOrgTypes),
  // Index for querying derived metrics (partial index: WHERE is_derived = true)
  isDerivedIdx: index("idx_site_metrics_is_derived").on(table.isDerived).where(sql`${table.isDerived} = true`),
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
  uniqueOrgMetric: unique("organization_metrics_unique_org_metric").on(table.organizationId, table.metricCode),
  orgIdx: index("org_metrics_org_idx").on(table.organizationId),
  orgEnabledIdx: index("org_metrics_org_enabled_idx").on(table.organizationId, table.isEnabled),
}));

// Site-level sport definitions (master catalog)
export const siteSports = pgTable("site_sports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(), // "SOCCER", "BASKETBALL" (immutable identifier)
  name: varchar("name", { length: 100 }).notNull(), // "Soccer" (display name, can change)
  description: text("description"),
  icon: varchar("icon", { length: 50 }), // Icon identifier for UI
  color: varchar("color", { length: 20 }), // Hex color or Tailwind class
  displayOrder: integer("display_order").default(999).notNull(),
  isSystemDefault: boolean("is_system_default").default(false).notNull(), // Cannot delete seeded sports
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  activeIdx: index("site_sports_active_idx").on(table.isActive),
  codeIdx: index("site_sports_code_idx").on(table.code),
  displayOrderIdx: index("site_sports_display_order_idx").on(table.displayOrder),
}));

// Sport-specific position definitions
export const sitePositions = pgTable("site_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sportId: varchar("sport_id").notNull().references(() => siteSports.id, { onDelete: 'cascade' }),
  code: varchar("code", { length: 20 }).notNull(), // "F", "M", "D", "GK"
  name: varchar("name", { length: 100 }).notNull(), // "Forward", "Midfielder"
  shortName: varchar("short_name", { length: 10 }), // "FW", "MF" (optional abbreviation)
  description: text("description"),
  displayOrder: integer("display_order").default(999).notNull(),
  color: varchar("color", { length: 20 }),
  isSystemDefault: boolean("is_system_default").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  sportIdx: index("site_positions_sport_idx").on(table.sportId),
  activeIdx: index("site_positions_active_idx").on(table.isActive),
  sportActiveIdx: index("site_positions_sport_active_idx").on(table.sportId, table.isActive),
  sportCodeUnique: unique("site_positions_sport_code_unique").on(table.sportId, table.code),
}));

// Site-level benchmark definitions (master catalog)
export const siteBenchmarks = pgTable("site_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  benchmarkValue: decimal("benchmark_value", { precision: 10, scale: 3 }),
  comparisonOperator: varchar("comparison_operator", { length: 10 }).default('lte').notNull(), // 'lte', 'gte', 'eq', 'range'
  // Range-based benchmark fields (migration 0076)
  minValue: decimal("min_value", { precision: 10, scale: 2 }),
  maxValue: decimal("max_value", { precision: 10, scale: 2 }),
  // Tier grouping fields (migration 0077)
  tierGroupId: uuid("tier_group_id"),
  tierOrder: integer("tier_order"),
  tierName: varchar("tier_name", { length: 50 }),
  tierColor: varchar("tier_color", { length: 20 }),
  // Organization type filtering (NULL = applies to all org types)
  applicableOrgTypes: text("applicable_org_types").array().$type<(typeof organizationTypeEnum)[number][]>(),
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
  // Peer comparison benchmark settings (Phase 2.3)
  benchmarkSource: varchar("benchmark_source", { length: 20 }).default('static').notNull(), // 'static' or 'peer_percentile'
  peerPercentileTarget: integer("peer_percentile_target"), // e.g., 75 means "top 25%" (75th percentile)
  peerFilterCriteria: jsonb("peer_filter_criteria").$type<{
    ageRange?: [number, number];
    gender?: 'Male' | 'Female';
    orgTypes?: string[];
    sports?: string[];
  }>(), // Filter criteria for peer pool
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
  // Index for organization type filtering
  orgTypesIdx: index("site_benchmarks_org_types_idx").on(table.applicableOrgTypes),
  // Index for peer benchmark filtering
  peerBenchmarkIdx: index("site_benchmarks_peer_idx").on(table.benchmarkSource),
}));

// Organization-specific custom benchmarks
export const customBenchmarks = pgTable("custom_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  benchmarkValue: decimal("benchmark_value", { precision: 10, scale: 3 }),
  comparisonOperator: varchar("comparison_operator", { length: 10 }).default('lte').notNull(), // 'lte', 'gte', 'eq', 'range'
  // Range-based benchmark fields (migration 0076)
  minValue: decimal("min_value", { precision: 10, scale: 2 }),
  maxValue: decimal("max_value", { precision: 10, scale: 2 }),
  // Tier grouping fields (migration 0077)
  tierGroupId: uuid("tier_group_id"),
  tierOrder: integer("tier_order"),
  tierName: varchar("tier_name", { length: 50 }),
  tierColor: varchar("tier_color", { length: 20 }),
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
  uniqueOrgBenchmark: unique("organization_benchmarks_unique_org_benchmark").on(table.organizationId, table.benchmarkId, table.benchmarkType),
  // Note: displayOrderUnique is a PARTIAL unique index (WHERE display_order IS NOT NULL)
  // created in migration 0024. It cannot be defined in Drizzle schema as Drizzle doesn't
  // support partial constraints. The index name is: org_benchmarks_display_order_unique
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
  metric: text("metric").notNull(), // "FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI", "TOP_SPEED"
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
  // Global athlete linking for cross-org aggregation
  globalAthleteId: varchar("global_athlete_id"), // Historical reference (no FK - allows orphaned data)
  // Derived/calculated measurement fields
  isCalculated: boolean("is_calculated").default(false).notNull(), // Whether this measurement was auto-calculated
  calculatedFromMeasurementIds: text("calculated_from_measurement_ids").array(), // Source measurement IDs used in calculation
  calculationMetadata: jsonb("calculation_metadata").$type<{
    formula: string;
    sourceValues: Record<string, number>;
    calculatedAt: string;
    calculationVersion?: string;  // Version of the calculator (e.g., "1.0.0")
    triggeredBy?: {
      event: 'measurement_insert' | 'measurement_update' | 'measurement_delete' | 'manual_recalculation' | 'bulk_import';
      userId?: string;              // Who triggered the calculation (if applicable)
      sourceMeasurementId?: string; // Source measurement that triggered the calculation
    };
  }>(),
  // Event context - immutable snapshot at measurement time (no FK - historical reference)
  eventId: varchar("event_id"), // Event ID when measurement was taken at an event
  eventNameSnapshot: text("event_name_snapshot"), // Event name at time of measurement
  eventDateSnapshot: date("event_date_snapshot"), // Event date at time of measurement
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  globalAthleteIdx: index("measurements_global_athlete_idx").on(table.globalAthleteId, table.date),
  // Performance indexes for peer comparison queries
  metricVerifiedIdx: index("measurements_metric_verified_idx").on(table.metric, table.isVerified, table.userId, table.value),
  userMetricDateIdx: index("measurements_user_metric_date_idx").on(table.userId, table.metric, table.date),
  // Event-based measurement queries (added in migration 0081)
  eventIdx: index("measurements_event_idx").on(table.eventId, table.date),
  // Derived metrics indexes (partial indexes: WHERE is_calculated = true / is_verified = true)
  isCalculatedIdx: index("idx_measurements_is_calculated").on(table.isCalculated).where(sql`${table.isCalculated} = true`),
  // Note: idx_measurements_calculated_from is a GIN index (USING GIN) created in migration 0083
  // for array containment queries on calculated_from_measurement_ids. Drizzle doesn't support
  // specifying GIN index type, so this index is created manually in the migration.
  // Index name: idx_measurements_calculated_from (partial: WHERE is_calculated = true)
  userMetricVerifiedDateIdx: index("idx_measurements_user_metric_verified_date").on(table.userId, table.metric, table.date).where(sql`${table.isVerified} = true`),
}));

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

// Membership request status enum
export const membershipRequestStatusEnum = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export const membershipRequestDiscoveryMethodEnum = ['join_code', 'directory', 'direct_link'] as const;

// Membership requests - athlete-initiated requests to join organizations
export const membershipRequests = pgTable("membership_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  status: text("status", { enum: membershipRequestStatusEnum }).default('pending').notNull(),
  requestedRole: text("requested_role").default('athlete').notNull(),
  discoveryMethod: text("discovery_method", { enum: membershipRequestDiscoveryMethodEnum }),
  processedBy: varchar("processed_by").references(() => users.id, { onDelete: 'set null' }),
  processedAt: timestamp("processed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  // Prevent duplicate pending requests
  uniquePendingRequest: sql`CREATE UNIQUE INDEX IF NOT EXISTS membership_requests_unique_pending ON ${table} (${table.userId}, ${table.organizationId}) WHERE ${table.status} = 'pending'`,
  // Performance indexes
  orgStatusIdx: index("membership_requests_org_status_idx").on(table.organizationId, table.status),
  userIdx: index("membership_requests_user_idx").on(table.userId),
}));

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

// Account Linking Tokens - OAuth account linking verification
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

// Site Settings - Global site configuration (singleton table)
export const siteSettings = pgTable("site_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  aiModel: text("ai_model").notNull().default("gpt-5-nano"),
  wellnessModuleEnabled: boolean("wellness_module_enabled").notNull().default(true),
  // Push notification global settings
  pushNotificationsEnabled: boolean("push_notifications_enabled").notNull().default(true),
  pushDefaultOrgSettings: jsonb("push_default_org_settings"),
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
  membershipRequests: many(membershipRequests),
  organizationMetrics: many(organizationMetrics),
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

// Wellness Questionnaire System
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

// Achievement & Badge System
export const achievementCategoryEnum = ['performance', 'consistency', 'improvement', 'goal'] as const;
export const achievementRarityEnum = ['common', 'rare', 'epic', 'legendary'] as const;

// Achievement definitions (seeded data)
export const achievementDefinitions = pgTable("achievement_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  category: text("category", { enum: achievementCategoryEnum }).notNull(),
  icon: varchar("icon", { length: 50 }), // lucide icon name
  color: varchar("color", { length: 20 }), // tailwind color class
  rarity: text("rarity", { enum: achievementRarityEnum }).default('common').notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("achievement_definitions_code_idx").on(table.code),
  categoryIdx: index("achievement_definitions_category_idx").on(table.category),
  activeIdx: index("achievement_definitions_active_idx").on(table.isActive),
}));

// User achievements (junction table)
export const userAchievements = pgTable("user_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementId: varchar("achievement_id").notNull().references(() => achievementDefinitions.id, { onDelete: 'restrict' }),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
  metadata: jsonb("metadata"), // { metric, value, improvement, etc. }
}, (table) => ({
  userIdx: index("user_achievements_user_idx").on(table.userId),
  orgIdx: index("user_achievements_org_idx").on(table.organizationId),
  achievementIdx: index("user_achievements_achievement_idx").on(table.achievementId),
  userOrgIdx: index("user_achievements_user_org_idx").on(table.userId, table.organizationId),
  uniqueUserAchievement: unique("user_achievements_user_org_achievement_unique").on(table.userId, table.organizationId, table.achievementId),
}));

// Goal Setting System
export const goalTypeEnum = ['target_value', 'improvement_percentage', 'consistency'] as const;
export const goalStatusEnum = ['active', 'achieved', 'missed', 'abandoned'] as const;

export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  metric: text("metric").notNull().references(() => siteMetrics.code, { onDelete: 'restrict', onUpdate: 'cascade' }), // Metric code (e.g., "FLY10_TIME", "VERTICAL_JUMP")
  goalType: text("goal_type", { enum: goalTypeEnum }).notNull(),
  targetValue: decimal("target_value", { precision: 10, scale: 3 }).notNull(),
  baselineValue: decimal("baseline_value", { precision: 10, scale: 3 }).notNull(),
  currentValue: decimal("current_value", { precision: 10, scale: 3 }).notNull(),
  targetDate: date("target_date").notNull(),
  status: text("status", { enum: goalStatusEnum }).default('active').notNull(),
  notes: text("notes"),
  achievedAt: timestamp("achieved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  // Index for user's goals lookup
  userIdx: index("goals_user_idx").on(table.userId),
  // Index for active goals queries
  statusIdx: index("goals_status_idx").on(table.status),
  // Composite index for user's active goals
  userStatusIdx: index("goals_user_status_idx").on(table.userId, table.status),
  // Index for metric-based queries
  metricIdx: index("goals_metric_idx").on(table.metric),
  // Index for target date queries (upcoming deadlines)
  targetDateIdx: index("goals_target_date_idx").on(table.targetDate),
  // Composite index for user + metric queries
  userMetricIdx: index("goals_user_metric_idx").on(table.userId, table.metric),
}));

// Global Athlete Registry for Cross-Organization Linking
export const linkStatusEnum = ['pending', 'confirmed', 'rejected', 'revoked'] as const;
export const linkTypeEnum = ['auto_email', 'auto_import', 'athlete_claimed', 'org_proposed', 'admin_forced'] as const;
export const actorTypeEnum = ['athlete', 'org_admin', 'site_admin', 'system'] as const;

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

// Claim status enum
const claimStatusEnum = ["pending", "verified", "expired", "cancelled"] as const;

// Global Athlete Claims - for manually claiming additional email addresses
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

// Peer Percentile Cache - pre-computed distributions for cross-org peer comparison (Phase 2.3)
export const peerPercentileCache = pgTable("peer_percentile_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricCode: varchar("metric_code", { length: 50 }).notNull().references(() => siteMetrics.code, { onDelete: 'cascade' }),
  filterCriteria: jsonb("filter_criteria").$type<{
    ageRange?: [number, number];
    gender?: 'Male' | 'Female';
    orgTypes?: string[];
    sports?: string[];
  }>().notNull().default({}),
  // Hash of filterCriteria for deterministic lookups (avoids JSONB key ordering issues)
  // NOTE: MD5 is used for cache key generation (performance), NOT cryptographic security
  // JSONB objects {"age": 18, "gender": "M"} and {"gender": "M", "age": 18} have different ::text representations
  // Using MD5 hash ensures consistent lookups regardless of key ordering
  filterHash: varchar("filter_hash", { length: 64 }).generatedAlwaysAs(sql`md5(filter_criteria::text)`),
  // Distribution data
  sampleSize: integer("sample_size").notNull(),
  p10: decimal("p10", { precision: 10, scale: 4 }),
  p25: decimal("p25", { precision: 10, scale: 4 }),
  p50: decimal("p50", { precision: 10, scale: 4 }),
  p75: decimal("p75", { precision: 10, scale: 4 }),
  p90: decimal("p90", { precision: 10, scale: 4 }),
  mean: decimal("mean", { precision: 10, scale: 4 }),
  // Cache metadata
  computedAt: timestamp("computed_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  metricIdx: index("peer_percentile_cache_metric_idx").on(table.metricCode),
  expiresIdx: index("peer_percentile_cache_expires_idx").on(table.expiresAt),
  // Unique constraint on metric + filter hash for upsert operations (more reliable than JSONB)
  uniqueMetricFilterHash: unique("peer_percentile_cache_metric_hash_unique").on(table.metricCode, table.filterHash),
}));

// Global Athlete Relations
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

// Wellness Relations
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

// Goals Relations
export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, {
    fields: [goals.userId],
    references: [users.id],
  }),
}));

// Achievement Relations
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

// Wellness type exports
export type WellnessTemplate = typeof wellnessTemplates.$inferSelect;
export type WellnessRequest = typeof wellnessRequests.$inferSelect;
export type WellnessResponse = typeof wellnessResponses.$inferSelect;

// Goals type exports
export type Goal = typeof goals.$inferSelect;
export type GoalType = (typeof goalTypeEnum)[number];
export type GoalStatus = (typeof goalStatusEnum)[number];

// Achievement type exports
export type AchievementDefinition = typeof achievementDefinitions.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type AchievementCategory = (typeof achievementCategoryEnum)[number];
export type AchievementRarity = (typeof achievementRarityEnum)[number];

// Global Athlete type exports
export type GlobalAthlete = typeof globalAthletes.$inferSelect;
export type UserGlobalAthleteLink = typeof userGlobalAthleteLinks.$inferSelect;
export type GlobalAthleteAuditLog = typeof globalAthleteAuditLog.$inferSelect;
export type GlobalAthleteClaim = typeof globalAthleteClaims.$inferSelect;
export type PeerPercentileCache = typeof peerPercentileCache.$inferSelect;
export type LinkStatus = (typeof linkStatusEnum)[number];
export type LinkType = (typeof linkTypeEnum)[number];
export type ActorType = (typeof actorTypeEnum)[number];
export type ClaimStatus = (typeof claimStatusEnum)[number];

// Insert schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  isActive: true, // Managed by system
  deletedAt: true, // Managed by system
}).extend({
  orgType: z.enum(organizationTypeEnum).default('club'),
});

// Organization status update schema
export const updateOrganizationStatusSchema = z.object({
  isActive: z.boolean(),
});

// Organization general update schema — used by the site-admin PATCH /api/organizations/:id
// route (via organizationService.updateOrganization). The org-admin route
// PATCH /api/organizations/:id/org-settings uses its own manual validation because it
// exposes a different, more restricted set of fields.
export const updateOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(200, "Organization name must be 200 characters or less").optional(),
  description: z.string().max(1000, "Description must be 1000 characters or less").optional().nullable(),
  location: z.string().max(200, "Location must be 200 characters or less").optional().nullable(),
  orgType: z.enum(organizationTypeEnum).optional(),
  isActive: z.boolean().optional(),
  benchmarksEnabled: z.boolean().optional(),
  allowCustomBenchmarks: z.boolean().optional(),
  aiEnabledBySiteAdmin: z.boolean().optional(), // Only site admin can set this
  aiEnabled: z.boolean().optional(), // Org admin can set this
  wellnessEnabled: z.boolean().optional(), // Org admin can set this (only effective when site wellness enabled)
  eventsEnabled: z.boolean().optional(), // Org admin can enable/disable events module
  customMetricsEnabled: z.boolean().optional(), // Site admin only - enable/disable custom metrics feature
  // aiPromptContext is validated manually in the org-admin PATCH /org-settings route handler
  // and is not part of the site-admin updateOrganizationSchema
  // z.preprocess normalizes empty strings to null so clearing a field in the form
  // doesn't trigger a "must be valid URL/hex" error and stores null in the DB consistently.
  brandLogoUrl: z.preprocess(val => val === '' ? null : val, z.string().url("Must be a valid URL").max(2000).refine(u => isSafePublicUrl(u), "Logo URL must be a public HTTPS URL").nullable()).optional(),
  brandPrimaryColor: z.preprocess(val => val === '' ? null : val, z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (e.g. #1a365d)").nullable()).optional(),
  brandSecondaryColor: z.preprocess(val => val === '' ? null : val, z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (e.g. #1a365d)").nullable()).optional(),
  brandTagline: z.preprocess(val => val === '' ? null : val, z.string().max(200, "Tagline must be 200 characters or less").nullable()).optional(),
  sprintFvEnabled: z.boolean().optional(), // Org admin can set this (only effective when site sprint F-V enabled)
  coppaEnabled: z.boolean().optional(), // Site admin only - enables COPPA minor-athlete flow
  coppaContactEmail: z.string().email("COPPA contact email must be a valid email address").max(255).optional().nullable(),
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
  role: z.enum(["site_admin", "org_admin", "coach", "athlete", "parent"]).default("athlete"),
  isSiteAdmin: z.boolean().default(false).optional(),
  birthDate: z.string().optional().refine((date) => {
    if (!date) return true;
    const d = new Date(date);
    return !isNaN(d.getTime()) && d <= new Date();
  }, "Invalid birth date or future date"),
  teamIds: z.array(z.string().min(1, "Team ID required")).optional(),
  // Sports and positions are now dynamic - stored as codes from site_sports and site_positions tables
  sports: z.array(z.string().min(1, "Sport code required")).optional(),
  positions: z.array(z.string().min(1, "Position code required")).optional(),
  phoneNumbers: z.array(z.string().min(1, "Phone number cannot be empty")).optional(),
  gender: z.enum(["Male", "Female", "Not Specified"]).optional(),
  // Onboarding tracking - defaults to false for new users
  hasCompletedOnboarding: z.boolean().optional(),
  // COPPA compliance fields
  coppaStatus: z.enum(['not_applicable', 'pending_consent', 'needs_parent_email', 'consented', 'consent_revoked']).optional(),
  isMinor: z.boolean().optional(),
  parentEmail: z.string().email().optional().nullable(),
  parentConsentId: z.string().optional(),
  coppaConsentConfirmedAt: z.coerce.date().optional().nullable(),
});

// Schema for creating OAuth users (password is optional for OAuth-only accounts)
export const insertOAuthUserSchema = insertUserSchema.omit({ password: true }).extend({
  password: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
    .regex(PASSWORD_REGEX.lowercase, "Password must contain at least one lowercase letter")
    .regex(PASSWORD_REGEX.uppercase, "Password must contain at least one uppercase letter")
    .regex(PASSWORD_REGEX.number, "Password must contain at least one number")
    .regex(PASSWORD_REGEX.specialChar, "Password must contain at least one special character")
    .optional(),
});

export const insertAthleteProfileSchema = createInsertSchema(athleteProfiles).omit({
  id: true,
  createdAt: true,
});

export const updateProfileSchema = z.object({
  emails: z.array(z.string().email("Invalid email format")).optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  parentEmail: z.string().email("Invalid email format").optional().nullable(),
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
  role: z.enum(["athlete", "coach", "org_admin", "parent"]), // Removed site_admin from invitations
  teamIds: z.array(z.string()).optional(),
  // COPPA: coach-provided age data captured at invite-create time
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must be in YYYY-MM-DD format").optional().nullable(),
  parentEmail: z.string().email("Invalid parent email format").trim().toLowerCase().optional().nullable(),
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
  // Accept any metric code - validation against active metrics happens at API level
  // This allows derived metrics and custom metrics to be recorded
  metric: z.string().min(1, "Metric is required").regex(/^[A-Z0-9_]+$/, "Invalid metric code format"),
  value: z.number().positive("Value must be positive"),
  flyInDistance: z.number().positive().optional(),
  // Auxiliary input for paired-input metrics (e.g., reps for 1RM-est metrics).
  // Server validates against the metric's auxiliaryInputConfig at insert time.
  auxiliaryValue: z.number().nullable().optional(),
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
  metricType: z.enum(metricTypeEnum).default('lower_is_better'),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().optional(),
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(5000).optional(),
  whatItMeasures: z.string().max(5000).optional(),
  whyItMatters: z.string().max(5000).optional(),
  availableOrgTypes: z.array(z.enum(organizationTypeEnum)).optional(),
  sportAssociations: z.array(z.string().max(50, "Sport code must be 50 characters or less").regex(/^[A-Z0-9_]+$/, "Sport code must be uppercase letters, numbers, and underscores")).optional(),
  validationMin: z.number().optional(),
  validationMax: z.number().optional(),
  decimalPrecision: z.number().int().min(0).max(10).default(3),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
  // Derived metrics fields
  isDerived: z.boolean().default(false),
  formula: z.string().max(1000, "Formula must be 1000 characters or less").optional(),
  dependentMetrics: z.array(z.string()).optional(),
  calculationConfig: z.object({
    dateMatchStrategy: z.enum(['same_date', 'latest_before', 'closest']),
    maxDateDifference: z.number().int().positive().optional(),
    missingSourceBehavior: z.enum(['skip', 'error']),
  }).optional(),
}).superRefine((data, ctx) => {
  // Cross-field validation: If isDerived is true, formula is required
  if (data.isDerived === true) {
    if (!data.formula || data.formula.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formula is required when isDerived is true",
        path: ['formula'],
      });
    }
    if (!data.calculationConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Calculation config is required when isDerived is true",
        path: ['calculationConfig'],
      });
    }
  }
  // If isDerived is false, formula should not be set
  if (data.isDerived === false && data.formula) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Formula should not be set when isDerived is false",
      path: ['formula'],
    });
  }
});

export const updateSiteMetricSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  category: z.string().max(50).optional(),
  unit: z.string().max(20).optional(),
  metricType: z.enum(metricTypeEnum).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(5000).nullable().optional(),
  whatItMeasures: z.string().max(5000).nullable().optional(),
  whyItMatters: z.string().max(5000).nullable().optional(),
  // Allow null to explicitly clear these array fields (undefined means "don't update")
  availableOrgTypes: z.array(z.enum(organizationTypeEnum)).nullable().optional(),
  sportAssociations: z.array(z.string().max(50, "Sport code must be 50 characters or less").regex(/^[A-Z0-9_]+$/, "Sport code must be uppercase letters, numbers, and underscores")).nullable().optional(),
  validationMin: z.number().optional(),
  validationMax: z.number().optional(),
  decimalPrecision: z.number().int().min(0).max(10).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
  // Derived metrics fields
  isDerived: z.boolean().optional(),
  formula: z.string().max(1000, "Formula must be 1000 characters or less").optional(),
  dependentMetrics: z.array(z.string()).nullable().optional(),
  calculationConfig: z.object({
    dateMatchStrategy: z.enum(['same_date', 'latest_before', 'closest']),
    maxDateDifference: z.number().int().positive().optional(),
    missingSourceBehavior: z.enum(['skip', 'error']),
  }).nullable().optional(),
}).superRefine((data, ctx) => {
  // Cross-field validation: If isDerived is being set to true, formula should be provided
  if (data.isDerived === true) {
    if (data.formula !== undefined && (!data.formula || data.formula.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formula is required when isDerived is true",
        path: ['formula'],
      });
    }
  }
  // If isDerived is being set to false, warn if formula is still set (unless explicitly cleared)
  if (data.isDerived === false && data.formula !== undefined && data.formula !== null && data.formula.trim() !== '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Formula should be cleared when isDerived is false",
      path: ['formula'],
    });
  }
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

// Sports Schemas
export const insertSiteSportSchema = createInsertSchema(siteSports).omit({
  id: true,
  createdAt: true,
  createdBy: true, // Set by backend from session
  updatedAt: true, // Managed by system
  isSystemDefault: true, // Only set internally
}).extend({
  code: z.string()
    .min(1, "Sport code is required")
    .max(50, "Sport code must be 50 characters or less")
    .regex(/^[A-Z0-9_]+$/, "Sport code must contain only uppercase letters, numbers, and underscores")
    .refine((code) => !code.startsWith("_"), "Sport code cannot start with underscore"),
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

export const updateSiteSportSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// Positions Schemas
export const insertSitePositionSchema = createInsertSchema(sitePositions).omit({
  id: true,
  createdAt: true,
  createdBy: true, // Set by backend from session
  updatedAt: true, // Managed by system
  isSystemDefault: true, // Only set internally
}).extend({
  sportId: z.string().min(1, "Sport ID is required"),
  code: z.string()
    .min(1, "Position code is required")
    .max(20, "Position code must be 20 characters or less"),
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  shortName: z.string().max(10).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
});

export const updateSitePositionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortName: z.string().max(10).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  color: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
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
  benchmarkValue: z.number().positive("Benchmark value must be positive").optional(),
  comparisonOperator: z.enum(['lte', 'gte', 'eq', 'range']).default('lte'),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  tierGroupId: z.string().uuid().optional(),
  tierOrder: z.number().int().positive().optional(),
  tierName: z.string().max(50).optional(),
  tierColor: z.string().max(20).optional(),
  applicableOrgTypes: z.array(z.enum(organizationTypeEnum)).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  sport: z.string().min(1).max(50).optional().nullable(),
  position: z.string().min(1).max(50).optional().nullable(),
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
).refine(
  (data) => {
    // Position requires sport to be set
    if (data.position && data.position.trim() !== '') {
      return data.sport && data.sport.trim() !== '';
    }
    return true;
  },
  { message: "Position requires sport to be set", path: ["position"] }
).refine(
  (data) => {
    // If comparison operator is 'range', minValue and maxValue are required
    if (data.comparisonOperator === 'range') {
      return data.minValue !== undefined && data.maxValue !== undefined;
    }
    return true;
  },
  { message: "Range benchmarks require both minValue and maxValue", path: ["minValue"] }
).refine(
  (data) => {
    // If comparison operator is 'range', minValue must be less than maxValue
    if (data.comparisonOperator === 'range' && data.minValue !== undefined && data.maxValue !== undefined) {
      return data.minValue < data.maxValue;
    }
    return true;
  },
  { message: "minValue must be less than maxValue for range benchmarks", path: ["minValue"] }
).refine(
  (data) => {
    // If comparison operator is NOT 'range', benchmarkValue is required
    if (data.comparisonOperator !== 'range') {
      return data.benchmarkValue !== undefined;
    }
    return true;
  },
  { message: "Non-range benchmarks require a benchmarkValue", path: ["benchmarkValue"] }
).refine(
  (data) => {
    // If tierGroupId is set, tierOrder and tierName are required
    if (data.tierGroupId !== undefined) {
      return data.tierOrder !== undefined && data.tierName !== undefined;
    }
    return true;
  },
  { message: "Tier benchmarks require tierOrder and tierName when tierGroupId is set", path: ["tierGroupId"] }
);

export const updateSiteBenchmarkSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  benchmarkValue: z.number().positive().optional(),
  comparisonOperator: z.enum(['lte', 'gte', 'eq', 'range']).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  tierGroupId: z.string().uuid().optional(),
  tierOrder: z.number().int().positive().optional(),
  tierName: z.string().max(50).optional(),
  tierColor: z.string().max(20).optional(),
  applicableOrgTypes: z.array(z.enum(organizationTypeEnum)).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  sport: z.string().min(1).max(50).optional().nullable(),
  position: z.string().min(1).max(50).optional().nullable(),
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
).refine(
  (data) => {
    // Position requires sport to be set
    if (data.position && data.position.trim() !== '') {
      return data.sport && data.sport.trim() !== '';
    }
    return true;
  },
  { message: "Position requires sport to be set", path: ["position"] }
).refine(
  (data) => {
    // When switching to range mode, both min and max must be provided
    if (data.comparisonOperator === 'range') {
      return data.minValue !== undefined && data.maxValue !== undefined;
    }
    return true;
  },
  { message: "Range benchmarks require both minValue and maxValue", path: ["minValue"] }
).refine(
  (data) => {
    // If both min and max are being updated, ensure min < max
    if (data.minValue !== undefined && data.maxValue !== undefined) {
      return data.minValue < data.maxValue;
    }
    return true;
  },
  { message: "minValue must be less than maxValue", path: ["minValue"] }
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
  benchmarkValue: z.number().positive("Benchmark value must be positive").optional(),
  comparisonOperator: z.enum(['lte', 'gte', 'eq', 'range']).default('lte'),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  tierGroupId: z.string().uuid().optional(),
  tierOrder: z.number().int().positive().optional(),
  tierName: z.string().max(50).optional(),
  tierColor: z.string().max(20).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  sport: z.string().min(1).max(50).optional().nullable(),
  position: z.string().min(1).max(50).optional().nullable(),
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
).refine(
  (data) => {
    // Position requires sport to be set
    if (data.position && data.position.trim() !== '') {
      return data.sport && data.sport.trim() !== '';
    }
    return true;
  },
  { message: "Position requires sport to be set", path: ["position"] }
).refine(
  (data) => {
    if (data.comparisonOperator === 'range') {
      return data.minValue !== undefined && data.maxValue !== undefined;
    }
    return true;
  },
  { message: "Range benchmarks require both minValue and maxValue", path: ["minValue"] }
).refine(
  (data) => {
    if (data.comparisonOperator === 'range' && data.minValue !== undefined && data.maxValue !== undefined) {
      return data.minValue < data.maxValue;
    }
    return true;
  },
  { message: "minValue must be less than maxValue for range benchmarks", path: ["minValue"] }
).refine(
  (data) => {
    if (data.comparisonOperator !== 'range') {
      return data.benchmarkValue !== undefined;
    }
    return true;
  },
  { message: "Non-range benchmarks require a benchmarkValue", path: ["benchmarkValue"] }
).refine(
  (data) => {
    // If tierGroupId is set, tierOrder and tierName are required
    if (data.tierGroupId !== undefined) {
      return data.tierOrder !== undefined && data.tierName !== undefined;
    }
    return true;
  },
  { message: "Tier benchmarks require tierOrder and tierName when tierGroupId is set", path: ["tierGroupId"] }
);

export const updateCustomBenchmarkSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  benchmarkValue: z.number().positive().optional(),
  comparisonOperator: z.enum(['lte', 'gte', 'eq', 'range']).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  tierGroupId: z.string().uuid().optional(),
  tierOrder: z.number().int().positive().optional(),
  tierName: z.string().max(50).optional(),
  tierColor: z.string().max(20).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(5).max(100).optional(),
  ageMax: z.number().int().min(5).max(100).optional(),
  sport: z.string().min(1).max(50).optional().nullable(),
  position: z.string().min(1).max(50).optional().nullable(),
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
).refine(
  (data) => {
    // Position requires sport to be set
    if (data.position && data.position.trim() !== '') {
      return data.sport && data.sport.trim() !== '';
    }
    return true;
  },
  { message: "Position requires sport to be set", path: ["position"] }
).refine(
  (data) => {
    // When switching to range mode, both min and max must be provided
    if (data.comparisonOperator === 'range') {
      return data.minValue !== undefined && data.maxValue !== undefined;
    }
    return true;
  },
  { message: "Range benchmarks require both minValue and maxValue", path: ["minValue"] }
).refine(
  (data) => {
    // If both min and max are being updated, ensure min < max
    if (data.minValue !== undefined && data.maxValue !== undefined) {
      return data.minValue < data.maxValue;
    }
    return true;
  },
  { message: "minValue must be less than maxValue", path: ["minValue"] }
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

// ============================================================================
// Benchmark Set Schemas
// ============================================================================

export const insertBenchmarkSetSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(1000).optional(),
  sport: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  isTemplate: z.boolean().default(false),
});

export const updateBenchmarkSetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  sport: z.string().max(50).optional().nullable(),
  level: z.string().max(50).optional().nullable(),
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional().nullable(),
  isTemplate: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const insertBenchmarkSetItemSchema = z.object({
  benchmarkId: z.string().min(1, "Benchmark ID is required"),
  benchmarkType: z.enum(['site', 'custom']),
  displayOrder: z.number().int().min(0).optional(),
  customLabel: z.string().max(100).optional(),
});

export const updateBenchmarkSetItemSchema = z.object({
  displayOrder: z.number().int().min(0).optional(),
  customLabel: z.string().max(100).optional().nullable(),
});

export const reorderBenchmarkSetItemsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    displayOrder: z.number().int().min(0),
  })).min(1).max(1000), // Prevent DoS with excessive items
});

export const toggleSiteSetVisibilitySchema = z.object({
  isEnabled: z.boolean(),
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
      // userDefined applies to team reports only (individual reads benchmarks from site/custom)
      userDefined: z.array(z.object({
        metricCode: z.string(),
        value: z.number().positive(),
        label: z.string().max(100),
      })).optional(),
    }).optional(),
    charts: z.object({
      radar: z.boolean().optional(),
      benchmarkStanding: z.boolean().optional(),
      trends: z.boolean().optional(),
      distribution: z.boolean().optional(),
      fvProfile: z.boolean().optional(),
      leaderboard: z.boolean().optional(),
      tierDistribution: z.boolean().optional(),
      boxSwarm: z.boolean().optional(),
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
    // Audience for tailored AI coaching insights language
    audience: z.enum(['coach', 'athlete', 'parent']).optional(),
    showTrends: z.boolean().optional(),
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
      // userDefined applies to team reports only (individual reads benchmarks from site/custom)
      userDefined: z.array(z.object({
        metricCode: z.string(),
        value: z.number().positive(),
        label: z.string().max(100),
      })).optional(),
    }).optional(),
    charts: z.object({
      radar: z.boolean().optional(),
      benchmarkStanding: z.boolean().optional(),
      trends: z.boolean().optional(),
      distribution: z.boolean().optional(),
      fvProfile: z.boolean().optional(),
      leaderboard: z.boolean().optional(),
      tierDistribution: z.boolean().optional(),
      boxSwarm: z.boolean().optional(),
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
    // Audience for tailored AI coaching insights language
    audience: z.enum(['coach', 'athlete', 'parent']).optional(),
    showTrends: z.boolean().optional(),
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
export type InsertOAuthUser = z.infer<typeof insertOAuthUserSchema>;
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

export type InsertSiteSport = z.infer<typeof insertSiteSportSchema>;
export type SiteSport = typeof siteSports.$inferSelect;
export type UpdateSiteSport = z.infer<typeof updateSiteSportSchema>;

export type InsertSitePosition = z.infer<typeof insertSitePositionSchema>;
export type SitePosition = typeof sitePositions.$inferSelect;
export type UpdateSitePosition = z.infer<typeof updateSitePositionSchema>;

// Enriched type for sport with its positions
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

export type InsertSiteBenchmark = z.infer<typeof insertSiteBenchmarkSchema>;
export type SiteBenchmark = typeof siteBenchmarks.$inferSelect;
export type UpdateSiteBenchmark = z.infer<typeof updateSiteBenchmarkSchema>;

// Tier definition for a single tier in a group
export const tierDefinitionSchema = z.object({
  tierName: z.string().min(1).max(50),
  tierOrder: z.number().int().min(1),
  tierColor: z.string().max(20).optional(),
  // For range benchmarks
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  // For single-value benchmarks
  benchmarkValue: z.number().optional(),
}).refine(
  (data) => {
    // Validate minValue < maxValue when both are provided
    if (data.minValue !== undefined && data.maxValue !== undefined) {
      return data.minValue < data.maxValue;
    }
    return true;
  },
  { message: "minValue must be less than maxValue", path: ["minValue"] }
);

export type TierDefinition = z.infer<typeof tierDefinitionSchema>;

// Schema for creating a tier group (batch creation)
export const insertTierGroupSchema = z.object({
  metricCode: z.string().min(1).max(50),
  name: z.string().min(1).max(100), // Base name for the group
  description: z.string().max(1000).optional(),
  comparisonOperator: z.enum(['lte', 'gte', 'eq', 'range']),
  tiers: z.array(tierDefinitionSchema).min(2, "Tier group must have at least 2 tiers").max(10, "Tier group must have at most 10 tiers"),
  // Shared filters
  gender: z.enum(['Male', 'Female', 'Not Specified']).optional(),
  ageMin: z.number().int().min(0).optional(),
  ageMax: z.number().int().max(100).optional(),
  position: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  applicableOrgTypes: z.array(z.enum(organizationTypeEnum)).optional(),
}).refine(data => {
  // Validate tier orders are sequential starting from 1
  const orders = data.tiers.map(t => t.tierOrder).sort((a, b) => a - b);
  return orders.every((o, i) => o === i + 1);
}, { message: "Tier orders must be sequential (1, 2, 3...)" })
.refine(data => {
  // Validate unique tier names
  const names = data.tiers.map(t => t.tierName.toLowerCase());
  return new Set(names).size === names.length;
}, { message: "Tier names must be unique within the group" })
.refine(data => {
  // Validate ageMin <= ageMax when both are provided
  if (data.ageMin !== undefined && data.ageMax !== undefined) {
    return data.ageMin <= data.ageMax;
  }
  return true;
}, { message: "Age minimum must be less than or equal to age maximum", path: ["ageMin"] });

export type InsertTierGroup = z.infer<typeof insertTierGroupSchema>;

export type InsertCustomBenchmark = z.infer<typeof insertCustomBenchmarkSchema>;
export type CustomBenchmark = typeof customBenchmarks.$inferSelect;
export type UpdateCustomBenchmark = z.infer<typeof updateCustomBenchmarkSchema>;

export type InsertOrganizationBenchmark = z.infer<typeof insertOrganizationBenchmarkSchema>;
export type OrganizationBenchmark = typeof organizationBenchmarks.$inferSelect;
export type UpdateOrganizationBenchmark = z.infer<typeof updateOrganizationBenchmarkSchema>;

export type InsertBenchmarkSet = z.infer<typeof insertBenchmarkSetSchema>;
export type UpdateBenchmarkSet = z.infer<typeof updateBenchmarkSetSchema>;
export type InsertBenchmarkSetItem = z.infer<typeof insertBenchmarkSetItemSchema>;
export type UpdateBenchmarkSetItem = z.infer<typeof updateBenchmarkSetItemSchema>;
export type ReorderBenchmarkSetItems = z.infer<typeof reorderBenchmarkSetItemsSchema>;

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
  benchmarkValue: number | null;
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  minValue: number | null;
  maxValue: number | null;
  // Tier group fields
  tierGroupId: string | null;
  tierName: string | null;
  tierOrder: number | null;
  tierColor: string | null;
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
// Defines metric types: lower_is_better, higher_is_better, tracking
export const VALID_METRICS = [
  { key: 'FLY10_TIME', metricType: 'lower_is_better' },
  { key: 'VERTICAL_JUMP', metricType: 'higher_is_better' },
  { key: 'AGILITY_505', metricType: 'lower_is_better' },
  { key: 'AGILITY_5105', metricType: 'lower_is_better' },
  { key: 'T_TEST', metricType: 'lower_is_better' },
  { key: 'DASH_40YD', metricType: 'lower_is_better' },
  { key: 'RSI', metricType: 'higher_is_better' },
  { key: 'TOP_SPEED', metricType: 'higher_is_better' },
  { key: 'HEIGHT', metricType: 'tracking' },
  { key: 'WEIGHT', metricType: 'tracking' },
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

// Organization Type enum for exports
export const OrganizationType = {
  YOUTH: "youth",
  HIGH_SCHOOL: "high_school", 
  COLLEGE: "college",
  CLUB: "club",
  PRIVATE_FACILITY: "private_facility",
  ELITE_ACADEMY: "elite_academy",
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
  // Sports and positions are now dynamic - stored as codes from site_sports and site_positions tables
  sports: z.array(z.string().min(1, "Sport code required")).optional(),
  positions: z.array(z.string().min(1, "Position code required")).optional(),
  height: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  gender: z.enum(["Male", "Female", "Not Specified"]).optional(),
  teamIds: z.array(z.string()).optional(),
  organizationId: z.string().optional(),
  parentEmail: z.string().email("Invalid email format").optional().nullable(),
});

// Organization Type
export type OrganizationType = (typeof organizationTypeEnum)[number];

// Sport Code Type
export type SportCode = (typeof sportCodeEnum)[number];

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
  aiModel: z.enum(AI_MODELS).optional(),
  wellnessModuleEnabled: z.boolean().optional(),
  sprintFvEnabled: z.boolean().optional(),
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

// Goal validation schemas
export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  achievedAt: true, // Managed by system when status changes to 'achieved'
}).extend({
  userId: z.string().min(1, "User ID is required"),
  metric: z.string().min(1, "Metric is required"),
  goalType: z.enum(goalTypeEnum),
  targetValue: z.number().positive("Target value must be positive"),
  baselineValue: z.number().nonnegative("Baseline value must be non-negative"),
  currentValue: z.number().nonnegative("Current value must be non-negative").optional(),
  targetDate: z.string().date("Target date must be in YYYY-MM-DD format"),
  status: z.enum(goalStatusEnum).default('active'),
  notes: z.string().max(1000, "Notes cannot exceed 1000 characters").optional(),
}).refine(
  (data) => {
    const targetDate = new Date(data.targetDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset to start of day for fair comparison
    return targetDate >= now;
  },
  {
    message: "Target date must be today or in the future",
    path: ["targetDate"],
  }
);

export const updateGoalSchema = z.object({
  metric: z.string().min(1).optional(),
  goalType: z.enum(goalTypeEnum).optional(),
  targetValue: z.number().positive().optional(),
  baselineValue: z.number().nonnegative().optional(),
  currentValue: z.number().nonnegative().optional(),
  targetDate: z.string().date().optional(),
  status: z.enum(goalStatusEnum).optional(),
  notes: z.string().max(1000).optional(),
}).strict().refine(
  (data) => {
    if (data.targetDate) {
      const targetDate = new Date(data.targetDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return targetDate >= now;
    }
    return true;
  },
  {
    message: "Target date must be today or in the future",
    path: ["targetDate"],
  }
);

export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type UpdateGoal = z.infer<typeof updateGoalSchema>;

// Membership request types and schemas
export type MembershipRequest = typeof membershipRequests.$inferSelect;
export type InsertMembershipRequest = typeof membershipRequests.$inferInsert;

export const insertMembershipRequestSchema = createInsertSchema(membershipRequests).omit({
  id: true,
  createdAt: true,
  processedAt: true,
  processedBy: true,
}).extend({
  userId: z.string().min(1, "User ID is required"),
  organizationId: z.string().min(1, "Organization ID is required"),
  status: z.enum(membershipRequestStatusEnum).default('pending'),
  requestedRole: z.string().default('athlete'),
  discoveryMethod: z.enum(membershipRequestDiscoveryMethodEnum).optional(),
});

export const createMembershipRequestSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  discoveryMethod: z.enum(membershipRequestDiscoveryMethodEnum).optional(),
});

export type CreateMembershipRequest = z.infer<typeof createMembershipRequestSchema>;

// Organization membership settings update schema
export const updateOrgMembershipSettingsSchema = z.object({
  isPublicDirectory: z.boolean().optional(),
  allowMembershipRequests: z.boolean().optional(),
  autoApproveRequests: z.boolean().optional(),
});

export type UpdateOrgMembershipSettings = z.infer<typeof updateOrgMembershipSettingsSchema>;

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

/**
 * Notification type enum for categorizing push notifications
 */
export const notificationTypeEnum = [
  'wellness_survey',      // Coach sends wellness survey to athletes
  'wellness_digest',      // Daily digest of at-risk athletes for coaches
  'new_measurement',      // New performance data logged for athlete
  'team_announcement',    // Coach broadcasts to team
] as const;

/**
 * Notification delivery status enum
 */
export const notificationDeliveryStatusEnum = ['pending', 'delivered', 'failed', 'expired'] as const;

/**
 * Notification channel enum
 */
export const notificationChannelEnum = ['push', 'email'] as const;

/**
 * Event visibility enum
 */
export const eventVisibilityEnum = ['org_private', 'public', 'invite_only'] as const;

/**
 * Event status enum
 */
export const eventStatusEnum = ['draft', 'published', 'active', 'completed', 'cancelled'] as const;

/**
 * Registration mode enum
 */
export const registrationModeEnum = ['open', 'request_approval', 'invitation_only'] as const;

/**
 * Results visibility enum
 */
export const resultsVisibilityEnum = ['immediate', 'after_event', 'manual'] as const;

/**
 * Registration status enum
 */
export const registrationStatusEnum = ['pending', 'approved', 'waitlisted', 'declined', 'cancelled', 'checked_in', 'completed'] as const;

/**
 * Event invitation status enum
 */
export const eventInvitationStatusEnum = ['pending', 'accepted', 'declined', 'expired', 'cancelled'] as const;

/**
 * Push Subscriptions - stores Web Push subscriptions per device
 * One user can have multiple subscriptions (multiple devices)
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Web Push subscription data
  endpoint: varchar("endpoint", { length: 2048 }).notNull().unique(),
  p256dh: text("p256dh").notNull(),      // Public key for encryption
  auth: text("auth").notNull(),           // Auth secret for encryption
  // Device metadata
  deviceName: text("device_name"),        // Optional: "iPhone", "Chrome Desktop"
  userAgent: text("user_agent"),          // Browser/device info
  // Lifecycle tracking
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),  // Track active subscriptions
  expiresAt: timestamp("expires_at"),     // Optional: subscription expiry
}, (table) => ({
  // Performance indexes
  userIndex: index("push_subscriptions_user_idx").on(table.userId),
  endpointIndex: index("push_subscriptions_endpoint_idx").on(table.endpoint),
}));

/**
 * User Notification Preferences - user-level toggle controls
 * One row per user, created with defaults on first access
 */
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  // Master toggles
  pushEnabled: boolean("push_enabled").default(true).notNull(),
  emailEnabled: boolean("email_enabled").default(true).notNull(),
  // Push notification type toggles
  pushWellnessSurveys: boolean("push_wellness_surveys").default(true).notNull(),
  pushWellnessDigest: boolean("push_wellness_digest").default(true).notNull(),
  pushNewMeasurements: boolean("push_new_measurements").default(true).notNull(),
  pushTeamAnnouncements: boolean("push_team_announcements").default(true).notNull(),
  // Email notification type toggles
  emailWellnessSurveys: boolean("email_wellness_surveys").default(true).notNull(),
  emailWellnessDigest: boolean("email_wellness_digest").default(true).notNull(),
  emailNewMeasurements: boolean("email_new_measurements").default(false).notNull(),
  emailTeamAnnouncements: boolean("email_team_announcements").default(true).notNull(),
  // Quiet hours (optional - notifications deferred during these times)
  quietHoursEnabled: boolean("quiet_hours_enabled").default(false).notNull(),
  quietHoursStart: time("quiet_hours_start"),  // e.g., "22:00"
  quietHoursEnd: time("quiet_hours_end"),      // e.g., "07:00"
  quietHoursTimezone: text("quiet_hours_timezone").default("America/New_York"),
  // Lifecycle
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Notification History - audit log and analytics for sent notifications
 */
export const notificationHistory = pgTable("notification_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "set null" }),
  // Notification content
  type: text("type", { enum: notificationTypeEnum }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),                        // Deep link URL when clicked
  data: jsonb("data"),                     // Additional payload data
  // Delivery tracking
  channels: text("channels").array().notNull().default(sql`ARRAY['push']::text[]`),
  deliveryStatus: text("delivery_status", { enum: notificationDeliveryStatusEnum }).default("pending").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  clickedAt: timestamp("clicked_at"),       // Track engagement
  // Error tracking
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
}, (table) => ({
  // Performance indexes for analytics
  userIndex: index("notification_history_user_idx").on(table.userId),
  orgIndex: index("notification_history_org_idx").on(table.orgId),
  typeIndex: index("notification_history_type_idx").on(table.type),
  sentAtIndex: index("notification_history_sent_at_idx").on(table.sentAt),
  // Composite indexes for common query patterns
  userSentAtIndex: index("notification_history_user_sent_idx").on(table.userId, table.sentAt.desc()),
  orgTypeSentIndex: index("notification_history_org_type_sent_idx").on(table.orgId, table.type, table.sentAt.desc()).where(sql`org_id IS NOT NULL`),
}));

/**
 * Organization Notification Settings - org-level controls set by org admins
 * Controls which notification types are available and default preferences
 */
export const orgNotificationSettings = pgTable("org_notification_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }).unique(),
  // Master toggle for the organization
  pushEnabled: boolean("push_enabled").default(true).notNull(),
  // Which notification types are available to users in this org
  wellnessSurveysEnabled: boolean("wellness_surveys_enabled").default(true).notNull(),
  wellnessDigestEnabled: boolean("wellness_digest_enabled").default(true).notNull(),
  newMeasurementsEnabled: boolean("new_measurements_enabled").default(true).notNull(),
  teamAnnouncementsEnabled: boolean("team_announcements_enabled").default(true).notNull(),
  // Daily digest configuration for coaches
  digestTime: time("digest_time").default(sql`'07:00'::time`).notNull(),
  digestSkipWeekends: boolean("digest_skip_weekends").default(false).notNull(),
  digestTimezone: text("digest_timezone").default("America/New_York").notNull(),
  // Default preferences for new users in this org
  defaultPushWellnessSurveys: boolean("default_push_wellness_surveys").default(true).notNull(),
  defaultPushMeasurements: boolean("default_push_measurements").default(true).notNull(),
  defaultPushAnnouncements: boolean("default_push_announcements").default(true).notNull(),
  defaultEmailWellnessSurveys: boolean("default_email_wellness_surveys").default(true).notNull(),
  defaultEmailMeasurements: boolean("default_email_measurements").default(false).notNull(),
  defaultEmailAnnouncements: boolean("default_email_announcements").default(true).notNull(),
  // Lifecycle
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
});

/**
 * Events - combines, camps, testing days
 */
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

/**
 * Event Registrations - historical snapshot approach like measurements
 */
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

/**
 * Event Invitations - token-based invitations
 */
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

/**
 * Event Metrics - which metrics are required for an event
 */
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

/**
 * Event Freeze Overrides - audit log for frozen event modifications
 */
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

// Push Notification Relations
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

// Event Relations
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

// Push Notification Type Exports
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
export type NotificationPreferencesRecord = typeof notificationPreferences.$inferSelect;
export type NotificationHistoryRecord = typeof notificationHistory.$inferSelect;
export type OrgNotificationSettingsRecord = typeof orgNotificationSettings.$inferSelect;
export type NotificationType = (typeof notificationTypeEnum)[number];
export type NotificationDeliveryStatus = (typeof notificationDeliveryStatusEnum)[number];
export type NotificationChannel = (typeof notificationChannelEnum)[number];

// Event Type Exports
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type UpdateEvent = z.infer<typeof updateEventSchema>;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type InsertEventRegistration = z.infer<typeof insertEventRegistrationSchema>;
export type UpdateEventRegistration = z.infer<typeof updateEventRegistrationSchema>;
export type EventInvitation = typeof eventInvitations.$inferSelect;
export type InsertEventInvitation = z.infer<typeof insertEventInvitationSchema>;
export type EventMetric = typeof eventMetrics.$inferSelect;
export type InsertEventMetric = z.infer<typeof insertEventMetricSchema>;
export type EventFreezeOverride = typeof eventFreezeOverrides.$inferSelect;
export type EventVisibility = (typeof eventVisibilityEnum)[number];
export type EventStatus = (typeof eventStatusEnum)[number];
export type RegistrationMode = (typeof registrationModeEnum)[number];
export type ResultsVisibility = (typeof resultsVisibilityEnum)[number];
export type RegistrationStatus = (typeof registrationStatusEnum)[number];
export type EventInvitationStatus = (typeof eventInvitationStatusEnum)[number];

// Event helper types
export type EventWithCounts = Event & {
  registrationCount: number;
  approvedCount: number;
  waitlistCount: number;
};

export type EventMetricWithDetails = EventMetric & {
  metricLabel: string;
  metricType: string;
  units: string;
};

// Push Subscription Insert Schema
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
}).extend({
  endpoint: z.string().url("Invalid endpoint URL"),
  p256dh: z.string().min(1, "Public key is required"),
  auth: z.string().min(1, "Auth secret is required"),
  deviceName: z.string().max(100).optional(),
});

// Notification Preferences Update Schema
export const updateNotificationPreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  pushWellnessSurveys: z.boolean().optional(),
  pushWellnessDigest: z.boolean().optional(),
  pushNewMeasurements: z.boolean().optional(),
  pushTeamAnnouncements: z.boolean().optional(),
  emailWellnessSurveys: z.boolean().optional(),
  emailWellnessDigest: z.boolean().optional(),
  emailNewMeasurements: z.boolean().optional(),
  emailTeamAnnouncements: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format").optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format").optional(),
  quietHoursTimezone: z.string().optional(),
});

// Org Notification Settings Update Schema
export const updateOrgNotificationSettingsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  wellnessSurveysEnabled: z.boolean().optional(),
  wellnessDigestEnabled: z.boolean().optional(),
  newMeasurementsEnabled: z.boolean().optional(),
  teamAnnouncementsEnabled: z.boolean().optional(),
  digestTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format").optional(),
  digestSkipWeekends: z.boolean().optional(),
  digestTimezone: z.string().optional(),
  defaultPushWellnessSurveys: z.boolean().optional(),
  defaultPushMeasurements: z.boolean().optional(),
  defaultPushAnnouncements: z.boolean().optional(),
  defaultEmailWellnessSurveys: z.boolean().optional(),
  defaultEmailMeasurements: z.boolean().optional(),
  defaultEmailAnnouncements: z.boolean().optional(),
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;
export type UpdateOrgNotificationSettings = z.infer<typeof updateOrgNotificationSettingsSchema>;

// Event Validation Schemas
const baseEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resultsPublishedAt: true,
  resultsPublishedBy: true,
  isFrozen: true,
  frozenAt: true,
  frozenBy: true,
  frozenReason: true,
}).extend({
  name: z.string().min(1, "Event name is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  eventType: z.string().optional(),
  startDate: z.coerce.date({
    required_error: "Start date is required",
    invalid_type_error: "Start date must be a valid date",
  }),
  endDate: z.coerce.date().optional().nullable(),
  timezone: z.string().default("America/New_York"),
  organizationId: z.string().optional(),
  visibility: z.enum(eventVisibilityEnum).default("org_private"),
  registrationMode: z.enum(registrationModeEnum).default("open"),
  status: z.enum(eventStatusEnum).default("draft"),
  registrationOpensAt: z.coerce.date().optional().nullable(),
  registrationClosesAt: z.coerce.date().optional().nullable(),
  maxRegistrations: z.number().int().positive().optional().nullable(),
  eventCode: z.string().optional().nullable(),
  resultsVisibility: z.enum(resultsVisibilityEnum).default("after_event"),
  createdBy: z.string().optional(),
});

export const insertEventSchema = baseEventSchema.refine((data) => {
  // If endDate exists, it must be >= startDate
  if (data.endDate && data.startDate) {
    return data.endDate >= data.startDate;
  }
  return true;
}, {
  message: "End date must be equal to or after start date",
  path: ["endDate"],
}).refine((data) => {
  // If registrationClosesAt exists and registrationOpensAt exists,
  // registrationClosesAt must be >= registrationOpensAt
  if (data.registrationClosesAt && data.registrationOpensAt) {
    return data.registrationClosesAt >= data.registrationOpensAt;
  }
  return true;
}, {
  message: "Registration close date must be equal to or after registration open date",
  path: ["registrationClosesAt"],
});

export const updateEventSchema = baseEventSchema.partial().extend({
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  // Freeze-related fields for updates
  isFrozen: z.boolean().optional(),
  frozenAt: z.coerce.date().nullable().optional(),
  frozenBy: z.string().nullable().optional(),
  frozenReason: z.string().nullable().optional(),
  // Results publishing fields
  resultsPublishedAt: z.coerce.date().nullable().optional(),
  resultsPublishedBy: z.string().nullable().optional(),
  // Audit fields
  updatedAt: z.coerce.date().nullable().optional(),
});

export const insertEventRegistrationSchema = createInsertSchema(eventRegistrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  requestedAt: true,
}).extend({
  eventId: z.string({
    required_error: "Event ID is required",
  }),
  userId: z.string({
    required_error: "User ID is required",
  }),
  userFullNameSnapshot: z.string({
    required_error: "User full name is required",
  }),
  organizationIdSnapshot: z.string().optional().nullable(),
  organizationNameSnapshot: z.string().optional().nullable(),
  status: z.enum(registrationStatusEnum).default("pending"),
  discoveryMethod: z.string().optional().nullable(),
  athleteNotes: z.string().optional().nullable(),
  adminNotes: z.string().optional().nullable(),
});

// Update schema for event registrations - includes workflow fields
export const updateEventRegistrationSchema = z.object({
  status: z.enum(registrationStatusEnum).optional(),
  registrationNumber: z.number().int().positive().optional().nullable(),
  waitlistPosition: z.number().int().positive().optional().nullable(),
  // Approval workflow
  approvedAt: z.coerce.date().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  // Decline workflow
  declinedAt: z.coerce.date().nullable().optional(),
  declinedBy: z.string().nullable().optional(),
  declineReason: z.string().nullable().optional(),
  // Check-in workflow
  checkedInAt: z.coerce.date().nullable().optional(),
  checkedInBy: z.string().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  // Notes
  athleteNotes: z.string().nullable().optional(),
  adminNotes: z.string().nullable().optional(),
  // Audit
  updatedAt: z.coerce.date().nullable().optional(),
});

export const insertEventInvitationSchema = createInsertSchema(eventInvitations).omit({
  id: true,
  createdAt: true,
}).extend({
  eventId: z.string({
    required_error: "Event ID is required",
  }),
  userId: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  token: z.string({
    required_error: "Invitation token is required",
  }),
  status: z.enum(eventInvitationStatusEnum).optional(),
  invitedBy: z.string().optional().nullable(),
  expiresAt: z.coerce.date({
    required_error: "Expiration date is required",
  }),
  // Workflow fields - can be set during creation
  emailSent: z.boolean().optional(),
  emailSentAt: z.coerce.date().nullable().optional(),
  acceptedAt: z.coerce.date().nullable().optional(),
  declinedAt: z.coerce.date().nullable().optional(),
  cancelledAt: z.coerce.date().nullable().optional(),
  cancelledBy: z.string().nullable().optional(),
});

// Update schema for event invitations
export const updateEventInvitationSchema = z.object({
  status: z.enum(eventInvitationStatusEnum).optional(),
  emailSent: z.boolean().optional(),
  emailSentAt: z.coerce.date().nullable().optional(),
  acceptedAt: z.coerce.date().nullable().optional(),
  declinedAt: z.coerce.date().nullable().optional(),
  cancelledAt: z.coerce.date().nullable().optional(),
  cancelledBy: z.string().nullable().optional(),
});

export const insertEventMetricSchema = createInsertSchema(eventMetrics).omit({
  id: true,
  createdAt: true,
}).extend({
  eventId: z.string({
    required_error: "Event ID is required",
  }),
  metricCode: z.string({
    required_error: "Metric code is required",
  }),
  displayOrder: z.number().int().optional(),
  isRequired: z.boolean().optional(),
  customLabel: z.string().optional().nullable(),
});
