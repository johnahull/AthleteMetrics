-- Migration 0028 Rollback: Remove Index on organization_benchmarks.is_enabled
--
-- PURPOSE: Rollback index creation from migration 0028
-- IMPACT: Removes performance optimization for is_enabled filtering
--
-- CREATED: 2025-11-04

-- ============================================================================
-- Drop index on is_enabled column
-- ============================================================================

DROP INDEX IF EXISTS org_benchmarks_enabled_idx;

-- ============================================================================
-- Verification (optional)
-- ============================================================================
-- SELECT indexname FROM pg_indexes WHERE indexname = 'org_benchmarks_enabled_idx';
-- Should return no rows
