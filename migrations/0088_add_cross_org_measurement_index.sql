-- Migration: Add composite index for cross-organization measurement queries
-- Purpose: Optimize filterMode='all' queries with multiple organization IDs
-- Date: 2025-12-25
-- Context: PR #286 - Athlete Organization Switcher
--
-- DEPLOYMENT NOTE: This migration uses CREATE INDEX CONCURRENTLY which:
-- 1. Does NOT block writes (safe for production - no downtime)
-- 2. Requires autocommit mode (cannot run inside a transaction)
-- 3. May fail if connection drops during index build
-- 4. If your migration runner wraps migrations in transactions, run manually:
--    psql $DATABASE_URL -f migrations/0088_add_cross_org_measurement_index.sql
-- 5. Verify success with: \d measurements (should show the new index)

-- This index optimizes the cross-org query pattern introduced in PR #286:
-- SELECT ... FROM measurements
-- WHERE (organization_id IN (?, ?, ...) OR organization_id IS NULL)
--   AND user_id = ?
--   AND date >= ?
--   AND date <= ?
--   AND is_verified = true
-- ORDER BY date DESC

-- Query appears in measurement-service.ts filterMode='all' logic (lines 941-958)
-- When athletes switch to "All Organizations" view, this enables efficient
-- queries across their multiple organization memberships plus personal measurements.

-- Composite index for cross-org measurement queries
-- Column order optimized for query selectivity:
-- 1. user_id - Most selective filter (narrows to single user) - PRIMARY
-- 2. organization_id - Secondary filter (user's orgs) - SECONDARY
-- 3. date DESC - Sort column for ORDER BY - TERTIARY
--
-- Rationale for column ordering:
-- - user_id is more selective than organization_id (1 user vs many orgs)
-- - Filtering by user_id first reduces the dataset significantly
-- - Then filtering by organization_id within that user's measurements
-- - Finally sorting by date DESC
--
-- Partial index with WHERE is_verified = true for even better performance:
-- - Most measurements are verified (high cardinality)
-- - Filtering unverified measurements in index reduces index size by ~10-20%
-- - Queries with includeUnverified=false (default) use this partial index
-- - Queries with includeUnverified=true fall back to full scan (rare case)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_cross_org_user_date
  ON measurements(user_id, organization_id, date DESC)
  WHERE is_verified = true;

-- Index comment for documentation
COMMENT ON INDEX idx_measurements_cross_org_user_date IS
  'Composite index for cross-org queries - optimizes filterMode=all with user_id, organization_id, date DESC. Partial index (WHERE is_verified=true) for better performance.';
