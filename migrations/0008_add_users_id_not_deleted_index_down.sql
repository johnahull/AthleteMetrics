-- Rollback: Remove partial index for active users
-- Date: 2025-10-16
-- Purpose: Remove the idx_users_id_not_deleted partial index

DROP INDEX IF EXISTS idx_users_id_not_deleted;
