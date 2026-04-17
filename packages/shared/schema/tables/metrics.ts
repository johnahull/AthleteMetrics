/**
 * Metrics Tables
 *
 * Site-level metric definitions, organization metric enablement, sports, and positions.
 */

import { sql } from "drizzle-orm";
import { pgTable, varchar, integer, decimal, timestamp, boolean, unique, index, text, jsonb } from "drizzle-orm/pg-core";
import { metricTypeEnum, organizationTypeEnum } from "../enums";
import { organizations, users } from "./core";

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

/**
 * Organization-specific custom metrics (org-private, not shared across orgs)
 *
 * Database CHECK Constraints (enforced at DB level via migration 0092):
 * - check_non_derived_has_unit: Non-derived metrics must have a unit
 * - check_derived_has_formula: Derived metrics must have a formula
 * - check_validation_min_max: validation_min must be < validation_max
 *
 * These constraints are defined in the migration and must be manually maintained.
 */
export const customOrgMetrics = pgTable("custom_org_metrics", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Metric identity (mirrors siteMetrics structure)
  code: varchar("code", { length: 100 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }),
  unit: varchar("unit", { length: 20 }),
  metricType: text("metric_type", { enum: metricTypeEnum })
    .default('lower_is_better').notNull(),
  description: text("description"),

  // Richer explanation fields (Phase 2, Issue #367)
  shortDescription: text("short_description"),
  whatItMeasures: text("what_it_measures"),
  whyItMatters: text("why_it_matters"),

  // Validation rules
  validationMin: decimal("validation_min", { precision: 10, scale: 3 }),
  validationMax: decimal("validation_max", { precision: 10, scale: 3 }),
  decimalPrecision: integer("decimal_precision").default(3).notNull(),

  // Sport associations
  sportAssociations: text("sport_associations").array(),

  // Derived metric configuration
  isDerived: boolean("is_derived").default(false).notNull(),
  formula: text("formula"),
  dependentMetrics: text("dependent_metrics").array(),
  calculationConfig: jsonb("calculation_config").$type<{
    dateMatchStrategy: 'same_date' | 'latest_before' | 'closest';
    maxDateDifference?: number;
    missingSourceBehavior: 'skip' | 'error';
  }>(),

  // Display settings
  displayOrder: integer("display_order").default(999),
  color: varchar("color", { length: 20 }),
  icon: varchar("icon", { length: 50 }),

  // Lifecycle (soft delete)
  isActive: boolean("is_active").default(true).notNull(),
  archivedAt: timestamp("archived_at"),

  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  uniqueOrgCode: unique("custom_org_metrics_org_code_unique")
    .on(table.organizationId, table.code),
  orgActiveIdx: index("custom_org_metrics_org_active_idx")
    .on(table.organizationId, table.isActive),
  codeIdx: index("custom_org_metrics_code_idx").on(table.code),
  isDerivedIdx: index("custom_org_metrics_is_derived_idx")
    .on(table.isDerived).where(sql`${table.isDerived} = true`),
}));

// Site-level metric explanation overrides (Phase 2, Issue #367)
// Site admins can customize the prose for built-in metrics.
// Nullable fields enable partial overrides — null = use built-in default.
export const siteMetricExplanations = pgTable("site_metric_explanations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  metricCode: varchar("metric_code", { length: 100 }).notNull().unique(),
  title: text("title"),
  shortDescription: text("short_description"),
  whatItMeasures: text("what_it_measures"),
  whyItMatters: text("why_it_matters"),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("idx_site_metric_explanations_code").on(table.metricCode),
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
