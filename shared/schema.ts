import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  level: text("level"), // "Club", "HS", "College"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  fullName: text("full_name").notNull(),
  birthYear: integer("birth_year").notNull(),
  birthday: date("birthday"), // Full birthday - more precise than birth year
  graduationYear: integer("graduation_year"),
  school: text("school"),
  sports: text("sports").array(), // ["Soccer", "Track & Field", "Basketball", etc.]
  emails: text("emails").array(),
  phoneNumbers: text("phone_numbers").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const playerTeams = pgTable("player_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const measurements = pgTable("measurements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  submittedBy: varchar("submitted_by").notNull().references(() => users.id),
  verifiedBy: varchar("verified_by").references(() => users.id),
  isVerified: text("is_verified").default("false").notNull(),
  date: date("date").notNull(),
  age: integer("age").notNull(), // Player's age at time of measurement
  metric: text("metric").notNull(), // "FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI"
  value: decimal("value", { precision: 10, scale: 3 }).notNull(),
  units: text("units").notNull(), // "s" or "in"
  flyInDistance: decimal("fly_in_distance", { precision: 10, scale: 3 }), // Optional yards for FLY10_TIME
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull(), // "site_admin", "org_admin", "coach", "athlete"
  isActive: text("is_active").default("true").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userOrganizations = pgTable("user_organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  role: text("role").notNull(), // "org_admin", "coach", "athlete"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userTeams = pgTable("user_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  teamIds: text("team_ids").array(),
  role: text("role").notNull(), // "athlete", "coach", "org_admin"
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  isUsed: text("is_used").default("false").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  playerTeams: many(playerTeams),
  userTeams: many(userTeams),
}));

export const usersRelations = relations(users, ({ many }) => ({
  userOrganizations: many(userOrganizations),
  userTeams: many(userTeams),
  submittedMeasurements: many(measurements, { relationName: "submittedMeasurements" }),
  verifiedMeasurements: many(measurements, { relationName: "verifiedMeasurements" }),
  invitationsSent: many(invitations),
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
}));

export const playersRelations = relations(players, ({ many }) => ({
  playerTeams: many(playerTeams),
  measurements: many(measurements),
}));

export const playerTeamsRelations = relations(playerTeams, ({ one }) => ({
  player: one(players, {
    fields: [playerTeams.playerId],
    references: [players.id],
  }),
  team: one(teams, {
    fields: [playerTeams.teamId],
    references: [teams.id],
  }),
}));

export const measurementsRelations = relations(measurements, ({ one }) => ({
  player: one(players, {
    fields: [measurements.playerId],
    references: [players.id],
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

// Insert schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Team name is required"),
  organizationId: z.string().optional(), // Made optional for client-side, server will provide it
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["site_admin", "org_admin", "coach", "athlete"]),
});

export const updateProfileSchema = z.object({
  email: z.string().email("Invalid email format").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Confirm password must be at least 6 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const insertUserOrganizationSchema = createInsertSchema(userOrganizations).omit({
  id: true,
  createdAt: true,
});

export const insertUserTeamSchema = createInsertSchema(userTeams).omit({
  id: true,
  createdAt: true,
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
  token: true,
  isUsed: true,
}).extend({
  email: z.string().email("Invalid email format"),
  role: z.enum(["athlete", "coach", "org_admin", "site_admin"]),
  teamIds: z.array(z.string()).optional(),
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  createdAt: true,
  fullName: true,
}).extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  birthYear: z.number().min(1990).max(2020),
  birthday: z.string().optional(),
  teamIds: z.array(z.string().min(1, "Team ID required")).optional(),
  sports: z.array(z.string().min(1, "Sport cannot be empty")).optional(),
  emails: z.array(z.string().email("Invalid email format")).optional(),
  phoneNumbers: z.array(z.string().min(1, "Phone number cannot be empty")).optional(),
});

export const insertPlayerTeamSchema = createInsertSchema(playerTeams).omit({
  id: true,
  createdAt: true,
});

export const insertMeasurementSchema = createInsertSchema(measurements).omit({
  id: true,
  age: true, // Age is calculated automatically
  createdAt: true,
  units: true,
  verifiedBy: true,
  isVerified: true,
}).extend({
  playerId: z.string().min(1, "Player is required"),
  submittedBy: z.string().min(1, "Submitted by is required"),
  date: z.string().min(1, "Date is required"),
  metric: z.enum(["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI"]),
  value: z.number().positive("Value must be positive"),
  flyInDistance: z.number().positive().optional(),
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

// Schema for creating site admin users
export const createSiteAdminSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  sendInvitation: z.boolean().default(false),
});

export type CreateSiteAdmin = z.infer<typeof createSiteAdminSchema>;

export type InsertUserOrganization = z.infer<typeof insertUserOrganizationSchema>;
export type UserOrganization = typeof userOrganizations.$inferSelect;

export type InsertUserTeam = z.infer<typeof insertUserTeamSchema>;
export type UserTeam = typeof userTeams.$inferSelect;

export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Invitation = typeof invitations.$inferSelect;

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

export type InsertPlayerTeam = z.infer<typeof insertPlayerTeamSchema>;
export type PlayerTeam = typeof playerTeams.$inferSelect;

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
} as const;

export const TeamLevel = {
  CLUB: "Club",
  HS: "HS", 
  COLLEGE: "College",
} as const;

export const UserRole = {
  SITE_ADMIN: "site_admin",
  ORG_ADMIN: "org_admin",
  COACH: "coach",
  ATHLETE: "athlete",
} as const;

export const OrganizationRole = {
  ORG_ADMIN: "org_admin",
  COACH: "coach",
  ATHLETE: "athlete",
} as const;
