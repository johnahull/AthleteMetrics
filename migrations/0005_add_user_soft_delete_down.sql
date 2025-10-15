-- Rollback Migration: Remove soft delete from users table
-- WARNING: This will permanently delete any soft-deleted users if you proceed with hard delete after rollback

-- Remove index
DROP INDEX IF EXISTS idx_users_deleted_at;

-- Remove comments
COMMENT ON TABLE users IS NULL;
COMMENT ON COLUMN users.deleted_at IS NULL;

-- Remove deletedAt column
-- WARNING: If you want to actually delete soft-deleted users, do it BEFORE running this:
--   DELETE FROM users WHERE deleted_at IS NOT NULL;
ALTER TABLE users
DROP COLUMN IF EXISTS deleted_at;
