-- Rollback: Remove composite index for derived metrics
-- Reverts migration 0084_add_derived_metrics_composite_index.sql

-- Drop the composite index
DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_user_metric_verified_date;
