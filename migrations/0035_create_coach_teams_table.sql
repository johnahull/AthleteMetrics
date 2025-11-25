-- Migration: Create coach_teams table for coach-team assignments
-- This allows assigning coaches to specific teams within an organization
-- for targeted notifications, permissions, and team management

-- Create the coach_teams table
CREATE TABLE IF NOT EXISTS coach_teams (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Coach role within the team
  role TEXT DEFAULT 'assistant_coach' CHECK (role IN ('head_coach', 'assistant_coach', 'stats_manager')),
  -- Temporal assignment fields
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMP, -- NULL = currently assigned
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Assignment metadata
  assigned_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT coach_teams_coach_team_unique UNIQUE (coach_id, team_id)
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS coach_teams_coach_idx ON coach_teams(coach_id);
CREATE INDEX IF NOT EXISTS coach_teams_team_idx ON coach_teams(team_id);
CREATE INDEX IF NOT EXISTS coach_teams_active_idx ON coach_teams(is_active);
CREATE INDEX IF NOT EXISTS coach_teams_team_active_idx ON coach_teams(team_id, is_active);

-- Add comment for documentation
COMMENT ON TABLE coach_teams IS 'Assigns coaches to specific teams for notifications and team-level permissions';
COMMENT ON COLUMN coach_teams.role IS 'Coach role: head_coach, assistant_coach, or stats_manager';
COMMENT ON COLUMN coach_teams.removed_at IS 'NULL indicates currently assigned, non-NULL is assignment end timestamp';
COMMENT ON COLUMN coach_teams.is_active IS 'Quick filter for active assignments without checking removed_at';
