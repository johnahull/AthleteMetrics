-- Migration: Add organization and team snapshot columns to measurements table
-- Purpose: Track organization context and team name at time of measurement for historical accuracy
-- Context: These are historical references WITHOUT foreign key constraints to preserve data integrity

BEGIN;

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
-- Wrapped in transaction to ensure atomic operation and prevent partial updates
--
-- PERFORMANCE NOTE: This single UPDATE is suitable for datasets < 10,000 measurements
-- For larger datasets (10k+ rows), consider batching this update to avoid long table locks
-- Example batched approach (if needed):
--   DO $$
--   DECLARE rows_updated INTEGER := 1;
--   BEGIN
--     WHILE rows_updated > 0 LOOP
--       UPDATE measurements m SET organization_id = t.organization_id, team_name_snapshot = t.name
--       FROM teams t WHERE m.ctid IN (
--         SELECT m2.ctid FROM measurements m2 WHERE m2.team_id = t.id AND m2.organization_id IS NULL LIMIT 1000
--       );
--       GET DIAGNOSTICS rows_updated = ROW_COUNT;
--       COMMIT;
--     END LOOP;
--   END $$;
UPDATE measurements m
SET organization_id = t.organization_id,
    team_name_snapshot = t.name
FROM teams t
WHERE m.team_id = t.id
  AND m.organization_id IS NULL;

COMMIT;

-- Note: Measurements without team_id will have NULL organization_id
-- This is acceptable as they represent measurements without team context
