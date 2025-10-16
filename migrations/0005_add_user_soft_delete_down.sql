-- Rollback Migration: Remove soft delete from users table
-- WARNING: This will permanently delete any soft-deleted users if you proceed with hard delete after rollback

-- SAFETY CHECK: Validate no soft-deleted users exist before dropping column
DO $$
DECLARE
  soft_deleted_count INTEGER;
BEGIN
  -- Count users with deletedAt timestamp
  SELECT COUNT(*) INTO soft_deleted_count
  FROM users
  WHERE deleted_at IS NOT NULL;

  -- Throw error if soft-deleted users exist
  IF soft_deleted_count > 0 THEN
    RAISE EXCEPTION 'Cannot rollback: % soft-deleted users exist. You must handle these users first. Options: 1) Hard delete them: DELETE FROM users WHERE deleted_at IS NOT NULL; 2) Restore them: UPDATE users SET deleted_at = NULL, is_active = true WHERE deleted_at IS NOT NULL;', soft_deleted_count;
  END IF;
END $$;

-- Remove index
DROP INDEX IF EXISTS idx_users_deleted_at;

-- Remove comments
COMMENT ON TABLE users IS NULL;
COMMENT ON COLUMN users.deleted_at IS NULL;

-- Remove deletedAt column (safe because we validated no soft-deleted users exist)
ALTER TABLE users
DROP COLUMN IF EXISTS deleted_at;
