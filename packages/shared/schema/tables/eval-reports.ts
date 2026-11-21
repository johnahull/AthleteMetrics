/**
 * Eval Report Tables (AM-FEAT-019)
 *
 * evalBatteryTemplates, evalBatteryTemplateRevisions, orgEvalReportSettings
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, index, uniqueIndex, unique, foreignKey, type PgTableExtraConfig } from "drizzle-orm/pg-core";
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
  /** The latest published revision (AM-FEAT-024, migration 0180 PROVISIONAL). `metrics` above mirrors it. Null only on a row nothing has published for yet. */
  currentRevisionId: varchar("current_revision_id", { length: 36 }),
  /** Stable key of a global preset ('foundation', 'performance'); null for every other template. Rename-proof (migration 0180, PROVISIONAL). */
  presetKey: varchar("preset_key", { length: 30 }),
// The explicit return type breaks the type cycle with evalBatteryTemplateRevisions (they reference each other)
}, (table): PgTableExtraConfig => ({
  currentRevisionFk: foreignKey({
    name: "eval_battery_templates_current_revision_fk",
    columns: [table.currentRevisionId],
    foreignColumns: [evalBatteryTemplateRevisions.id],
  }),
  presetKeyUniq: uniqueIndex("eval_battery_templates_preset_key_uniq").on(table.presetKey).where(sql`preset_key IS NOT NULL`),
  orgIdx: index("eval_battery_templates_org_idx").on(table.organizationId),
  orgNameUniq: uniqueIndex("eval_battery_templates_org_name_uniq").on(table.organizationId, table.name)
    .where(sql`organization_id IS NOT NULL AND archived_at IS NULL`),
  globalNameUniq: uniqueIndex("eval_battery_templates_global_name_uniq").on(table.name)
    .where(sql`organization_id IS NULL AND archived_at IS NULL`),
}));

/**
 * Append-only: one row per published battery (AM-FEAT-024, migration 0180 PROVISIONAL). Rows are never updated or
 * deleted by the service; migration 0180 adds a trigger that enforces it (a db:push database has no trigger).
 * created_by deliberately has no foreign key: users ON DELETE SET NULL would be an UPDATE of an immutable row.
 */
export const evalBatteryTemplateRevisions = pgTable("eval_battery_template_revisions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  revision: integer("revision").notNull(),
  metrics: jsonb("metrics").$type<EvalTemplateMetric[]>().notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  createdBy: varchar("created_by", { length: 36 }),
}, (table) => ({
  templateFk: foreignKey({
    name: "eval_battery_template_revisions_template_fk",
    columns: [table.templateId],
    foreignColumns: [evalBatteryTemplates.id],
  }).onDelete("cascade"),
  templateRevisionUniq: unique("eval_battery_template_revisions_template_rev_uniq").on(table.templateId, table.revision),
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
export type EvalBatteryTemplateRevision = typeof evalBatteryTemplateRevisions.$inferSelect;
export type OrgEvalReportSettings = typeof orgEvalReportSettings.$inferSelect;
