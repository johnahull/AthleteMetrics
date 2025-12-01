-- Rollback: Remove Global Athlete System for Cross-Organization Linking

-- Remove global_athlete_id from measurements table
DROP INDEX IF EXISTS measurements_global_athlete_idx;
ALTER TABLE measurements DROP COLUMN IF EXISTS global_athlete_id;

-- Drop audit log table
DROP TABLE IF EXISTS global_athlete_audit_log;

-- Drop links table
DROP TABLE IF EXISTS user_global_athlete_links;

-- Drop global athletes table
DROP TABLE IF EXISTS global_athletes;
