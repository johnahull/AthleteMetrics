import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, unique, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { PASSWORD_REQUIREMENTS, PASSWORD_REGEX } from "./password-requirements";
import { validateUsername } from "./username-validation";

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  level: text("level"), // "Club", "HS", "College"
  notes: text("notes"),
  // Temporal archiving fields
  archivedAt: timestamp("archived_at"),
  season: text("season"), // "2024-Fall", "2025-Spring"
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: team names must be unique within an organization
  uniqueTeamPerOrg: unique().on(table.organizationId, table.name),
  // Performance index for common queries
  orgNameIndex: index("teams_org_name_idx").on(table.organizationId, table.name),
}));

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  emails: text("emails").array().notNull(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  fullName: text("full_name").notNull(),
  // Athlete-specific fields (optional)
  birthDate: date("birth_date"), // Changed from birthday to birthDate
  birthYear: integer("birth_year"), // Computed from birthDate
  graduationYear: integer("graduation_year"),
  school: text("school"),
  phoneNumbers: text("phone_numbers").array(),
  sports: text("sports").array(), // ["Soccer"] - restricted to soccer only
  positions: text("positions").array(), // ["F", "M", "D", "GK"] for soccer positions
  height: integer("height"), // inches
  weight: integer("weight"), // pounds
  gender: text("gender").$type<"Male" | "Female" | "Not Specified">(), // CHECK constraint in migration
  // Enhanced Authentication fields
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  mfaSecret: text("mfa_secret"), // TOTP secret
  backupCodes: text("backup_codes").array(), // Recovery codes
  lastLoginAt: timestamp("last_login_at"),
  loginAttempts: integer("login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  isEmailVerified: boolean("is_email_verified").default(false).notNull(),
  requiresPasswordChange: boolean("requires_password_change").default(false).notNull(),
  passwordChangedAt: timestamp("password_changed_at"),
  // System fields
  isSiteAdmin: boolean("is_site_admin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Optional athlete profiles for performance-specific data
export const athleteProfiles = pgTable("athlete_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  emergencyContact: text("emergency_contact"),
  medicalNotes: text("medical_notes"),
  coachNotes: text("coach_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userTeams = pgTable("user_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  // Temporal membership fields
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"), // NULL = currently active
  season: text("season"), // "2024-Fall", "2025-Spring"
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const measurements = pgTable("measurements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id), // Changed from playerId to userId
  submittedBy: varchar("submitted_by").notNull().references(() => users.id),
  verifiedBy: varchar("verified_by").references(() => users.id),
  isVerified: boolean("is_verified").default(false).notNull(),
  date: date("date").notNull(),
  age: integer("age").notNull(), // User's age at time of measurement
  metric: text("metric").notNull(), // "FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI"
  value: decimal("value", { precision: 10, scale: 3 }).notNull(),
  units: text("units").notNull(), // "s" or "in"
  flyInDistance: decimal("fly_in_distance", { precision: 10, scale: 3 }), // Optional yards for FLY10_TIME
  notes: text("notes"),
  // Team context fields - auto-populated when measurement is created
  teamId: varchar("team_id").references(() => teams.id), // Team athlete was on when measurement was taken
  season: text("season"), // Season designation (e.g., "2024-Fall")
  teamContextAuto: boolean("team_context_auto").default(true), // Whether team was auto-assigned vs manually selected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  playerId: varchar("player_id").references(() => users.id), // Reference to existing athlete (kept as playerId for DB compatibility)
  role: text("role").notNull(), // "athlete", "coach", "org_admin"
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  // Enhanced tracking fields
  status: text("status").notNull().default("pending"), // "pending", "accepted", "expired", "cancelled"
  isUsed: boolean("is_used").default(false).notNull(),
  emailSent: boolean("email_sent").default(false).notNull(),
  emailSentAt: timestamp("email_sent_at"),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: varchar("accepted_by").references(() => users.id), // User ID created from invitation
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by").references(() => users.id),
  lastAttemptAt: timestamp("last_attempt_at"), // Track failed acceptance attempts
  attemptCount: integer("attempt_count").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Audit log for security-sensitive operations
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // e.g., "site_admin_access", "role_change", "user_create"
  resourceType: text("resource_type"), // e.g., "organization", "user", "team"
  resourceId: varchar("resource_id"), // ID of the affected resource
  details: text("details"), // JSON string with additional context
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient querying by user and time
  userTimeIdx: sql`CREATE INDEX IF NOT EXISTS audit_logs_user_time_idx ON ${table} (${table.userId}, ${table.createdAt} DESC)`,
  // Index for querying by action type
  actionIdx: sql`CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON ${table} (${table.action}, ${table.createdAt} DESC)`,
}));

// Email verification tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  isUsed: boolean("is_used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient token lookup
  tokenIdx: sql`CREATE INDEX IF NOT EXISTS email_verification_tokens_token_idx ON ${table} (${table.token})`,
}));

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  teams: many(teams),
  userOrganizations: many(userOrganizations),
  invitations: many(invitations),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  userTeams: many(userTeams),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  userOrganizations: many(userOrganizations),
  userTeams: many(userTeams),
  measurements: many(measurements, { relationName: "userMeasurements" }),
  submittedMeasurements: many(measurements, { relationName: "submittedMeasurements" }),
  verifiedMeasurements: many(measurements, { relationName: "verifiedMeasurements" }),
  invitationsSent: many(invitations),
  emailVerificationTokens: many(emailVerificationTokens),
  athleteProfile: one(athleteProfiles, {
    fields: [users.id],
    references: [athleteProfiles.userId],
  }),
}));

