-- Migration: Fix link_type CHECK constraint to include 'auto_import'
-- Description: Adds 'auto_import' to link_type enum which was missing in original migration
-- This is a corrective migration for deployments that already ran 0060

-- Drop and recreate the CHECK constraint with the missing 'auto_import' type
-- Using DO block for idempotency (safe to re-run)
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_global_athlete_links_link_type_check'
  ) THEN
    ALTER TABLE user_global_athlete_links
    DROP CONSTRAINT user_global_athlete_links_link_type_check;
  END IF;

  -- Add updated constraint with 'auto_import' included
  ALTER TABLE user_global_athlete_links
  ADD CONSTRAINT user_global_athlete_links_link_type_check
  CHECK (link_type IN ('auto_email', 'auto_import', 'athlete_claimed', 'org_proposed', 'admin_forced'));
END $$;

COMMENT ON CONSTRAINT user_global_athlete_links_link_type_check ON user_global_athlete_links
IS 'Valid link types: auto_email (email verification), auto_import (CSV/bulk import), athlete_claimed (manual claim), org_proposed (org admin proposed), admin_forced (site admin forced)';
