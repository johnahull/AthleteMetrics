-- Migration 0028: Add Missing Index on organization_benchmarks.is_enabled
--
-- PURPOSE: Optimize queries that filter enabled benchmarks across all organizations
-- IMPACT: Improves performance of getOrganizationBenchmarksWithDetails and similar queries
--
-- CREATED: 2025-11-03
-- REASON: Code review identified missing index for is_enabled filtering

-- ============================================================================
-- Add index on is_enabled column for efficient filtering
-- ============================================================================

-- This index optimizes queries that filter by is_enabled across organizations
-- without requiring a specific organization_id in the WHERE clause
CREATE INDEX IF NOT EXISTS org_benchmarks_enabled_idx
  ON organization_benchmarks(is_enabled)
  WHERE is_enabled = true;

-- Note: This is a partial index that only indexes enabled benchmarks
-- since most queries filter for enabled benchmarks only

-- Add comment for documentation
COMMENT ON INDEX org_benchmarks_enabled_idx IS 'Partial index for filtering enabled benchmarks across organizations';

-- ============================================================================
-- Rollback Instructions (if needed)
-- ============================================================================
-- DROP INDEX IF EXISTS org_benchmarks_enabled_idx;
