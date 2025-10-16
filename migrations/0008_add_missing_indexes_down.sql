-- Rollback Migration: Remove Performance Indexes
-- WARNING: Removing these indexes will significantly degrade query performance
--          for team roster and user lookup operations (10-100x slower)
-- Using CONCURRENTLY to avoid table locks during rollback

-- Remove comments
COMMENT ON INDEX idx_user_organizations_user_org IS NULL;
COMMENT ON INDEX idx_user_organizations_org_user IS NULL;
COMMENT ON INDEX idx_user_teams_user_team IS NULL;
COMMENT ON INDEX idx_user_teams_team_user IS NULL;

-- Drop indexes with CONCURRENTLY
DROP INDEX CONCURRENTLY IF EXISTS idx_user_teams_team_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_teams_user_team;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_organizations_org_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_organizations_user_org;
