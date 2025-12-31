/**
 * Settings Tables
 *
 * siteSettings
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { users } from "./core";

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
