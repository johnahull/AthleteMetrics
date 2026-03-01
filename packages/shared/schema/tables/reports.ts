/**
 * Reports Tables
 *
 * reports, reportSnapshots, reportBenchmarks
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { organizations, teams, users } from "./core";
import { siteMetrics } from "./metrics";

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

  // Soft-hide: Coach can archive reports without deleting (athletes still see shared reports)
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  orgIdx: index("reports_org_idx").on(table.organizationId),
  createdByIdx: index("reports_created_by_idx").on(table.createdBy),
  typeIdx: index("reports_type_idx").on(table.reportType),
  orgTypeIdx: index("reports_org_type_idx").on(table.organizationId, table.reportType),
  pinnedIdx: index("reports_pinned_idx").on(table.isPinned),
  orgPinnedIdx: index("reports_org_pinned_idx").on(table.organizationId, table.isPinned),
  archivedAtIdx: index("reports_archived_at_idx").on(table.archivedAt),
  orgNotArchivedIdx: index("reports_org_not_archived_idx")
    .on(table.organizationId)
    .where(sql`${table.archivedAt} IS NULL`),
  orgPinnedNotArchivedIdx: index("reports_org_pinned_not_archived_idx")
    .on(table.organizationId, table.isPinned)
    .where(sql`${table.archivedAt} IS NULL`),
}));

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

  // COPPA compliance flags (added in migration 0024_coppa_compliance)
  // Set at snapshot creation time based on athlete ages AT TIME OF DATA COLLECTION.
  // Never updated retroactively after the fact — use age-at-collection, not current age.
  containsMinorData: boolean("contains_minor_data").default(false).notNull(),
  publicAccessRestricted: boolean("public_access_restricted").default(false).notNull(),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("report_snapshots_token_idx").on(table.publicToken),
  reportIdx: index("report_snapshots_report_idx").on(table.reportId),
  expiresIdx: index("report_snapshots_expires_idx").on(table.expiresAt),
  activeIdx: index("report_snapshots_active_idx").on(table.isActive),
  activeExpiresIdx: index("report_snapshots_active_expires_idx").on(table.isActive, table.expiresAt),
}));

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

export const reportShares = pgTable("report_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => reports.id, { onDelete: 'cascade' }),
  athleteId: varchar("athlete_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sharedBy: varchar("shared_by").references(() => users.id, { onDelete: 'set null' }), // Coach who shared
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  message: text("message"), // Optional message from coach
  viewedAt: timestamp("viewed_at"), // When athlete first viewed
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // Soft-hide: Athlete can dismiss shared reports without affecting coach view
  dismissedAt: timestamp("dismissed_at"),
}, (table) => ({
  // Prevent duplicate shares of same report to same athlete
  uniqueReportAthlete: unique("report_shares_unique_report_athlete").on(table.reportId, table.athleteId),
  reportIdx: index("report_shares_report_idx").on(table.reportId),
  athleteIdx: index("report_shares_athlete_idx").on(table.athleteId),
  orgIdx: index("report_shares_org_idx").on(table.organizationId),
  dismissedAtIdx: index("report_shares_dismissed_at_idx").on(table.dismissedAt),
  athleteNotDismissedIdx: index("report_shares_athlete_not_dismissed_idx")
    .on(table.athleteId)
    .where(sql`${table.dismissedAt} IS NULL`),
}));
