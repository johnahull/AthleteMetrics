-- Add composite indexes for improved temporal query performance
-- This migration adds indexes to optimize the temporal team membership queries
-- used in measurement team context resolution

-- Add composite index for temporal team membership queries
-- This covers the common query pattern: user_id + is_active + temporal range
CREATE INDEX IF NOT EXISTS "idx_user_teams_temporal_lookup" 
ON "user_teams" ("user_id", "is_active", "joined_at", "left_at")
WHERE "is_active" = 'true' AND "joined_at" IS NOT NULL;

-- Add index for team-based temporal queries
-- Useful for finding all active members of a team within a date range
CREATE INDEX IF NOT EXISTS "idx_user_teams_team_temporal" 
ON "user_teams" ("team_id", "is_active", "joined_at", "left_at")
WHERE "is_active" = 'true' AND "joined_at" IS NOT NULL;

-- Add index for date range queries on measurements
-- Improves performance when filtering measurements by date ranges
CREATE INDEX IF NOT EXISTS "idx_measurements_date_user" 
ON "measurements" ("date", "user_id");

-- Add partial index for active team lookups
-- Optimizes queries that only need active, non-archived teams
CREATE INDEX IF NOT EXISTS "idx_teams_active_lookup"
ON "teams" ("is_archived", "id", "season")
WHERE "is_archived" = 'false';

-- Log index creation completion
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0003_add_temporal_query_indexes',
  'migration_stats',
  'completion', 
  'MIGRATION_COMPLETE',
  jsonb_build_object(
    'indexes_created', ARRAY[
      'idx_user_teams_temporal_lookup',
      'idx_user_teams_team_temporal', 
      'idx_measurements_date_user',
      'idx_teams_active_lookup'
    ],
    'completion_time', NOW(),
    'purpose', 'Optimize temporal queries for team membership and measurement context resolution'
  )
) ON CONFLICT DO NOTHING;