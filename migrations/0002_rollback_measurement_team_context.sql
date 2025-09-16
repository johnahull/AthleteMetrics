-- Rollback script for 0002_backfill_measurement_team_context.sql
-- This script reverses the team context backfill migration
--
-- WARNING: This will remove team context from measurements that were auto-populated
-- Only run this if you need to completely reverse the migration

-- Verify backup table exists before proceeding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                 WHERE table_name = 'measurements_backup_before_team_context') THEN
    RAISE EXCEPTION 'Backup table measurements_backup_before_team_context not found. Cannot safely rollback.';
  END IF;
END
$$;

-- Log rollback start
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0002_rollback_measurement_team_context',
  'migration_stats',
  'rollback_start',
  'ROLLBACK_START',
  jsonb_build_object(
    'rollback_time', NOW(),
    'records_to_rollback', (
      SELECT COUNT(*) FROM measurements 
      WHERE team_context_auto = 'true'
    )
  )
);

-- Restore measurements from backup (only those that were auto-populated)
UPDATE measurements 
SET 
  team_id = backup.team_id,
  season = backup.season,
  team_context_auto = backup.team_context_auto
FROM measurements_backup_before_team_context backup
WHERE measurements.id = backup.id
  AND measurements.team_context_auto = 'true';

-- Log rollback completion
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0002_rollback_measurement_team_context',
  'migration_stats', 
  'rollback_complete',
  'ROLLBACK_COMPLETE',
  jsonb_build_object(
    'completion_time', NOW(),
    'records_rolled_back', (
      SELECT COUNT(*) FROM measurements_backup_before_team_context
    )
  )
);

-- Drop indexes that were created (optional - may want to keep for performance)
-- DROP INDEX IF EXISTS "idx_measurements_team_context";
-- DROP INDEX IF EXISTS "idx_measurements_season";

-- Optionally clean up backup table (uncomment if you're sure rollback was successful)
-- DROP TABLE IF EXISTS measurements_backup_before_team_context;

DO $$ BEGIN
  RAISE NOTICE 'Rollback completed successfully. Verify results before dropping backup table.';
END $$;