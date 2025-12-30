-- Migration: Add composite index for events(organization_id, start_date DESC)
-- Purpose: Optimize "upcoming events for organization" query pattern
--
-- This index optimizes queries like:
--   SELECT * FROM events WHERE organization_id = 'x' ORDER BY start_date DESC
--
-- The existing events_org_idx covers organization_id lookups, but this composite
-- index with start_date DESC enables index-only scans for paginated event lists.

-- Create composite index for organization + start date queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_org_start_date_idx
  ON events(organization_id, start_date DESC);

-- Comment explaining the index purpose
COMMENT ON INDEX events_org_start_date_idx IS
  'Composite index for efficient "upcoming events for organization" queries with date ordering';
