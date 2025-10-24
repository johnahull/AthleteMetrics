-- Migration: Add performance indexes to measurements table
-- Purpose: Optimize queries for organization-scoped access and analytics
-- Note: Uses CONCURRENTLY to avoid table locking in production

-- Index for organization-scoped queries (primary filter for multi-tenant access)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_organization_id
  ON measurements(organization_id);

-- Note: idx_measurements_team_id already exists from migration 0007 as a partial index
-- (WHERE team_id IS NOT NULL). We keep the partial index as it's more space-efficient.

-- Composite index for user metrics queries (analytics, personal bests)
-- Covers: WHERE user_id = ? AND metric = ? ORDER BY date DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_user_metric_date
  ON measurements(user_id, metric, date DESC);

-- Index for date range queries (dashboard 30-day window)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_date
  ON measurements(date DESC);
