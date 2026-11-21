/**
 * Settings Tables
 *
 * siteSettings
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { users } from "./core";
import { DEFAULT_AI_MODEL_KEY } from "../../ai-models";
import type { AIPromptOverrideKey } from "../../ai-prompt-overrides";

export const siteSettings = pgTable("site_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  aiModel: text("ai_model").notNull().default(DEFAULT_AI_MODEL_KEY),
  wellnessModuleEnabled: boolean("wellness_module_enabled").notNull().default(true),
  sprintFvEnabled: boolean("sprint_fv_enabled").notNull().default(false),
  // Push notification global settings
  pushNotificationsEnabled: boolean("push_notifications_enabled").notNull().default(true),
  pushDefaultOrgSettings: jsonb("push_default_org_settings"),
  // Site-admin wording for the AI insights prompt slots (packages/shared/ai-prompt-overrides.ts); null = code defaults
  aiPromptOverrides: jsonb("ai_prompt_overrides").$type<Partial<Record<AIPromptOverrideKey, string>>>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
});
