import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
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
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Relations
export const teamsRelations = relations(teams, ({ many }) => ({
  playerTeams: many(playerTeams),
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
}));

// Insert schemas
export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
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
}).extend({
  playerId: z.string().min(1, "Player is required"),
  date: z.string().min(1, "Date is required"),
  metric: z.enum(["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI"]),
  value: z.number().positive("Value must be positive"),
  flyInDistance: z.number().positive().optional(),
});

// Types
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

export type InsertPlayerTeam = z.infer<typeof insertPlayerTeamSchema>;
export type PlayerTeam = typeof playerTeams.$inferSelect;

export type InsertMeasurement = z.infer<typeof insertMeasurementSchema>;
export type Measurement = typeof measurements.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
