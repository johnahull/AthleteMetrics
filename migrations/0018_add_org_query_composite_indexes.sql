-- Migration: 0018_add_org_query_composite_indexes
-- Date: 2024-10-24
-- Description: Add composite indexes for organization-scoped user queries
--              Optimizes queries that join user_teams with teams on organization_id
--              These indexes improve performance for dashboard stats and analytics

-- Composite index for user_teams table to optimize team-user lookups
-- Supports queries: WHERE team_id = ? AND user_id = ?
-- Also optimizes: WHERE team_id = ? AND is_active = true
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_team_user
  ON user_teams(team_id, user_id)
  WHERE is_active = true;

COMMENT ON INDEX idx_user_teams_team_user IS
  'Composite index for active team membership lookups, optimizes user-team queries';

-- Composite index for teams table to optimize organization-scoped queries
-- Supports queries: WHERE organization_id = ? AND id = ?
-- Also optimizes: WHERE organization_id = ? AND is_archived = false
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_org_active
  ON teams(organization_id, id)
  WHERE is_archived = false;

COMMENT ON INDEX idx_teams_org_active IS
  'Composite index for organization-scoped team queries, optimizes filtering by org and active status';
