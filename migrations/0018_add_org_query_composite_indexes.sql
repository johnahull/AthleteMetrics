-- Migration: 0018_add_org_query_composite_indexes
-- Date: 2024-10-24
-- Description: Add composite indexes for organization-scoped user queries
--              Optimizes queries that join user_teams with teams on organization_id
--              These indexes improve performance for dashboard stats and analytics

-- Partial composite index for ACTIVE user_teams lookups
-- Note: idx_user_teams_team_user (full index from migration 0008) already exists
-- This partial index is more efficient for is_active = true queries (most common pattern)
-- Using different name to avoid conflict with full index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_team_user_active
  ON user_teams(team_id, user_id)
  WHERE is_active = true;

COMMENT ON INDEX idx_user_teams_team_user_active IS
  'Partial composite index for active team membership lookups (more efficient than full index for common queries)';

-- Composite index for teams table to optimize organization-scoped queries
-- Supports queries: WHERE organization_id = ? AND id = ?
-- Also optimizes: WHERE organization_id = ? AND is_archived = false
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_org_active
  ON teams(organization_id, id)
  WHERE is_archived = false;

COMMENT ON INDEX idx_teams_org_active IS
  'Composite index for organization-scoped team queries, optimizes filtering by org and active status';
