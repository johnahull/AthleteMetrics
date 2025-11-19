-- Rollback Migration: Remove sport field from teams table
-- Description: Removes sport context added in 0044_add_team_sport.sql

-- Drop index first
DROP INDEX IF EXISTS teams_sport_idx;

-- Remove sport column
ALTER TABLE teams DROP COLUMN IF EXISTS sport;
