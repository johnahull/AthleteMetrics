-- Migration: Add composite index for active users with is_active check
-- Date: 2025-10-16
-- Purpose: Optimize queries that filter users by both ID and is_active status
--
-- This partial composite index speeds up queries that check both user ID and is_active status.
-- Common query patterns:
--   - Authentication checks (user ID + active status)
--   - User profile queries with active status validation
--   - Organization user listings filtered by active status
--
-- The partial index only includes active, non-deleted users (is_active = true AND deleted_at IS NULL),
-- making it smaller and more efficient for the most common query pattern.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_id_active_not_deleted
ON users(id, is_active)
WHERE deleted_at IS NULL AND is_active = true;

-- Add comment for documentation
COMMENT ON INDEX idx_users_id_active_not_deleted IS
'Partial composite index for active users - optimizes queries filtering by ID and is_active with soft delete check';
