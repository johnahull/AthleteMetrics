-- Rollback script for 0003_add_temporal_query_indexes.sql
-- This script removes the performance indexes added for temporal queries

-- Log rollback start
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0003_rollback_temporal_query_indexes',
  'migration_stats',
  'rollback_start',
  'ROLLBACK_START',
  jsonb_build_object(
    'rollback_time', NOW(),
    'indexes_to_remove', ARRAY[
      'idx_user_teams_temporal_lookup',
      'idx_user_teams_team_temporal',
      'idx_measurements_date_user',
      'idx_teams_active_lookup'
    ]
  )
) ON CONFLICT DO NOTHING;

-- Remove composite index for temporal team membership queries
DROP INDEX IF EXISTS "idx_user_teams_temporal_lookup";

-- Remove index for team-based temporal queries
DROP INDEX IF EXISTS "idx_user_teams_team_temporal";

-- Remove index for date range queries on measurements
DROP INDEX IF EXISTS "idx_measurements_date_user";

-- Remove partial index for active team lookups
DROP INDEX IF EXISTS "idx_teams_active_lookup";

-- Log rollback completion
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0003_rollback_temporal_query_indexes',
  'migration_stats',
  'completion',
  'ROLLBACK_COMPLETE',
  jsonb_build_object(
    'indexes_removed', ARRAY[
      'idx_user_teams_temporal_lookup',
      'idx_user_teams_team_temporal',
      'idx_measurements_date_user', 
      'idx_teams_active_lookup'
    ],
    'completion_time', NOW(),
    'note', 'Performance indexes removed - query performance may be slower'
  )
);

DO $$ BEGIN
  RAISE NOTICE 'Temporal query indexes rollback completed successfully. Query performance may be slower without these indexes.';
END $$;