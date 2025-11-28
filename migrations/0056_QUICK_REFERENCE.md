-- ============================================================================
-- Wellness Performance Index Test Queries (Migration 0056)
-- ============================================================================
-- Purpose: Verify that new indexes are being used by the query planner
-- Usage: Run these queries with EXPLAIN ANALYZE after applying migration 0056
-- Expected: All queries should use the new indexes (idx_wellness_responses_* or idx_wellness_templates_*)
-- ============================================================================

-- ============================================================================
-- TEST 1: Recent Responses Dashboard Query
-- ============================================================================
-- Expected index: idx_wellness_responses_recent OR idx_wellness_responses_org_date_submitted
-- Performance target: <50ms for 100k rows, <30ms with partial index

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM wellness_responses
WHERE organization_id = 'test-org-id'
  AND submitted_at > NOW() - INTERVAL '30 days'
ORDER BY submitted_at DESC
LIMIT 100;

-- Verification:
-- ✓ Index Scan using idx_wellness_responses_recent OR idx_wellness_responses_org_date_submitted
-- ✗ Seq Scan on wellness_responses (BAD - full table scan)

-- ============================================================================
-- TEST 2: Date Range Analytics Query (Most Common Pattern)
-- ============================================================================
-- Expected index: idx_wellness_responses_org_date_submitted
-- Performance target: <60ms for date range queries

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM wellness_responses
WHERE organization_id = 'test-org-id'
  AND date >= '2024-01-01'
  AND date <= '2024-01-31'
ORDER BY date DESC, submitted_at DESC;

-- Verification:
-- ✓ Index Scan using idx_wellness_responses_org_date_submitted
-- ✗ Seq Scan on wellness_responses (BAD - full table scan)

-- ============================================================================
-- TEST 3: Request Completion Lookup (Duplicate Check)
-- ============================================================================
-- Expected index: idx_wellness_responses_request_user
-- Performance target: <10ms for instant lookups

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT DISTINCT user_id
FROM wellness_responses
WHERE request_id = 'test-request-id';

-- Alternative query pattern (with user_id):
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM wellness_responses
WHERE request_id = 'test-request-id'
  AND user_id = 'test-user-id';

-- Verification:
-- ✓ Index Scan using idx_wellness_responses_request_user
-- ✗ Bitmap Heap Scan or Seq Scan (ACCEPTABLE - but slower)

-- ============================================================================
-- TEST 4: Team Analytics Query
-- ============================================================================
-- Expected index: idx_wellness_responses_team_date_submitted
-- Performance target: <40ms for team-specific queries

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM wellness_responses
WHERE team_id = 'test-team-id'
  AND date = '2024-01-15'
ORDER BY submitted_at DESC;

-- Verification:
-- ✓ Index Scan using idx_wellness_responses_team_date_submitted
-- ✗ Seq Scan on wellness_responses (BAD - full table scan)

-- ============================================================================
-- TEST 5: Athlete Response History (Pagination)
-- ============================================================================
-- Expected index: idx_wellness_responses_user_submitted
-- Performance target: <20ms for pagination queries

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM wellness_responses
WHERE user_id = 'test-user-id'
ORDER BY submitted_at DESC
LIMIT 20
OFFSET 0;

-- Verification:
-- ✓ Index Scan using idx_wellness_responses_user_submitted
-- ✗ Seq Scan on wellness_responses (BAD - full table scan)

-- ============================================================================
-- TEST 6: System Template Library Query
-- ============================================================================
-- Expected index: idx_wellness_templates_system_active
-- Performance target: <15ms for library browsing

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM wellness_templates
WHERE organization_id IS NULL
  AND is_active = true
  AND is_system_seeded = true
ORDER BY created_at DESC;

-- Verification:
-- ✓ Index Scan using idx_wellness_templates_system_active
-- ✗ Seq Scan on wellness_templates (ACCEPTABLE for small tables <1000 rows)

-- ============================================================================
-- TEST 7: Organization Template Management Query
-- ============================================================================
-- Expected index: idx_wellness_templates_org_active
-- Performance target: <20ms for org template queries

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM wellness_templates
WHERE organization_id = 'test-org-id'
  AND is_active = true
ORDER BY created_at DESC;

-- Verification:
-- ✓ Index Scan using idx_wellness_templates_org_active
-- ✗ Seq Scan on wellness_templates (ACCEPTABLE for small tables <1000 rows)

-- ============================================================================
-- ADDITIONAL VERIFICATION QUERIES
-- ============================================================================

-- Query A: Check index sizes (should be reasonable, not bloated)
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
  ROUND(100.0 * pg_relation_size(schemaname||'.'||indexname) /
        NULLIF(pg_total_relation_size(schemaname||'.'||tablename), 0), 2) as index_percentage
