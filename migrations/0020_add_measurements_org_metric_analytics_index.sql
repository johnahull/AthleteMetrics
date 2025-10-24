-- Migration: Add composite index for org-scoped per-metric analytics queries
-- Date: 2025-10-24
-- Purpose: Optimize getDashboardStats() queries that filter on organization + date + metric + verified status
--          The existing idx_measurements_org_date_verified covers org + date + verified,
--          but queries in getDashboardStats() also filter by specific metrics (FLY10_TIME, VERTICAL_JUMP, etc.)
--          Adding metric to the index significantly improves query performance for metric-specific aggregations

-- This index supports queries like:
-- SELECT MIN/MAX(value), user.full_name
-- FROM measurements
-- WHERE organization_id = ? AND date >= ? AND date <= ? AND metric = ? AND is_verified = true
-- GROUP BY user.id ORDER BY MIN/MAX(value) LIMIT 1

-- Composite index for per-metric analytics with organization scoping
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_org_date_metric_verified
  ON measurements(organization_id, date DESC, metric, is_verified)
  WHERE is_verified = true AND organization_id IS NOT NULL;

-- Add helpful comment for documentation
COMMENT ON INDEX idx_measurements_org_date_metric_verified IS
  'Composite index for per-metric analytics queries - optimizes dashboard best performance lookups by specific metric type (e.g., FLY10_TIME, VERTICAL_JUMP)';
