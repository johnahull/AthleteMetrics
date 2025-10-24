-- Migration: Add organization and team snapshot columns to measurements table
-- Purpose: Track organization context and team name at time of measurement for historical accuracy
-- Context: These are historical references WITHOUT foreign key constraints to preserve data integrity

-- Add organization_id column (historical reference to organization at time of measurement)
ALTER TABLE measurements
ADD COLUMN IF NOT EXISTS organization_id VARCHAR;

-- Add team_name_snapshot column (immutable team name at time of measurement)
ALTER TABLE measurements
ADD COLUMN IF NOT EXISTS team_name_snapshot TEXT;

-- Add column comments for documentation
COMMENT ON COLUMN measurements.organization_id IS
  'Organization ID at time of measurement (historical reference, no FK constraint)';

COMMENT ON COLUMN measurements.team_name_snapshot IS
  'Team name at time of measurement (immutable snapshot for historical accuracy)';

-- Backfill organization_id from team relationships for existing measurements
-- This ensures historical data maintains organization context
--
-- BATCHED APPROACH: Updates in chunks of 1000 rows to avoid long table locks
-- This is production-safe for datasets of any size and prevents blocking other operations
DO $$
DECLARE
  rows_updated INTEGER := 1;
  total_updated INTEGER := 0;
BEGIN
  WHILE rows_updated > 0 LOOP
    UPDATE measurements m
    SET organization_id = t.organization_id,
        team_name_snapshot = t.name
    FROM teams t
    WHERE m.ctid IN (
      SELECT m2.ctid
      FROM measurements m2
      WHERE m2.team_id = t.id
        AND m2.organization_id IS NULL
      LIMIT 1000
    );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_updated := total_updated + rows_updated;

    -- Log progress for monitoring
    IF rows_updated > 0 THEN
      RAISE NOTICE 'Backfilled % measurements (total: %)', rows_updated, total_updated;
    END IF;

    -- Small delay between batches to allow other operations to proceed
    PERFORM pg_sleep(0.1);
  END LOOP;

  RAISE NOTICE 'Backfill complete: % total measurements updated', total_updated;
END $$;

-- Note: Measurements without team_id will have NULL organization_id
-- This is acceptable as they represent measurements without team context
