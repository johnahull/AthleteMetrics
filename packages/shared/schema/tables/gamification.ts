/**
 * Gamification Tables
 *
 * achievementDefinitions, userAchievements, goals
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { achievementCategoryEnum, achievementRarityEnum, goalTypeEnum, goalStatusEnum } from "../enums";
import { organizations, users } from "./core";
import { siteMetrics } from "./metrics";

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
