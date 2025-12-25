/**
 * Rollback Migration: Remove Event Context from Measurements
 *
 * Removes event tracking fields from measurements table.
 */

-- Drop index
DROP INDEX IF EXISTS measurements_event_idx;

-- Drop columns
ALTER TABLE measurements
  DROP COLUMN IF EXISTS event_id,
  DROP COLUMN IF EXISTS event_name_snapshot,
  DROP COLUMN IF EXISTS event_date_snapshot;
