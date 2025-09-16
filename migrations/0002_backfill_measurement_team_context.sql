-- Backfill existing measurements with team context using temporal logic
-- This migration adds team context to existing measurements by determining
-- which team the athlete was on when the measurement was taken
--
-- SAFETY MEASURES:
-- - Only updates measurements without existing team context
-- - Creates backup table before modification
-- - Logs all changes for audit purposes
-- - Provides rollback strategy

-- Create backup table for rollback capability
CREATE TABLE IF NOT EXISTS measurements_backup_before_team_context AS
SELECT * FROM measurements 
WHERE (team_id IS NULL OR team_id = '');

-- Create audit log table for tracking changes
CREATE TABLE IF NOT EXISTS migration_audit_log (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

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
  ORDER BY ut.joined_at ASC -- Deterministic ordering
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Log measurements that will be updated
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, old_values)
SELECT 
  '0002_backfill_measurement_team_context',
  'measurements',
  m.id,
  'BEFORE_UPDATE',
  jsonb_build_object(
    'team_id', m.team_id,
    'season', m.season,
    'team_context_auto', m.team_context_auto
  )
FROM measurements m
WHERE (m.team_id IS NULL OR m.team_id = '');

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

-- Log the results of the update
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
SELECT 
  '0002_backfill_measurement_team_context',
  'measurements',
  m.id,
  'AFTER_UPDATE',
  jsonb_build_object(
    'team_id', m.team_id,
    'season', m.season,
    'team_context_auto', m.team_context_auto
  )
FROM measurements m
WHERE m.team_context_auto = 'true' 
  AND m.id IN (SELECT record_id FROM migration_audit_log WHERE action = 'BEFORE_UPDATE');

-- Drop the temporary function
DROP FUNCTION get_measurement_team_context(varchar, date);

-- Log migration completion statistics
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0002_backfill_measurement_team_context',
  'migration_stats',
  'completion',
  'MIGRATION_COMPLETE',
  jsonb_build_object(
    'total_measurements_updated', (
      SELECT COUNT(*) FROM measurements WHERE team_context_auto = 'true'
    ),
    'backup_table_created', 'measurements_backup_before_team_context',
    'completion_time', NOW()
  )
);

-- Add index for efficient team-based measurement queries
CREATE INDEX IF NOT EXISTS "idx_measurements_team_context" ON "measurements" ("team_id", "season", "date");

-- Add index for season-based queries
CREATE INDEX IF NOT EXISTS "idx_measurements_season" ON "measurements" ("season", "date") WHERE "season" IS NOT NULL;