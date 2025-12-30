-- Rollback Migration 0079: Remove events_enabled flag from organizations

-- Drop partial index first
DROP INDEX IF EXISTS organizations_events_enabled_idx;

-- Drop the column
ALTER TABLE organizations
DROP COLUMN IF EXISTS events_enabled;
