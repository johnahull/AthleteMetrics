/**
 * Migration 0027: Add missing index for disableBenchmarkForOrg query
 *
 * This migration adds a composite index to support the WHERE clause pattern
 * used in disableBenchmarkForOrg() and updateOrganizationBenchmarkSettings().
 *
 * Query pattern (from storage.ts:3652-3656):
 * UPDATE organization_benchmarks
 * SET is_enabled = false, updated_at = NOW()
 * WHERE organization_id = $1 AND benchmark_id = $2
 *
 * Without this index, the query performs a full table scan. With the index,
 * it can efficiently locate the specific organization + benchmark combination.
 *
 * Safety: Idempotent, uses IF NOT EXISTS
 * Rollback: See rollback section at bottom
 */

-- ===========================================================================
-- Add composite index for organization_id + benchmark_id lookups
-- ===========================================================================

CREATE INDEX IF NOT EXISTS org_benchmarks_org_benchmark_idx
ON organization_benchmarks(organization_id, benchmark_id);

-- ===========================================================================
-- Verification Query (for DBA review)
-- ===========================================================================
--
-- Verify index exists:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'organization_benchmarks'
-- ORDER BY indexname;
--
-- Check index usage after deployment:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'organization_benchmarks';

-- ===========================================================================
-- ROLLBACK (if needed)
-- ===========================================================================
--
-- DROP INDEX IF EXISTS org_benchmarks_org_benchmark_idx;
