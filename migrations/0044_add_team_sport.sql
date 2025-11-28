-- Migration: Add sport field to teams table
-- Description: Adds sport context for AI coaching insights to provide better benchmark interpretation
-- Author: AI Assistant
-- Date: 2024

-- Add sport column to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS sport TEXT;

-- Add index for querying teams by sport (useful for filtering and analytics)
CREATE INDEX IF NOT EXISTS teams_sport_idx ON teams (sport) WHERE sport IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN teams.sport IS 'The primary sport for this team (e.g., Soccer, Basketball). Used for AI coaching insights context.';
