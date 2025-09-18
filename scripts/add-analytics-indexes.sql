-- Analytics Performance Indexes
-- These indexes dramatically improve analytics query performance

-- Critical compound index for measurements table - most important for analytics
-- Covers the most common query patterns: organization filtering + verification + metric + date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_analytics_main
ON measurements (metric, date, is_verified, user_id);

-- Secondary index for team-based analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_team_analytics
ON measurements (team_id, metric, date, is_verified)
WHERE team_id IS NOT NULL;

-- Index for user-based queries (individual athlete analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_user_metric_date
ON measurements (user_id, metric, date DESC)
WHERE is_verified = 'true';

-- Index for date range queries (optimizes time period filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_date_metric
ON measurements (date DESC, metric)
WHERE is_verified = 'true';

-- User organizations index for access control queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_organizations_lookup
ON user_organizations (user_id, organization_id, role);

-- Reverse lookup for organization users
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_organizations_org_lookup
ON user_organizations (organization_id, role, user_id);

-- User teams temporal index for active team membership queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_temporal
ON user_teams (user_id, team_id, joined_at, left_at, is_active)
WHERE is_active = 'true';

-- Teams organizational lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_organization
ON teams (organization_id, is_archived)
WHERE is_archived = 'false';

-- Users full name search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_search
ON users USING gin(to_tsvector('english', full_name));

-- Users birth year for filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_birth_year
ON users (birth_year)
WHERE birth_year IS NOT NULL;

-- Additional performance indexes for edge cases
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_submitted_by
ON measurements (submitted_by, date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_verified_by
ON measurements (verified_by, date DESC)
WHERE verified_by IS NOT NULL;

-- Print completion message
DO $$
BEGIN
    RAISE NOTICE 'Analytics performance indexes have been created successfully!';
    RAISE NOTICE 'Query performance should be significantly improved for:';
    RAISE NOTICE '- Analytics dashboard queries';
    RAISE NOTICE '- Team and individual performance analysis';
    RAISE NOTICE '- Date range filtering';
    RAISE NOTICE '- Organization access control';
END $$;