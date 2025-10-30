-- Rollback migration: Drop composite index for org-scoped per-metric analytics queries
-- Date: 2025-10-24

DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_org_date_metric_verified;
