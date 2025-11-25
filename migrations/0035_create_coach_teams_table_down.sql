-- Down Migration: Remove coach_teams table
-- Reverses migration 0035_create_coach_teams_table.sql

-- Drop indexes first
DROP INDEX IF EXISTS coach_teams_team_active_idx;
DROP INDEX IF EXISTS coach_teams_active_idx;
DROP INDEX IF EXISTS coach_teams_team_idx;
DROP INDEX IF EXISTS coach_teams_coach_idx;

-- Drop the table
DROP TABLE IF EXISTS coach_teams;
