-- Rollback migration: Remove performance indexes for custom org metrics
-- Reverses: 0094_add_performance_indexes.sql

-- Drop composite index for measurement validation
DROP INDEX IF EXISTS idx_measurements_metric_org;

-- Drop unique index for label-based duplicate prevention
DROP INDEX IF EXISTS idx_custom_org_metrics_org_label_unique;
