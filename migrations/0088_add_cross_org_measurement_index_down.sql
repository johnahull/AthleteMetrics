-- Rollback migration for 0088_add_cross_org_measurement_index.sql
-- Removes the composite index for cross-organization measurement queries

DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_cross_org_user_date;
