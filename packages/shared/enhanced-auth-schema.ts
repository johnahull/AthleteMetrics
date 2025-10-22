import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./schema";

// Email verification tokens
export const emailVerifications = pgTable("email_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: text("is_used").default("false").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Password reset tokens
export const passwordResets = pgTable("password_resets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: text("is_used").default("false").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Login sessions for tracking and security
export const loginSessions = pgTable("login_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionToken: text("session_token").notNull().unique(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  location: text("location"), // Approximate location from IP
  isActive: text("is_active").default("true").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Security events log
export const securityEvents = pgTable("security_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  eventType: text("event_type").notNull(), // 'login_success', 'login_failed', 'password_changed', etc.
  eventData: text("event_data"), // JSON string with additional data
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  severity: text("severity").notNull(), // 'info', 'warning', 'critical'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const emailVerificationsRelations = relations(emailVerifications, ({ one }) => ({
  user: one(users, {
    fields: [emailVerifications.userId],
    references: [users.id],
  }),
}));

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.userId],
    references: [users.id],
  }),
}));

export const loginSessionsRelations = relations(loginSessions, ({ one }) => ({
  user: one(users, {
    fields: [loginSessions.userId],
    references: [users.id],
  }),
}));

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
  user: one(users, {
    fields: [securityEvents.userId],
    references: [users.id],
  }),
}));

// Schemas for validation
export const createEmailVerificationSchema = createInsertSchema(emailVerifications).omit({
  id: true,
  createdAt: true,
  isUsed: true,
}).extend({
  email: z.string().email("Invalid email format"),
  token: z.string().min(32, "Token must be at least 32 characters"),
  expiresAt: z.date(),
});

export const createPasswordResetSchema = createInsertSchema(passwordResets).omit({
  id: true,
  createdAt: true,
  isUsed: true,
}).extend({
  token: z.string().min(32, "Token must be at least 32 characters"),
  expiresAt: z.date(),
});

export const createLoginSessionSchema = createInsertSchema(loginSessions).omit({
  id: true,
  createdAt: true,
  lastActivityAt: true,
}).extend({
  sessionToken: z.string().min(32, "Session token must be at least 32 characters"),
  ipAddress: z.string().ip("Invalid IP address"),
  expiresAt: z.date(),
});

export const createSecurityEventSchema = createInsertSchema(securityEvents).omit({
  id: true,
  createdAt: true,
}).extend({
  eventType: z.enum([
    'login_success',
    'login_failed',
    'login_locked',
    'password_changed',
    'password_reset_requested',
    'password_reset_completed',
    'mfa_enabled',
    'mfa_disabled',
    'email_verified',
    'session_expired',
    'suspicious_activity'
  ]),
  severity: z.enum(['info', 'warning', 'critical']),
  ipAddress: z.string().ip("Invalid IP address"),
});

// Enhanced login schema with MFA support
export const enhancedLoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
  mfaToken: z.string().optional(),
  rememberMe: z.boolean().default(false),
});

// MFA setup schema
export const mfaSetupSchema = z.object({
  secret: z.string().min(16, "Invalid MFA secret"),
  token: z.string().regex(/^\d{6}$/, "Token must be 6 digits"),
  backupCodes: z.array(z.string()).optional(),
});

// Password reset request schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
});

// Password reset completion schema
export const passwordResetCompleteSchema = z.object({
  token: z.string().min(32, "Invalid reset token"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  confirmPassword: z.string().min(12, "Confirm password is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Email verification schema
export const emailVerificationSchema = z.object({
  token: z.string().min(32, "Invalid verification token"),
});

// Types
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type CreateEmailVerification = z.infer<typeof createEmailVerificationSchema>;

export type PasswordReset = typeof passwordResets.$inferSelect;
export type CreatePasswordReset = z.infer<typeof createPasswordResetSchema>;

export type LoginSession = typeof loginSessions.$inferSelect;
export type CreateLoginSession = z.infer<typeof createLoginSessionSchema>;

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type CreateSecurityEvent = z.infer<typeof createSecurityEventSchema>;

export type EnhancedLoginData = z.infer<typeof enhancedLoginSchema>;
export type MFASetupData = z.infer<typeof mfaSetupSchema>;
export type PasswordResetRequestData = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetCompleteData = z.infer<typeof passwordResetCompleteSchema>;
export type EmailVerificationData = z.infer<typeof emailVerificationSchema>;