export const athleteProfilesRelations = relations(athleteProfiles, ({ one }) => ({
  user: one(users, {
    fields: [athleteProfiles.userId],
    references: [users.id],
  }),
}));

export const userOrganizationsRelations = relations(userOrganizations, ({ one }) => ({
  user: one(users, {
    fields: [userOrganizations.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganizations.organizationId],
    references: [organizations.id],
  }),
}));

export const userTeamsRelations = relations(userTeams, ({ one }) => ({
  user: one(users, {
    fields: [userTeams.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [userTeams.teamId],
    references: [teams.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
  player: one(users, {
    fields: [invitations.playerId],
    references: [users.id],
  }),
}));

export const measurementsRelations = relations(measurements, ({ one }) => ({
  user: one(users, {
    fields: [measurements.userId],
    references: [users.id],
    relationName: "userMeasurements",
  }),
  submittedBy: one(users, {
    fields: [measurements.submittedBy],
    references: [users.id],
    relationName: "submittedMeasurements",
  }),
  verifiedBy: one(users, {
    fields: [measurements.verifiedBy],
    references: [users.id],
    relationName: "verifiedMeasurements",
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  archivedAt: true, // Managed by system
  isArchived: true, // Managed by system
}).extend({
  name: z.string().min(1, "Team name is required"),
  organizationId: z.string().optional(), // Made optional for client-side, server will provide it
  season: z.string().optional(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  fullName: true,
  birthYear: true, // birthYear is computed from birthDate, so exclude from input
}).extend({
  username: z.string().refine((username) => {
    const result = validateUsername(username);
    return result.valid;
  }, (username) => {
    const result = validateUsername(username);
    return { message: result.errors[0] || "Invalid username" };
  }),
  emails: z.array(z.string().email("Invalid email format")).min(1, "At least one email is required"),
  password: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
    .regex(PASSWORD_REGEX.lowercase, "Password must contain at least one lowercase letter")
    .regex(PASSWORD_REGEX.uppercase, "Password must contain at least one uppercase letter")
    .regex(PASSWORD_REGEX.number, "Password must contain at least one number")
    .regex(PASSWORD_REGEX.specialChar, "Password must contain at least one special character"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["site_admin", "org_admin", "coach", "athlete"]).default("athlete"),
  isSiteAdmin: z.boolean().default(false).optional(),
  birthDate: z.string().optional().refine((date) => {
    if (!date) return true;
    const d = new Date(date);
    return !isNaN(d.getTime()) && d <= new Date();
  }, "Invalid birth date or future date"),
  teamIds: z.array(z.string().min(1, "Team ID required")).optional(),
  sports: z.array(z.enum(["Soccer"])).optional(),
  positions: z.array(z.enum(["F", "M", "D", "GK"])).optional(),
  phoneNumbers: z.array(z.string().min(1, "Phone number cannot be empty")).optional(),
  gender: z.enum(["Male", "Female", "Not Specified"]).optional(),
});

export const insertAthleteProfileSchema = createInsertSchema(athleteProfiles).omit({
  id: true,
  createdAt: true,
});

export const updateProfileSchema = z.object({
  emails: z.array(z.string().email("Invalid email format")).optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength, `New password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
    .regex(PASSWORD_REGEX.lowercase, "New password must contain at least one lowercase letter")
    .regex(PASSWORD_REGEX.uppercase, "New password must contain at least one uppercase letter")
    .regex(PASSWORD_REGEX.number, "New password must contain at least one number")
    .regex(PASSWORD_REGEX.specialChar, "New password must contain at least one special character"),
  confirmPassword: z.string().min(PASSWORD_REQUIREMENTS.minLength, `Confirm password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Team archiving schemas
export const archiveTeamSchema = z.object({
  teamId: z.string().min(1, "Team ID is required"),
  archiveDate: z.coerce.date()
    .optional() // Defaults to now
    .refine((date) => !date || date <= new Date(), "Archive date cannot be in the future"),
  season: z.string().min(1, "Season is required"), // "2024-Fall Soccer"
});

export const updateTeamMembershipSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  teamId: z.string().min(1, "Team ID is required"),
  leftAt: z.coerce.date().optional(),
  season: z.string().optional(),
  joinedAt: z.coerce.date().optional(), // For validation purposes
}).refine((data) => {
  // Validate that leftAt is after joinedAt when both are present
  if (data.leftAt && data.joinedAt) {
    return data.leftAt >= data.joinedAt;
  }
  return true;
}, {
  message: "Team membership end date must be after join date",
  path: ["leftAt"]
}).refine((data) => {
  // Validate that dates are not unreasonably in the future
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  
  if (data.leftAt && data.leftAt > oneYearFromNow) {
    return false;
  }
  if (data.joinedAt && data.joinedAt > oneYearFromNow) {
    return false;
  }
  return true;
}, {
  message: "Dates cannot be more than one year in the future",
  path: ["leftAt"]
});

export const insertUserOrganizationSchema = createInsertSchema(userOrganizations).omit({
  id: true,
  createdAt: true,
});

export const insertUserTeamSchema = createInsertSchema(userTeams).omit({
  id: true,
  createdAt: true,
  joinedAt: true, // Managed by system
  isActive: true, // Managed by system
}).extend({
  season: z.string().optional(),
  leftAt: z.coerce.date().optional(),
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
  token: true,
  isUsed: true,
}).extend({
  email: z.string().email("Invalid email format"),
  role: z.enum(["athlete", "coach", "org_admin"]), // Removed site_admin from invitations
  teamIds: z.array(z.string()).optional(),
});

export const insertMeasurementSchema = createInsertSchema(measurements).omit({
  id: true,
  age: true, // Age is calculated automatically
  createdAt: true,
  units: true,
  verifiedBy: true,
  isVerified: true,
  submittedBy: true, // Backend handles this automatically based on session
  teamContextAuto: true, // Managed by system
}).extend({
  userId: z.string().min(1, "User is required"), // Changed from playerId to userId
  date: z.string().min(1, "Date is required"),
  metric: z.enum(["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI", "TOP_SPEED"]),
  value: z.number().positive("Value must be positive"),
  flyInDistance: z.number().positive().optional(),
  // Optional team context - will be auto-populated if not provided
  teamId: z.string().optional(),
  season: z.string().optional(),
});

// Types
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type ArchiveTeam = z.infer<typeof archiveTeamSchema>;
export type UpdateTeamMembership = z.infer<typeof updateTeamMembershipSchema>;

export type InsertAthleteProfile = z.infer<typeof insertAthleteProfileSchema>;
export type AthleteProfile = typeof athleteProfiles.$inferSelect;

// Schema for creating site admin users
export const createSiteAdminSchema = z.object({
  username: z.string().refine((username) => {
    const result = validateUsername(username);
    return result.valid;
  }, (username) => {
    const result = validateUsername(username);
    return { message: result.errors[0] || "Invalid username" };
  }),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength, `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`)
    .regex(PASSWORD_REGEX.lowercase, "Password must contain at least one lowercase letter")
    .regex(PASSWORD_REGEX.uppercase, "Password must contain at least one uppercase letter")
    .regex(PASSWORD_REGEX.number, "Password must contain at least one number")
    .regex(PASSWORD_REGEX.specialChar, "Password must contain at least one special character"),
});

export type CreateSiteAdmin = z.infer<typeof createSiteAdminSchema>;

export type InsertUserOrganization = z.infer<typeof insertUserOrganizationSchema>;
export type UserOrganization = typeof userOrganizations.$inferSelect;

export type InsertUserTeam = z.infer<typeof insertUserTeamSchema>;
export type UserTeam = typeof userTeams.$inferSelect;

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export type InsertMeasurement = z.infer<typeof insertMeasurementSchema>;
export type Measurement = typeof measurements.$inferSelect;

// Enums
export const MetricType = {
  FLY10_TIME: "FLY10_TIME",
  VERTICAL_JUMP: "VERTICAL_JUMP",
  AGILITY_505: "AGILITY_505",
  AGILITY_5105: "AGILITY_5105",
  T_TEST: "T_TEST",
  DASH_40YD: "DASH_40YD",
  RSI: "RSI",
  TOP_SPEED: "TOP_SPEED",
} as const;

export const TeamLevel = {
  CLUB: "Club",
  HS: "HS",
  COLLEGE: "College",
} as const;

export const Gender = {
  MALE: "Male",
  FEMALE: "Female",
  NOT_SPECIFIED: "Not Specified",
} as const;

export const SoccerPosition = {
  FORWARD: "F",
  MIDFIELDER: "M",
  DEFENDER: "D",
  GOALKEEPER: "GK",
} as const;

// Organization-specific roles only
export const UserRole = {
  ORG_ADMIN: "org_admin",
  COACH: "coach",
  ATHLETE: "athlete",
} as const;

export const OrganizationRole = {
  ORG_ADMIN: "org_admin",
  COACH: "coach",
  ATHLETE: "athlete",
} as const;

// Unified athlete schema
export type Athlete = User;
export type InsertAthlete = z.infer<typeof insertAthleteSchema>;

// Consolidated athlete creation schema
export const insertAthleteSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  emails: z.array(z.string().email("Invalid email format")).optional(),
  birthDate: z.string().optional(),
  graduationYear: z.coerce.number().int().min(2000).max(2040).optional(),
  school: z.string().optional(),
  phoneNumbers: z.array(z.string()).optional(),
  sports: z.array(z.enum(["Soccer"])).optional(),
  positions: z.array(z.enum(["F", "M", "D", "GK"])).optional(),
  height: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  gender: z.enum(["Male", "Female", "Not Specified"]).optional(),
  teamIds: z.array(z.string()).optional(),
  organizationId: z.string().optional()
});

// Legacy compatibility exports removed - use Athlete types instead