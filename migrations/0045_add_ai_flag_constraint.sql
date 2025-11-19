-- Migration 0045: Add CHECK constraint for AI flag hierarchy
-- Purpose: Ensure aiEnabled can only be true if aiEnabledBySiteAdmin is true
-- Author: Claude Code
-- Date: 2025-11-18

-- Add constraint to enforce AI flag hierarchy (idempotent)
DO $$
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_ai_flag_hierarchy'
  ) THEN
    -- First, fix any existing data that violates the constraint
    UPDATE organizations
    SET ai_enabled = FALSE
    WHERE ai_enabled = TRUE AND ai_enabled_by_site_admin = FALSE;

    -- Add the constraint
    ALTER TABLE organizations ADD CONSTRAINT organizations_ai_flag_hierarchy
      CHECK (ai_enabled = FALSE OR ai_enabled_by_site_admin = TRUE);
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON CONSTRAINT organizations_ai_flag_hierarchy ON organizations IS
  'Ensures AI cannot be enabled at org level unless site admin has enabled it for the org';
