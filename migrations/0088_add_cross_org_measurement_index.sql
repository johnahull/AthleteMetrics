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
-- Column order optimized for query pattern:
-- 1. organization_id - Primary filter (equality or IN clause)
-- 2. user_id - Secondary filter (equality)
-- 3. date DESC - Sort column for ORDER BY
--
-- Note: We do NOT include is_verified in the index because:
-- - Most measurements are verified (high selectivity)
-- - Including it would increase index size significantly
-- - PostgreSQL can apply the is_verified filter after index lookup efficiently
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_cross_org_user_date
  ON measurements(organization_id, user_id, date DESC);

-- Index comment for documentation
COMMENT ON INDEX idx_measurements_cross_org_user_date IS
  'Composite index for cross-org queries - optimizes filterMode=all with multiple orgIds by organization_id, user_id, and date';
