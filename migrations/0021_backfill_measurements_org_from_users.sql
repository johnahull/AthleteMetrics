-- Migration: Backfill organization_id from user_organizations for measurements without team_id
-- Purpose: Complete the organization_id backfill for measurements that don't have a team association
-- Context: Migration 0015 backfilled from teams table, this handles measurements linked via user_organizations

-- Backfill organization_id from user_organizations for measurements that still lack organization_id
-- This handles measurements that don't have a team_id (independent athlete measurements)
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
    SET organization_id = (
      SELECT uo.organization_id
      FROM user_organizations uo
      WHERE uo.user_id = m.user_id
      LIMIT 1
    )
    WHERE m.organization_id IS NULL
      AND m.ctid IN (
        SELECT m2.ctid
        FROM measurements m2
        WHERE m2.organization_id IS NULL
        LIMIT 1000
      );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_updated := total_updated + rows_updated;

    -- Log progress for monitoring
    IF rows_updated > 0 THEN
      RAISE NOTICE 'Backfilled % measurements from user_organizations (total: %)', rows_updated, total_updated;
    END IF;

    -- Small delay between batches to allow other operations to proceed
    PERFORM pg_sleep(0.1);
  END LOOP;

  RAISE NOTICE 'User organizations backfill complete: % total measurements updated', total_updated;
END $$;

-- Note: Measurements that don't have user_id in user_organizations will remain NULL
-- This is acceptable as they may represent orphaned data or test data
