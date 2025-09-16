-- Add date consistency validation constraints
-- Ensures data integrity for temporal fields in user_teams table

-- Add check constraint to ensure left_at is after joined_at when both are present
ALTER TABLE user_teams 
ADD CONSTRAINT chk_user_teams_date_consistency 
CHECK (left_at IS NULL OR joined_at IS NULL OR left_at >= joined_at);

-- Add check constraint to ensure joined_at is not in the future (beyond reasonable limits)
ALTER TABLE user_teams 
ADD CONSTRAINT chk_user_teams_joined_at_reasonable 
CHECK (joined_at IS NULL OR joined_at <= NOW() + INTERVAL '1 year');

-- Add check constraint to ensure left_at is not unreasonably in the future
ALTER TABLE user_teams 
ADD CONSTRAINT chk_user_teams_left_at_reasonable 
CHECK (left_at IS NULL OR left_at <= NOW() + INTERVAL '1 year');

-- Add similar constraints for measurements table if needed
ALTER TABLE measurements 
ADD CONSTRAINT chk_measurements_date_reasonable 
CHECK (date <= CURRENT_DATE + INTERVAL '1 year');

-- Add constraint to prevent measurements more than 10 years in the past (data quality)
ALTER TABLE measurements 
ADD CONSTRAINT chk_measurements_date_not_too_old 
CHECK (date >= CURRENT_DATE - INTERVAL '10 years');

-- Log constraint addition
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
VALUES (
  '0004_add_date_consistency_validation',
  'migration_stats',
  'completion',
  'MIGRATION_COMPLETE',
  jsonb_build_object(
    'constraints_added', ARRAY[
      'chk_user_teams_date_consistency',
      'chk_user_teams_joined_at_reasonable',
      'chk_user_teams_left_at_reasonable',
      'chk_measurements_date_reasonable',
      'chk_measurements_date_not_too_old'
    ],
    'completion_time', NOW(),
    'purpose', 'Add database-level date consistency validation'
  )
);

DO $$ BEGIN
  RAISE NOTICE 'Date consistency validation constraints added successfully.';
END $$;