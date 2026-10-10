/**
 * Eval Report Tables (AM-FEAT-019)
 *
 * evalBatteryTemplates, orgEvalReportSettings
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";
import type { EvalTemplateMetric, EvalSelectionInput } from "../../eval-template-schemas";

/** organizationId NULL = the global default template shipped by BTA. */
export const evalBatteryTemplates = pgTable("eval_battery_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "cascade" }),
  sport: varchar("sport", { length: 50 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  // Logical keys (eval-report metric-key-map), not metric codes; validated by evalTemplateMetricsSchema
  metrics: jsonb("metrics").$type<EvalTemplateMetric[]>().notNull(),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  orgIdx: index("eval_battery_templates_org_idx").on(table.organizationId),
  orgNameUniq: uniqueIndex("eval_battery_templates_org_name_uniq").on(table.organizationId, table.name)
    .where(sql`organization_id IS NOT NULL AND archived_at IS NULL`),
  globalNameUniq: uniqueIndex("eval_battery_templates_global_name_uniq").on(table.name)
    .where(sql`organization_id IS NULL AND archived_at IS NULL`),
}));

export const orgEvalReportSettings = pgTable("org_eval_report_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }).unique(),
  // Saved overrides per preset: { middle_school?, high_school?, senior? }
  presets: jsonb("presets").$type<Record<string, Partial<Omit<EvalSelectionInput, "preset">>>>().default(sql`'{}'::jsonb`).notNull(),
  lastSelection: jsonb("last_selection").$type<EvalSelectionInput>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
});

export type EvalBatteryTemplate = typeof evalBatteryTemplates.$inferSelect;
export type OrgEvalReportSettings = typeof orgEvalReportSettings.$inferSelect;
