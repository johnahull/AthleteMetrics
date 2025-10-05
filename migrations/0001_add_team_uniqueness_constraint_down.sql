-- Migration Rollback: Remove unique constraint on teams(organization_id, name)
-- Purpose: Rollback migration 0001_add_team_uniqueness_constraint.sql
-- Date: 2025-01-04
-- Related PR: Import system enhancements

-- Remove unique constraint from teams table
-- WARNING: This allows duplicate team names within the same organization
-- Only run this rollback if the migration caused issues in production
DROP INDEX IF EXISTS teams_org_name_unique;

-- Note: After running this rollback, concurrent imports may create duplicate teams
-- The application code should handle deduplication logic if this constraint is removed
