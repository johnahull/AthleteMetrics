-- Rollback: Remove composite index for active users
-- Date: 2025-10-16
-- Purpose: Remove the idx_users_id_active_not_deleted partial composite index

DROP INDEX CONCURRENTLY IF EXISTS idx_users_id_active_not_deleted;
