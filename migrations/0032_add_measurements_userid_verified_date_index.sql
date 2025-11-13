-- Migration: Add composite index for user-based verified measurements trend queries
-- Purpose: Optimize dashboard trends queries that filter measurements by user_id, is_verified, and date
-- Date: 2025-11-13
-- Context: PR #221 - UX Quick Wins implementation includes dashboard trends feature

-- This index optimizes the dashboard trends query pattern:
-- SELECT ... FROM measurements
-- WHERE user_id IN (...)
--   AND date >= ? AND date < ?
--   AND is_verified = true
-- GROUP BY period

-- Composite index for user-based verified measurements with date ordering
-- This complements the existing idx_measurements_org_date_verified (organization-scoped)
-- by providing an optimized path for user-scoped trend queries

-- Note: DROP INDEX IF EXISTS is safe with CONCURRENTLY, then CREATE without IF NOT EXISTS
-- This pattern works around PostgreSQL limitations with CONCURRENTLY + IF NOT EXISTS in some versions
DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_userid_verified_date;

CREATE INDEX CONCURRENTLY idx_measurements_userid_verified_date
  ON measurements(user_id, is_verified, date DESC)
  WHERE is_verified = true;

-- Index comment for documentation (separate statement)
COMMENT ON INDEX idx_measurements_userid_verified_date IS
  'Composite index for user-based trends - optimizes dashboard trends queries filtering by user_id array, verification, and date range';
