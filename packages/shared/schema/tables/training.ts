/**
 * Training Module Tables
 *
 * exercises, trainingPrograms, programWorkouts, programWorkoutExercises,
 * athletePrograms, workoutLogs, workoutLogEntries
 *
 * Added in migration 0024_training_module.sql
 * Feature-gated behind trainingModuleEnabled (site) + trainingEnabled (org)
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";

// ---------------------------------------------------------------------------
// Exercise Library
// ---------------------------------------------------------------------------

export const exercises = pgTable("exercises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // e.g. "strength", "speed", "plyometric"
  exerciseType: varchar("exercise_type", { length: 30 }).notNull(), // 'weighted' | 'bodyweight' | 'speed' | 'plyometric' | 'timed'
  defaultSets: integer("default_sets"),
  defaultReps: integer("default_reps"),
  defaultWeightLbs: decimal("default_weight_lbs", { precision: 6, scale: 2 }),
  defaultDurationSeconds: integer("default_duration_seconds"),
  videoUrl: varchar("video_url", { length: 500 }), // YouTube/Vimeo URL only
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("exercises_org_idx").on(table.organizationId),
  activeIdx: index("exercises_active_idx").on(table.organizationId, table.isActive),
}));

// ---------------------------------------------------------------------------
// Training Programs
// ---------------------------------------------------------------------------

export const trainingPrograms = pgTable("training_programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  sport: varchar("sport", { length: 100 }),
  durationWeeks: integer("duration_weeks").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("training_programs_org_idx").on(table.organizationId),
  activeIdx: index("training_programs_active_idx").on(table.organizationId, table.isActive),
}));

// ---------------------------------------------------------------------------
// Program Workouts (individual training days within a program)
// ---------------------------------------------------------------------------

export const programWorkouts = pgTable("program_workouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programId: varchar("program_id").notNull().references(() => trainingPrograms.id, { onDelete: 'cascade' }),
  dayNumber: integer("day_number").notNull(), // sequential position; reorder changes this
  name: varchar("name", { length: 200 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  programIdx: index("program_workouts_program_idx").on(table.programId),
  programDayIdx: index("program_workouts_program_day_idx").on(table.programId, table.dayNumber),
}));

// ---------------------------------------------------------------------------
// Program Workout Exercises (prescribed exercises for a workout day)
// ---------------------------------------------------------------------------

export const programWorkoutExercises = pgTable("program_workout_exercises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  programWorkoutId: varchar("program_workout_id").notNull().references(() => programWorkouts.id, { onDelete: 'cascade' }),
  // IMPORTANT: onDelete restrict — archiving an exercise checks this FK first
  exerciseId: varchar("exercise_id").notNull().references(() => exercises.id, { onDelete: 'restrict' }),
  displayOrder: integer("display_order").notNull().default(0),
  // Prescription fields
  prescribedSets: integer("prescribed_sets"),
  prescribedReps: integer("prescribed_reps"),
  prescribedWeightLbs: decimal("prescribed_weight_lbs", { precision: 6, scale: 2 }),
  prescribedDurationSeconds: integer("prescribed_duration_seconds"),
  restSeconds: integer("rest_seconds"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workoutIdx: index("program_workout_exercises_workout_idx").on(table.programWorkoutId),
  exerciseIdx: index("program_workout_exercises_exercise_idx").on(table.exerciseId),
  workoutOrderIdx: index("program_workout_exercises_workout_order_idx").on(table.programWorkoutId, table.displayOrder),
}));

// ---------------------------------------------------------------------------
// Athlete Programs (assignments linking athletes to programs)
// ---------------------------------------------------------------------------

export const athletePrograms = pgTable("athlete_programs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  athleteId: varchar("athlete_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  programId: varchar("program_id").notNull().references(() => trainingPrograms.id, { onDelete: 'restrict' }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: 'set null' }),
  startDate: date("start_date").notNull(),
  // status: 'active' | 'completed' | 'cancelled'
  status: varchar("status", { length: 20 }).notNull().default('active'),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  athleteIdx: index("athlete_programs_athlete_idx").on(table.athleteId),
  orgIdx: index("athlete_programs_org_idx").on(table.organizationId),
  programIdx: index("athlete_programs_program_idx").on(table.programId),
  // NOTE: partial unique index (WHERE status = 'active') is created via raw SQL in migration
  // Drizzle cannot generate partial unique indexes
  athleteOrgActiveIdx: index("athlete_programs_athlete_org_idx").on(table.athleteId, table.organizationId, table.status),
}));

// ---------------------------------------------------------------------------
// Workout Logs (athlete completion records per workout day)
// ---------------------------------------------------------------------------

export const workoutLogs = pgTable("workout_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  athleteProgramId: varchar("athlete_program_id").notNull().references(() => athletePrograms.id, { onDelete: 'cascade' }),
  programWorkoutId: varchar("program_workout_id").notNull().references(() => programWorkouts.id, { onDelete: 'restrict' }),
  // Historical reference — no FK (athlete may be removed from org)
  loggedBy: varchar("logged_by"), // user who submitted the log (coach or athlete)
  // status: 'completed' | 'partial' | 'skipped'
  status: varchar("status", { length: 20 }).notNull().default('completed'),
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  athleteProgramIdx: index("workout_logs_athlete_program_idx").on(table.athleteProgramId),
  workoutIdx: index("workout_logs_workout_idx").on(table.programWorkoutId),
  // Unique log per (athleteProgramId, programWorkoutId) — enforced via DB unique constraint in migration
  athleteProgramWorkoutIdx: index("workout_logs_athlete_program_workout_idx").on(
    table.athleteProgramId,
    table.programWorkoutId
  ),
}));

// ---------------------------------------------------------------------------
// Workout Log Entries (per-exercise set data within a log)
// ---------------------------------------------------------------------------

export const workoutLogEntries = pgTable("workout_log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workoutLogId: varchar("workout_log_id").notNull().references(() => workoutLogs.id, { onDelete: 'cascade' }),
  // Historical reference — no FK (allows archiving exercises without breaking logs)
  exerciseId: varchar("exercise_id").notNull(),
  exerciseNameSnapshot: varchar("exercise_name_snapshot", { length: 200 }).notNull(), // name at time of logging
  exerciseType: varchar("exercise_type", { length: 30 }).notNull(), // snapshot of type at log time
  sets: jsonb("sets").notNull(), // WorkoutSet[] validated by workoutSetSchema
  qualityRating: integer("quality_rating"), // 1-5 for speed/plyometric exercises
  durationSeconds: integer("duration_seconds"), // for timed exercises
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  logIdx: index("workout_log_entries_log_idx").on(table.workoutLogId),
  exerciseIdx: index("workout_log_entries_exercise_idx").on(table.exerciseId),
}));
