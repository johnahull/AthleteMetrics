-- Rollback Migration: Remove Performance Indexes
-- WARNING: Removing these indexes will significantly degrade query performance
--          for team roster and user lookup operations (10-100x slower)

-- Remove comments
COMMENT ON INDEX idx_user_organizations_user_org IS NULL;
COMMENT ON INDEX idx_user_organizations_org_user IS NULL;
COMMENT ON INDEX idx_user_teams_user_team IS NULL;
COMMENT ON INDEX idx_user_teams_team_user IS NULL;

-- Drop indexes
DROP INDEX IF EXISTS idx_user_teams_team_user;
DROP INDEX IF EXISTS idx_user_teams_user_team;
DROP INDEX IF EXISTS idx_user_organizations_org_user;
DROP INDEX IF EXISTS idx_user_organizations_user_org;
