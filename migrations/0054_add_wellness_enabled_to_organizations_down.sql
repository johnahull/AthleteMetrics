-- Migration 0054 Rollback: Remove wellness_enabled column from organizations table

DO $$
BEGIN
  -- Drop index if it exists
  DROP INDEX IF EXISTS organizations_wellness_enabled_idx;

  -- Drop column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'wellness_enabled'
  ) THEN
    ALTER TABLE organizations
    DROP COLUMN wellness_enabled;
  END IF;
END $$;
