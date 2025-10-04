-- Migration: Add unique constraint on teams(organization_id, name)
-- Purpose: Prevent duplicate team names within the same organization
-- Date: 2025-01-04
-- Related PR: Import system enhancements

-- Add unique constraint on teams table
-- This prevents race conditions when creating teams during CSV imports
CREATE UNIQUE INDEX IF NOT EXISTS teams_org_name_unique
ON teams(organization_id, name);

-- Add performance index for common queries
-- This index is already created by the unique constraint above,
-- but we document it explicitly for clarity
COMMENT ON INDEX teams_org_name_unique IS
'Ensures team names are unique within each organization. Prevents duplicate team creation during concurrent imports.';

-- Note: This migration should be run BEFORE deploying the import system changes
-- If there are existing duplicate teams, this migration will fail.
-- Run the following query to check for duplicates before running this migration:
--
-- SELECT organization_id, name, COUNT(*)
-- FROM teams
-- GROUP BY organization_id, name
-- HAVING COUNT(*) > 1;
--
-- If duplicates exist, they must be manually resolved first.
