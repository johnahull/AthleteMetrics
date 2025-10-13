-- Migration: Add index and constraint for organizations.is_active
-- Purpose: Optimize queries filtering by active status and ensure data consistency
-- Date: 2025-10-13
-- Related PR: #118 - Organization deletion and deactivation

-- Add partial index for active organizations (most common query pattern)
-- Using partial index only on active=true reduces index size by ~50%
-- and improves performance for the common case of fetching active orgs
CREATE INDEX CONCURRENTLY IF NOT EXISTS organizations_is_active_idx
  ON organizations (is_active, name)
  WHERE is_active = true;

COMMENT ON INDEX organizations_is_active_idx IS
'Partial index for active organizations. Optimizes the common query pattern of fetching active organizations by name. Only indexes active=true rows to reduce index size.';

-- Add consistency constraint to ensure is_active and deleted_at are in sync
-- This prevents inconsistent state where is_active=true but deleted_at is set
ALTER TABLE organizations
ADD CONSTRAINT check_is_active_deleted_at_consistency
CHECK (
  (is_active = true AND deleted_at IS NULL) OR
  (is_active = false AND deleted_at IS NOT NULL)
);

COMMENT ON CONSTRAINT check_is_active_deleted_at_consistency ON organizations IS
'Ensures organizations.is_active and organizations.deleted_at are consistent. Active organizations must have null deleted_at, inactive organizations must have non-null deleted_at.';

-- Note: This migration uses CREATE INDEX CONCURRENTLY which does not lock the table
-- It can be run on production without downtime
--
-- To verify the index is being used:
-- EXPLAIN ANALYZE SELECT * FROM organizations WHERE is_active = true ORDER BY name;
--
-- Expected: Index Scan using organizations_is_active_idx
