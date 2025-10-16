-- Migration: Add partial index for active users
-- Date: 2025-10-16
-- Purpose: Optimize queries that join users with soft delete filter
--
-- This partial index speeds up queries that filter users by ID with deletedAt IS NULL.
-- Common query patterns:
--   - Session validation (findUserById)
--   - Measurement submission lookups
--   - Athlete profile queries
--   - Organization user listings
--
-- The partial index only includes active users (deletedAt IS NULL), making it
-- smaller and more efficient than a full index on the id column.

CREATE INDEX IF NOT EXISTS idx_users_id_not_deleted
ON users(id)
WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_users_id_not_deleted IS
'Partial index for active users - optimizes queries filtering by ID with soft delete check';
