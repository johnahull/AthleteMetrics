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

-- Note: PostgreSQL 9.5+ supports CREATE INDEX CONCURRENTLY IF NOT EXISTS
-- This ensures idempotent migration that is safe to re-run
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_userid_verified_date
  ON measurements(user_id, is_verified, date DESC)
  WHERE is_verified = true;

-- Index comment for documentation (separate statement)
COMMENT ON INDEX idx_measurements_userid_verified_date IS
  'Composite index for user-based trends - optimizes dashboard trends queries filtering by user_id array, verification, and date range';
