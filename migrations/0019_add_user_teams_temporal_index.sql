-- Migration: Add temporal index for user_teams date range queries
-- Date: 2024-10-24
-- Purpose: Optimize getAthleteActiveTeamsAtDate() queries that filter on joinedAt and leftAt

-- This index supports queries like:
-- WHERE user_id = ? AND joined_at <= ? AND (left_at IS NULL OR left_at >= ?) AND is_active = true
--
-- The partial index (WHERE is_active = true) reduces index size by ~50% since most queries
-- filter for active memberships only.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_temporal
  ON user_teams(user_id, joined_at, left_at)
  WHERE is_active = true;

COMMENT ON INDEX idx_user_teams_temporal IS
  'Optimizes temporal queries for active team memberships - used by MeasurementService.getAthleteActiveTeamsAtDate()';