FROM pg_indexes
WHERE tablename IN ('wellness_responses', 'wellness_templates')
  AND indexname LIKE 'idx_wellness_%'
  AND schemaname = 'public'
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;

-- Expected:
-- - Partial indexes (idx_wellness_responses_recent) should be 70-80% smaller than full indexes
-- - Composite indexes should be <30% of table size
-- - Total index overhead should be <2x table size

-- Query B: Check partial index coverage (90-day window)
SELECT
  COUNT(*) FILTER (WHERE submitted_at > NOW() - INTERVAL '90 days') as recent_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE submitted_at > NOW() - INTERVAL '90 days') /
        NULLIF(COUNT(*), 0), 2) as recent_percentage
FROM wellness_responses;

-- Expected:
-- - recent_percentage should be 10-30% (depends on data distribution)
-- - If >50%, consider increasing partial index window to 180 days
-- - If <5%, partial index provides minimal benefit (can be removed)

-- Query C: Monitor index usage statistics (run after application load)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE
    WHEN idx_scan = 0 THEN 'UNUSED - Consider dropping'
    WHEN idx_scan < 10 THEN 'Low usage'
    WHEN idx_scan < 100 THEN 'Moderate usage'
    ELSE 'High usage'
  END as usage_level
FROM pg_stat_user_indexes
WHERE tablename IN ('wellness_responses', 'wellness_templates')
  AND indexname LIKE 'idx_wellness_%'
ORDER BY idx_scan DESC;

-- Expected:
-- - Dashboard indexes (org_date_submitted, recent) should have high usage
-- - Request completion index (request_user) should have moderate usage
-- - Unused indexes (idx_scan = 0) can be dropped if pattern persists after 1 week

-- Query D: Check for missing indexes (queries using Seq Scan)
-- Run this after application load to identify slow queries
SELECT
  query,
  calls,
  total_exec_time / calls as avg_time_ms,
  max_exec_time as max_time_ms
FROM pg_stat_statements
WHERE query LIKE '%wellness_responses%'
  AND calls > 10
ORDER BY total_exec_time DESC
LIMIT 20;

-- Note: Requires pg_stat_statements extension
-- Look for high avg_time_ms (>100ms) queries that might need additional indexes

-- ============================================================================
-- PERFORMANCE BENCHMARKING
-- ============================================================================

-- Before/After Comparison Template
-- Run these queries BEFORE and AFTER applying migration 0056

-- Benchmark 1: Dashboard query timing
\timing on
SELECT COUNT(*), AVG(EXTRACT(EPOCH FROM submitted_at))
FROM wellness_responses
WHERE organization_id = 'your-org-id'
  AND date >= CURRENT_DATE - INTERVAL '30 days'
  AND date <= CURRENT_DATE;
\timing off

-- Benchmark 2: Team analytics timing
\timing on
SELECT team_id, date, COUNT(*), AVG(jsonb_array_length(responses::jsonb))
FROM wellness_responses
WHERE team_id IN (SELECT id FROM teams WHERE organization_id = 'your-org-id' LIMIT 10)
  AND date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY team_id, date
ORDER BY date DESC;
\timing off

-- Benchmark 3: Athlete pagination timing
\timing on
SELECT *
FROM wellness_responses
WHERE user_id = 'your-user-id'
ORDER BY submitted_at DESC
LIMIT 20;
\timing off

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

-- Issue 1: Indexes not being used (still seeing Seq Scan)
-- Solution: Update table statistics
ANALYZE wellness_responses;
ANALYZE wellness_templates;

-- Issue 2: Query planner prefers Seq Scan over Index Scan
-- Solution: Increase random_page_cost (makes indexes more attractive)
-- SET random_page_cost = 1.1; -- Default is 4.0
-- Note: This is a session setting, may need to be added to postgresql.conf

-- Issue 3: Partial index not covering queries
-- Solution: Extend partial index window from 90 days to 180 days
-- DROP INDEX idx_wellness_responses_recent;
-- CREATE INDEX idx_wellness_responses_recent
--   ON wellness_responses(submitted_at DESC)
--   WHERE submitted_at > NOW() - INTERVAL '180 days';

-- Issue 4: High index maintenance overhead
-- Solution: Reindex to remove bloat
REINDEX INDEX CONCURRENTLY idx_wellness_responses_org_date_submitted;

-- ============================================================================
-- SUCCESS CRITERIA
-- ============================================================================
--
-- ✓ All test queries use new indexes (EXPLAIN ANALYZE shows Index Scan)
-- ✓ Query execution time reduced by 50-80% compared to before migration
-- ✓ Index sizes are reasonable (<30% of table size for composites)
-- ✓ Partial index covers 10-30% of rows (90-day window)
-- ✓ Index usage statistics show high usage after 1 week of application load
-- ✓ No unused indexes (idx_scan > 0 for all indexes after 1 week)
--
-- ============================================================================
