-- Migration: Add composite indexes for org-scoped analytics queries
-- Purpose: Optimize dashboard statistics queries that filter on organization + date + verified status
-- Date: 2025-10-24

-- Composite index for org-scoped verified measurement queries
-- Optimizes queries that filter measurements by organization, verification status, and date
-- Used heavily in getDashboardStats() for 30-day rolling window analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_org_date_verified
  ON measurements(organization_id, date DESC, is_verified)
  WHERE is_verified = true AND organization_id IS NOT NULL;

-- Composite index for team-based analytics with verification
-- Optimizes team statistics queries that need verified measurements ordered by date
-- Used in getTeamStats() and team performance analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_team_verified_date
  ON measurements(team_id, is_verified, date DESC)
  WHERE team_id IS NOT NULL AND is_verified = true;

-- Index comments for documentation
COMMENT ON INDEX idx_measurements_org_date_verified IS
  'Composite index for org-scoped analytics - optimizes dashboard 30-day window queries';

COMMENT ON INDEX idx_measurements_team_verified_date IS
  'Composite index for team analytics - optimizes team performance queries with verification filter';
