/**
 * Benchmarks Tables
 *
 * Site-level benchmarks, custom benchmarks, and organization benchmark enablement.
 */

import { sql } from "drizzle-orm";
import { pgTable, varchar, uuid, integer, decimal, timestamp, boolean, unique, index, text, jsonb } from "drizzle-orm/pg-core";
import { organizationTypeEnum } from "../enums";
import { organizations, users } from "./core";
import { siteMetrics } from "./metrics";

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
  sport: varchar("sport", { length: 50 }), // Sport code (e.g., "SOCCER", "BASKETBALL")
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
  sport: varchar("sport", { length: 50 }), // Sport code (e.g., "SOCCER", "BASKETBALL")
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

// ============================================================================
// BENCHMARK SETS
// Named collections of benchmarks for use in reports and analytics
// ============================================================================

// Benchmark Sets - Named collections of benchmarks (e.g., "NCAA D1 Women's Soccer")
export const benchmarkSets = pgTable("benchmark_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  sport: varchar("sport", { length: 50 }),
  level: varchar("level", { length: 50 }),
  gender: varchar("gender", { length: 20 }), // "Male", "Female", "Not Specified"
  isTemplate: boolean("is_template").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  orgIdx: index("benchmark_sets_org_idx").on(table.organizationId),
  activeIdx: index("benchmark_sets_active_idx").on(table.isActive),
  uniqueOrgName: unique("benchmark_sets_unique_org_name").on(table.organizationId, table.name),
}));

// Benchmark Set Items - Individual benchmarks within a set
export const benchmarkSetItems = pgTable("benchmark_set_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull().references(() => benchmarkSets.id, { onDelete: 'cascade' }),
  benchmarkId: varchar("benchmark_id").notNull(),
  benchmarkType: varchar("benchmark_type", { length: 10 }).notNull(), // 'site' | 'custom'
  displayOrder: integer("display_order").default(999).notNull(),
  customLabel: varchar("custom_label", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  setIdx: index("benchmark_set_items_set_idx").on(table.setId),
  uniqueSetBenchmark: unique("benchmark_set_items_unique").on(table.setId, table.benchmarkId, table.benchmarkType),
}));

// Organization-level site benchmark set visibility
// Allows org admins to hide/disable site-level benchmark sets for their organization
// Default behavior: No row = site set IS visible (auto-visible by default)
// Disabled: Row with isEnabled: false = site set hidden for org
// Re-enabled: Row with isEnabled: true = explicitly re-enabled
export const organizationBenchmarkSets = pgTable("organization_benchmark_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  siteSetId: varchar("site_set_id").notNull().references(() => benchmarkSets.id, { onDelete: 'cascade' }),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  uniqueOrgSet: unique("organization_benchmark_sets_unique").on(table.organizationId, table.siteSetId),
  orgIdx: index("org_benchmark_sets_org_idx").on(table.organizationId),
}));
