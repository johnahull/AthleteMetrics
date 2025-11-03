/**
 * Migration 0026: Benchmark Performance Optimizations
 *
 * This migration adds performance optimizations for the benchmarks feature:
 * 1. Optimized polymorphic lookup index for organization_benchmarks
 * 2. Composite filter index for custom_benchmarks (matching site_benchmarks pattern)
 * 3. Remove redundant index on organization_benchmarks
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
-- OPTIMIZATION 2: Custom Benchmarks Filter Index
-- ===========================================================================
--
-- Custom benchmarks lack the composite INCLUDE index that site_benchmarks have.
-- This causes slower filtering queries when evaluating athlete benchmarks.
--
-- Query pattern: Filter by organization + metric + athlete attributes (gender, level, age)
-- This index matches the pattern already used in site_benchmarks (line 60-63 of 0024 migration)

CREATE INDEX IF NOT EXISTS custom_benchmarks_filters_idx
ON custom_benchmarks(organization_id, metric_code, gender, level)
INCLUDE (age_min, age_max, position, is_active);

-- ===========================================================================
-- OPTIMIZATION 3: Remove Redundant Index
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
-- DROP INDEX IF EXISTS custom_benchmarks_filters_idx;
-- CREATE INDEX IF NOT EXISTS org_benchmarks_org_idx ON organization_benchmarks(organization_id);
