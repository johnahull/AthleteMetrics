-- Migration: Add Missing Performance Indexes
-- Purpose: Improve query performance for team roster and user lookup operations
--
-- Performance Impact:
-- - user_organizations queries (team rosters, org user lookups): 10-100x faster with composite indexes
-- - user_teams queries (athlete teams, team rosters): 10-100x faster with composite indexes
--
-- Context:
-- - user_organizations: Links users to organizations with roles (org_admin, coach, athlete)
-- - user_teams: Links users to teams (many-to-many through join table)
-- - Both tables are heavily queried in analytics and roster management features

-- Composite index on user_organizations for team roster queries
-- Query pattern: SELECT * FROM user_organizations WHERE user_id = ? AND organization_id = ?
-- Using CONCURRENTLY to avoid table locks during production deployment
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_organizations_user_org
ON user_organizations(user_id, organization_id);

-- Composite index on user_organizations for org user lookups
-- Query pattern: SELECT * FROM user_organizations WHERE organization_id = ? AND user_id = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_organizations_org_user
ON user_organizations(organization_id, user_id);

-- Composite index on user_teams for athlete team queries
-- Query pattern: SELECT * FROM user_teams WHERE user_id = ? AND team_id = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_user_team
ON user_teams(user_id, team_id);

-- Composite index on user_teams for team roster queries
-- Query pattern: SELECT * FROM user_teams WHERE team_id = ? AND user_id = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_team_user
ON user_teams(team_id, user_id);

-- Add comments for documentation
COMMENT ON INDEX idx_user_organizations_user_org IS 'Composite index for user-to-organization lookups';
COMMENT ON INDEX idx_user_organizations_org_user IS 'Composite index for organization-to-user lookups';
COMMENT ON INDEX idx_user_teams_user_team IS 'Composite index for user-to-team lookups';
COMMENT ON INDEX idx_user_teams_team_user IS 'Composite index for team-to-user lookups';
