/**
 * Membership Tables
 *
 * userOrganizations, invitations, membershipRequests
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index, jsonb, time } from "drizzle-orm/pg-core";
import { membershipRequestStatusEnum, membershipRequestDiscoveryMethodEnum } from "../enums";
import { organizations, users, teams } from "./core";

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
  // COPPA: coach-provided age data captured at invite-create time. An athlete
  // invitation with an under-13 birthDate cannot be created without parentEmail.
  birthDate: date("birth_date"),
  parentEmail: text("parent_email"),
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
