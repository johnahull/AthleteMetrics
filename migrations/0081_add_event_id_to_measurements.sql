/**
 * Migration: Add Event Context to Measurements
 *
 * Adds event tracking fields to measurements table following the historical reference pattern.
 * This allows measurements to be linked to events while maintaining data integrity even if events are deleted.
 *
 * Changes:
 * - Add eventId column (nullable, historical reference, no FK)
 * - Add eventNameSnapshot column (nullable, immutable snapshot)
 * - Add eventDateSnapshot column (nullable, immutable snapshot)
 * - Add index on (eventId, date) for efficient event-based queries
 *
 * Design Pattern:
 * Follows the same pattern as teamId/teamNameSnapshot/organizationId:
 * - No foreign key constraints (historical reference)
 * - Nullable (not all measurements are from events)
 * - Immutable snapshots preserve context even if source event is modified/deleted
 */

-- Add event context columns to measurements table
ALTER TABLE measurements
  ADD COLUMN event_id VARCHAR,
  ADD COLUMN event_name_snapshot TEXT,
  ADD COLUMN event_date_snapshot DATE;

-- Add performance index for event-based measurement queries
CREATE INDEX measurements_event_idx ON measurements(event_id, date);

-- Add comment for documentation
COMMENT ON COLUMN measurements.event_id IS 'Event ID at time of measurement (historical reference, no FK)';
COMMENT ON COLUMN measurements.event_name_snapshot IS 'Event name at time of measurement (immutable snapshot)';
COMMENT ON COLUMN measurements.event_date_snapshot IS 'Event date at time of measurement (immutable snapshot)';
COMMENT ON INDEX measurements_event_idx IS 'Performance index for filtering measurements by event';
