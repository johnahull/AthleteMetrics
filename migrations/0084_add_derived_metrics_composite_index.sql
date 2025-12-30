-- Migration: Add composite index for derived metrics source measurement queries
-- Purpose: Optimize findSourceMeasurements queries in derived-metric-calculator.ts
-- Date: 2025-12-19
-- Context: PR #278 - Derived Metrics Support
--
-- DEPLOYMENT NOTE: This migration uses CREATE INDEX CONCURRENTLY which:
-- 1. Does NOT block writes (safe for production - no downtime)
-- 2. Requires autocommit mode (cannot run inside a transaction)
-- 3. May fail if connection drops during index build
-- 4. If your migration runner wraps migrations in transactions, run manually:
--    psql $DATABASE_URL -f migrations/0084_add_derived_metrics_composite_index.sql
-- 5. Verify success with: \d measurements (should show the new index)

-- This index optimizes the derived metrics calculation query pattern:
-- SELECT ... FROM measurements
-- WHERE user_id = ?
--   AND metric = ?
--   AND date = ?
--   AND is_verified = true
-- ORDER BY created_at DESC
-- LIMIT 1

-- The query appears in three date matching strategies:
-- 1. same_date: exact date match with all four columns
-- 2. latest_before: date <= target_date with all four columns
-- 3. closest: finds closest date with all four columns

-- Composite index for derived metrics source lookup
-- Column order optimized for query pattern (equality filters first, then range/sort)
-- Partial index on is_verified = true reduces index size (only verified measurements matter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_user_metric_verified_date
  ON measurements(user_id, metric, date DESC)
  WHERE is_verified = true;

-- Index comment for documentation
COMMENT ON INDEX idx_measurements_user_metric_verified_date IS
  'Composite index for derived metrics - optimizes source measurement lookups by user_id, metric code, and date with verification filter';
