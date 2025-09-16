-- Rollback script for 0004_add_date_consistency_validation.sql
-- This script removes the date consistency validation constraints
--
-- WARNING: Removing these constraints may allow invalid data to be inserted
-- Only run this if you're sure you want to remove data validation

-- Log rollback start
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0004_rollback_date_consistency_validation',
  'migration_stats',
  'rollback_start',
  'ROLLBACK_START',
  jsonb_build_object(
    'rollback_time', NOW(),
    'constraints_to_remove', ARRAY[
      'chk_user_teams_date_consistency',
      'chk_user_teams_joined_at_reasonable',
      'chk_user_teams_left_at_reasonable',
      'chk_measurements_date_reasonable',
      'chk_measurements_date_not_too_old'
    ],
    'warning', 'Removing these constraints may allow invalid data'
  )
);

-- Remove date consistency constraint from user_teams
ALTER TABLE user_teams 
DROP CONSTRAINT IF EXISTS chk_user_teams_date_consistency;

-- Remove reasonable date constraints from user_teams
ALTER TABLE user_teams 
DROP CONSTRAINT IF EXISTS chk_user_teams_joined_at_reasonable;

ALTER TABLE user_teams 
DROP CONSTRAINT IF EXISTS chk_user_teams_left_at_reasonable;

-- Remove date constraints from measurements
ALTER TABLE measurements 
DROP CONSTRAINT IF EXISTS chk_measurements_date_reasonable;

ALTER TABLE measurements 
DROP CONSTRAINT IF EXISTS chk_measurements_date_not_too_old;

-- Log rollback completion
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0004_rollback_date_consistency_validation',
  'migration_stats',
  'completion',
  'ROLLBACK_COMPLETE',
  jsonb_build_object(
    'constraints_removed', ARRAY[
      'chk_user_teams_date_consistency',
      'chk_user_teams_joined_at_reasonable', 
      'chk_user_teams_left_at_reasonable',
      'chk_measurements_date_reasonable',
      'chk_measurements_date_not_too_old'
    ],
    'completion_time', NOW(),
    'warning', 'Date validation constraints removed - invalid data may now be allowed'
  )
);

DO $$ BEGIN
  RAISE WARNING 'Date consistency validation constraints have been removed!';
  RAISE WARNING 'The system will no longer prevent invalid date combinations.';
  RAISE WARNING 'Consider adding application-level validation to maintain data integrity.';
  RAISE NOTICE 'Rollback completed successfully.';
END $$;