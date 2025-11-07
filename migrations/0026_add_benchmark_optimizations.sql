/**
 * Migration 0026: Benchmark Performance Optimizations
 *
 * This migration adds performance optimizations for the benchmarks feature:
 * 1. Optimized polymorphic lookup index for organization_benchmarks
 * 2. Remove redundant index on organization_benchmarks
 *
 * Note: custom_benchmarks_filters_idx was already added in migration 0024
 *
 * Safety: Idempotent, uses IF EXISTS/IF NOT EXISTS
 * Rollback: See rollback section at bottom
 */

-- ===========================================================================
-- OPTIMIZATION 1: Polymorphic Lookup Index
-- ===========================================================================
--
-- Query pattern: JOIN organization_benchmarks filtered by benchmark_type
-- Current issue: Index column order (benchmark_id, benchmark_type) doesn't match
-- WHERE clause order (benchmark_type first, then JOIN on benchmark_id)
--
-- Example query from storage.ts:3549:
-- SELECT ... FROM organization_benchmarks ob
-- INNER JOIN site_benchmarks sb ON ob.benchmark_id = sb.id
-- WHERE ob.benchmark_type = 'site' AND ob.organization_id = $1
--
-- This index allows the database to:
-- 1. First filter by benchmark_type (selective filter)
-- 2. Then JOIN on benchmark_id (with INCLUDE columns avoiding table lookups)

CREATE INDEX IF NOT EXISTS org_benchmarks_type_id_idx
ON organization_benchmarks(benchmark_type, benchmark_id)
INCLUDE (organization_id, is_enabled, custom_name);

-- ===========================================================================
-- OPTIMIZATION 2: Remove Redundant Index
-- ===========================================================================
--
-- Index org_benchmarks_org_idx on (organization_id) is redundant because:
-- - org_benchmarks_org_enabled_idx on (organization_id, is_enabled) covers it
-- - PostgreSQL leftmost prefix rule: multi-column index can serve single-column queries
--
-- Removing saves disk space and reduces write overhead (one less index to maintain)

DROP INDEX IF EXISTS org_benchmarks_org_idx;

-- ===========================================================================
-- VERIFICATION QUERIES (for DBA review)
-- ===========================================================================
--
-- Verify new indexes exist:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename IN ('organization_benchmarks', 'custom_benchmarks')
-- ORDER BY tablename, indexname;
--
-- Check index sizes:
-- SELECT
--   schemaname, tablename, indexname,
--   pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
-- FROM pg_indexes
-- WHERE tablename IN ('organization_benchmarks', 'custom_benchmarks');

-- ===========================================================================
-- ROLLBACK (if needed)
-- ===========================================================================
--
-- DROP INDEX IF EXISTS org_benchmarks_type_id_idx;
-- CREATE INDEX IF NOT EXISTS org_benchmarks_org_idx ON organization_benchmarks(organization_id);
