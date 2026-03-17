-- Migration: 0108_training_schema_fixes
-- Fixes three QA-identified issues from the training module branch:
--   1. default_reps & prescribed_reps: integer → varchar(30) to support ranges like '8-10', 'AMRAP', '30s'
--   2. athlete_programs: add athlete_name_snapshot for historical integrity at assignment time
--   3. workout_logs: add name snapshot columns for historical log integrity

-- Fix 1a: Change default_reps from INTEGER to VARCHAR(30)
-- Existing integer values are cast to text automatically
ALTER TABLE exercises
  ALTER COLUMN default_reps TYPE VARCHAR(30) USING default_reps::text;

-- Fix 1b: Change prescribed_reps from INTEGER to VARCHAR(30)
ALTER TABLE program_workout_exercises
  ALTER COLUMN prescribed_reps TYPE VARCHAR(30) USING prescribed_reps::text;

-- Fix 2: Add athlete_name_snapshot to athlete_programs (populated at assignment time)
ALTER TABLE athlete_programs
  ADD COLUMN IF NOT EXISTS athlete_name_snapshot VARCHAR(255);

-- Fix 3: Add name snapshot columns to workout_logs (populated at log creation time)
ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS athlete_name_snapshot VARCHAR(200),
  ADD COLUMN IF NOT EXISTS program_workout_name_snapshot VARCHAR(200),
  ADD COLUMN IF NOT EXISTS logged_by_name_snapshot VARCHAR(200);
