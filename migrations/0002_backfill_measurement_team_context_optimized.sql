-- Optimized backfill migration with batching for large datasets
-- This migration adds team context to existing measurements by determining
-- which team the athlete was on when the measurement was taken
--
-- PERFORMANCE OPTIMIZATIONS:
-- - Processes records in batches to avoid long-running transactions
-- - Uses batch size configuration for memory management
-- - Provides progress tracking and statistics
-- - Includes rollback and monitoring capabilities

-- Set batch size (can be adjusted based on system performance)
\set batch_size 1000

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

-- Create progress tracking table
CREATE TABLE IF NOT EXISTS migration_progress (
  migration_name VARCHAR(255) PRIMARY KEY,
  total_records INTEGER NOT NULL DEFAULT 0,
  processed_records INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 1000,
  started_at TIMESTAMP DEFAULT NOW(),
  last_updated TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'IN_PROGRESS',
  error_message TEXT
);

-- Initialize progress tracking
INSERT INTO migration_progress (migration_name, batch_size) 
VALUES ('0002_backfill_measurement_team_context_optimized', :batch_size)
ON CONFLICT (migration_name) DO UPDATE SET
  batch_size = EXCLUDED.batch_size,
  started_at = NOW(),
  last_updated = NOW(),
  status = 'IN_PROGRESS',
  error_message = NULL;

-- Count total records to process
UPDATE migration_progress 
SET total_records = (
  SELECT COUNT(*) FROM measurements 
  WHERE (team_id IS NULL OR team_id = '')
)
WHERE migration_name = '0002_backfill_measurement_team_context_optimized';

-- Create temporary function to get active team for measurement
CREATE OR REPLACE FUNCTION get_measurement_team_context_optimized(
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
    AND ut.joined_at IS NOT NULL
    AND ut.joined_at <= p_measurement_date
    AND (ut.left_at IS NULL OR ut.left_at >= p_measurement_date)
    AND ut.is_active = 'true'
    AND t.is_archived = 'false'
  ORDER BY ut.joined_at ASC -- Deterministic ordering
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Batched update procedure
CREATE OR REPLACE FUNCTION perform_batched_team_context_update()
RETURNS INTEGER AS $$
DECLARE
  batch_count INTEGER := 0;
  current_batch INTEGER := 0;
  total_updated INTEGER := 0;
  batch_size_var INTEGER;
  start_time TIMESTAMP;
BEGIN
  -- Get batch size from progress table
  SELECT batch_size INTO batch_size_var 
  FROM migration_progress 
  WHERE migration_name = '0002_backfill_measurement_team_context_optimized';
  
  start_time := NOW();
  
  -- Log batch processing start
  INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
  VALUES (
    '0002_backfill_measurement_team_context_optimized',
    'batch_processing',
    'start',
    'BATCH_START',
    jsonb_build_object(
      'batch_size', batch_size_var,
      'start_time', start_time
    )
  );
  
  -- Process measurements in batches
  LOOP
    -- Log batch progress (only before each batch)
    INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, old_values)
    SELECT 
      '0002_backfill_measurement_team_context_optimized',
      'measurements',
      m.id,
      'BEFORE_UPDATE',
      jsonb_build_object(
        'team_id', m.team_id,
        'season', m.season,
        'team_context_auto', m.team_context_auto,
        'batch_number', current_batch
      )
    FROM (
      SELECT id, team_id, season, team_context_auto
      FROM measurements m
      WHERE (m.team_id IS NULL OR m.team_id = '')
      ORDER BY m.id
      LIMIT batch_size_var
    ) m;
    
    -- Get count of current batch
    GET DIAGNOSTICS batch_count = ROW_COUNT;
    
    -- Exit if no more records to process
    IF batch_count = 0 THEN
      EXIT;
    END IF;
    
    current_batch := current_batch + 1;
    
    -- Update current batch with team context
    WITH batch_measurements AS (
      SELECT id, user_id, date
      FROM measurements m
      WHERE (m.team_id IS NULL OR m.team_id = '')
      ORDER BY m.id
      LIMIT batch_size_var
    ),
    team_context AS (
      SELECT 
        bm.id as measurement_id,
        tc.team_id,
        tc.season
      FROM batch_measurements bm
      CROSS JOIN LATERAL get_measurement_team_context_optimized(bm.user_id, bm.date) tc
    )
    UPDATE measurements 
    SET 
      team_id = tc.team_id,
      season = tc.season,
      team_context_auto = 'true'
    FROM team_context tc
    WHERE measurements.id = tc.measurement_id;
    
    total_updated := total_updated + batch_count;
    
    -- Update progress
    UPDATE migration_progress 
    SET 
      processed_records = total_updated,
      last_updated = NOW()
    WHERE migration_name = '0002_backfill_measurement_team_context_optimized';
    
    -- Log batch completion
    INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
    VALUES (
      '0002_backfill_measurement_team_context_optimized',
      'batch_processing',
      'batch_' || current_batch,
      'BATCH_COMPLETE',
      jsonb_build_object(
        'batch_number', current_batch,
        'records_in_batch', batch_count,
        'total_processed', total_updated,
        'completion_time', NOW()
      )
    );
    
    -- Commit transaction after each batch to avoid long locks
    COMMIT;
    
    -- Small delay to reduce system load (optional)
    PERFORM pg_sleep(0.1);
    
  END LOOP;
  
  -- Mark migration as complete
  UPDATE migration_progress 
  SET 
    status = 'COMPLETED',
    last_updated = NOW()
  WHERE migration_name = '0002_backfill_measurement_team_context_optimized';
  
  RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Execute the batched migration
SELECT perform_batched_team_context_update();

-- Log the results of the update
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
SELECT 
  '0002_backfill_measurement_team_context_optimized',
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
  AND EXISTS (
    SELECT 1 FROM migration_audit_log mal 
    WHERE mal.record_id = m.id 
    AND mal.action = 'BEFORE_UPDATE' 
    AND mal.migration_name = '0002_backfill_measurement_team_context_optimized'
  );

-- Drop the temporary functions
DROP FUNCTION IF EXISTS get_measurement_team_context_optimized(varchar, date);
DROP FUNCTION IF EXISTS perform_batched_team_context_update();

-- Log migration completion statistics
INSERT INTO migration_audit_log (migration_name, table_name, record_id, action, new_values)
SELECT 
  '0002_backfill_measurement_team_context_optimized',
  'migration_stats',
  'completion',
  'MIGRATION_COMPLETE',
  jsonb_build_object(
    'total_measurements_updated', (
      SELECT COUNT(*) FROM measurements WHERE team_context_auto = 'true'
    ),
    'batch_processing_used', true,
    'backup_table_created', 'measurements_backup_before_team_context',
    'completion_time', NOW(),
    'final_status', mp.status
  )
FROM migration_progress mp
WHERE mp.migration_name = '0002_backfill_measurement_team_context_optimized';

-- Add index for efficient team-based measurement queries
CREATE INDEX IF NOT EXISTS "idx_measurements_team_context" ON "measurements" ("team_id", "season", "date");

-- Add index for season-based queries
CREATE INDEX IF NOT EXISTS "idx_measurements_season" ON "measurements" ("season", "date") WHERE "season" IS NOT NULL;

-- Clean up progress table (optional - keep for monitoring)
-- DROP TABLE IF EXISTS migration_progress;

DO $$ BEGIN
  RAISE NOTICE 'Optimized batched migration completed successfully. Check migration_progress and migration_audit_log tables for details.';
END $$;