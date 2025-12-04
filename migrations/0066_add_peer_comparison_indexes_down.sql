-- Rollback migration: Remove peer comparison performance indexes
-- Date: 2025-12-04

DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_metric_verified_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_peer_filters;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_sports_gin;
