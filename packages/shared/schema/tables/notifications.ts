/**
 * Notifications Tables
 *
 * pushSubscriptions, notificationPreferences, notificationHistory, orgNotificationSettings
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { notificationTypeEnum, notificationDeliveryStatusEnum, notificationChannelEnum } from "../enums";
import { users, organizations } from "./core";

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
