-- Migration: Add index on user_organizations(user_id)
-- Purpose: Optimize wellness middleware queries that look up user organization membership
-- Impact: Significantly improves performance of requireWellnessEnabled middleware
--         which runs on every wellness API request
-- Performance: O(log n) index scan instead of O(n) sequential scan

-- Add index on user_id for efficient lookup of user's organizations
-- This index is critical for wellness feature flag checks
CREATE INDEX IF NOT EXISTS user_organizations_user_id_idx
ON user_organizations(user_id);

-- Verification: Check that index was created successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'user_organizations'
    AND indexname = 'user_organizations_user_id_idx'
  ) THEN
    RAISE EXCEPTION 'Index user_organizations_user_id_idx was not created successfully';
  END IF;

  RAISE NOTICE 'Migration 0059: Index user_organizations_user_id_idx created successfully';
END $$;
