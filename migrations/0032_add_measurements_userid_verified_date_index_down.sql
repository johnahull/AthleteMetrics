-- Rollback: Remove composite index for user-based verified measurements trend queries
-- Date: 2025-11-13

DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_userid_verified_date;
