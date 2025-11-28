-- Rollback Migration: Remove user_organizations(user_id) index
-- Purpose: Rollback migration 0059 if needed

-- Drop the index
DROP INDEX IF EXISTS user_organizations_user_id_idx;

-- Verification: Check that index was removed successfully
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'user_organizations'
    AND indexname = 'user_organizations_user_id_idx'
  ) THEN
    RAISE EXCEPTION 'Index user_organizations_user_id_idx was not removed successfully';
  END IF;

  RAISE NOTICE 'Migration 0059 rollback: Index user_organizations_user_id_idx removed successfully';
END $$;
