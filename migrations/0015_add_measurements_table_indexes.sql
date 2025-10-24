-- Migration: Add performance indexes to measurements table
-- Purpose: Optimize queries for organization-scoped access, team filtering, and analytics

-- Index for organization-scoped queries (primary filter for multi-tenant access)
CREATE INDEX IF NOT EXISTS idx_measurements_organization_id
  ON measurements(organization_id);

-- Index for team-based queries (common in analytics and reporting)
CREATE INDEX IF NOT EXISTS idx_measurements_team_id
  ON measurements(team_id);

-- Composite index for user metrics queries (analytics, personal bests)
-- Covers: WHERE user_id = ? AND metric = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_measurements_user_metric_date
  ON measurements(user_id, metric, date DESC);

-- Index for date range queries (dashboard 30-day window)
CREATE INDEX IF NOT EXISTS idx_measurements_date
  ON measurements(date DESC);
