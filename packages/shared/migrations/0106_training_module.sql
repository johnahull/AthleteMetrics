-- Migration: Training Module
-- Adds training_enabled to organizations, training_module_enabled to site_settings,
-- and all 7 training module tables.
-- Applied via: npm run db:migrate:manual

-- ---------------------------------------------------------------------------
-- Step 1: Feature flags on existing tables
-- ---------------------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS training_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS training_module_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- Step 2: Exercise library
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exercises (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  exercise_type VARCHAR(30) NOT NULL,  -- 'weighted' | 'bodyweight' | 'speed' | 'plyometric' | 'timed'
  default_sets INTEGER,
  default_reps INTEGER,
  default_weight_lbs DECIMAL(6, 2),
  default_duration_seconds INTEGER,
  video_url VARCHAR(500),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exercises_org_idx ON exercises (organization_id);
CREATE INDEX IF NOT EXISTS exercises_active_idx ON exercises (organization_id, is_active);

-- ---------------------------------------------------------------------------
-- Step 3: Training programs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_programs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sport VARCHAR(100),
  duration_weeks INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS training_programs_org_idx ON training_programs (organization_id);
CREATE INDEX IF NOT EXISTS training_programs_active_idx ON training_programs (organization_id, is_active);

-- ---------------------------------------------------------------------------
-- Step 4: Program workout days
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS program_workouts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id VARCHAR NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  name VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS program_workouts_program_idx ON program_workouts (program_id);
CREATE INDEX IF NOT EXISTS program_workouts_program_day_idx ON program_workouts (program_id, day_number);

-- ---------------------------------------------------------------------------
-- Step 5: Program workout exercises (prescriptions)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS program_workout_exercises (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  program_workout_id VARCHAR NOT NULL REFERENCES program_workouts(id) ON DELETE CASCADE,
  exercise_id VARCHAR NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  prescribed_sets INTEGER,
  prescribed_reps INTEGER,
  prescribed_weight_lbs DECIMAL(6, 2),
  prescribed_duration_seconds INTEGER,
  rest_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS program_workout_exercises_workout_idx ON program_workout_exercises (program_workout_id);
CREATE INDEX IF NOT EXISTS program_workout_exercises_exercise_idx ON program_workout_exercises (exercise_id);
CREATE INDEX IF NOT EXISTS program_workout_exercises_workout_order_idx ON program_workout_exercises (program_workout_id, display_order);

-- ---------------------------------------------------------------------------
-- Step 6: Athlete program assignments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS athlete_programs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id VARCHAR NOT NULL REFERENCES training_programs(id) ON DELETE RESTRICT,
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'cancelled'
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS athlete_programs_athlete_idx ON athlete_programs (athlete_id);
CREATE INDEX IF NOT EXISTS athlete_programs_org_idx ON athlete_programs (organization_id);
CREATE INDEX IF NOT EXISTS athlete_programs_program_idx ON athlete_programs (program_id);
CREATE INDEX IF NOT EXISTS athlete_programs_athlete_org_idx ON athlete_programs (athlete_id, organization_id, status);

-- Partial unique index: one active program per athlete per org
-- This is the real safety net for the race condition.
-- Drizzle cannot generate partial indexes, so this MUST remain raw SQL.
CREATE UNIQUE INDEX IF NOT EXISTS athlete_programs_unique_active_per_athlete
  ON athlete_programs (athlete_id, organization_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Step 7: Workout logs (completion records)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workout_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_program_id VARCHAR NOT NULL REFERENCES athlete_programs(id) ON DELETE CASCADE,
  program_workout_id VARCHAR NOT NULL REFERENCES program_workouts(id) ON DELETE RESTRICT,
  logged_by VARCHAR,  -- historical reference, no FK (coach or athlete)
  status VARCHAR(20) NOT NULL DEFAULT 'completed',  -- 'completed' | 'partial' | 'skipped'
  logged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Unique: one log per (athlete_program, program_workout) combination
  CONSTRAINT workout_logs_unique_per_assignment UNIQUE (athlete_program_id, program_workout_id)
);

CREATE INDEX IF NOT EXISTS workout_logs_athlete_program_idx ON workout_logs (athlete_program_id);
CREATE INDEX IF NOT EXISTS workout_logs_workout_idx ON workout_logs (program_workout_id);
CREATE INDEX IF NOT EXISTS workout_logs_athlete_program_workout_idx ON workout_logs (athlete_program_id, program_workout_id);

-- ---------------------------------------------------------------------------
-- Step 8: Workout log entries (per-exercise set data)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workout_log_entries (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_log_id VARCHAR NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise_id VARCHAR NOT NULL,  -- historical reference, no FK (allows archiving exercises)
  exercise_name_snapshot VARCHAR(200) NOT NULL,  -- name at time of logging
  exercise_type VARCHAR(30) NOT NULL,  -- snapshot of type at log time
  sets JSONB NOT NULL,  -- WorkoutSet[] validated by workoutSetSchema before insert
  quality_rating INTEGER,  -- 1-5 for speed/plyometric exercises
  duration_seconds INTEGER,  -- for timed exercises
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workout_log_entries_log_idx ON workout_log_entries (workout_log_id);
CREATE INDEX IF NOT EXISTS workout_log_entries_exercise_idx ON workout_log_entries (exercise_id);
