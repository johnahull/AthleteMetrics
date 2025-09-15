-- Backfill existing measurements with team context using temporal logic
-- This migration adds team context to existing measurements by determining
-- which team the athlete was on when the measurement was taken

-- Create temporary function to get active team for measurement
CREATE OR REPLACE FUNCTION get_measurement_team_context(
  p_user_id varchar,
  p_measurement_date date
)
RETURNS TABLE(
  team_id varchar,
  season text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as team_id,
    t.season
  FROM user_teams ut
  JOIN teams t ON ut.team_id = t.id
  WHERE ut.user_id = p_user_id
    AND ut.joined_at <= p_measurement_date
    AND (ut.left_at IS NULL OR ut.left_at >= p_measurement_date)
    AND ut.is_active = 'true'
    AND t.is_archived = 'false'
  LIMIT 1; -- Take first team if multiple (deterministic based on join order)
END;
$$ LANGUAGE plpgsql;

-- Update measurements with team context
UPDATE measurements 
SET 
  team_id = ctx.team_id,
  season = ctx.season,
  team_context_auto = 'true'
FROM (
  SELECT 
    m.id as measurement_id,
    tc.team_id,
    tc.season
  FROM measurements m
  CROSS JOIN LATERAL get_measurement_team_context(m.user_id, m.date) tc
  WHERE (m.team_id IS NULL OR m.team_id = '') -- Only update measurements without team context
) ctx
WHERE measurements.id = ctx.measurement_id;

-- Drop the temporary function
DROP FUNCTION get_measurement_team_context(varchar, date);

-- Add index for efficient team-based measurement queries
CREATE INDEX IF NOT EXISTS "idx_measurements_team_context" ON "measurements" ("team_id", "season", "date");

-- Add index for season-based queries
CREATE INDEX IF NOT EXISTS "idx_measurements_season" ON "measurements" ("season", "date") WHERE "season" IS NOT NULL;