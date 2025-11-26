-- Add indexes for wellness system performance optimization
-- These indexes address N+1 query patterns and improve query performance
-- Using CONCURRENTLY for zero-downtime index creation in production

-- Organization-scoped queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_responses_organization_id
  ON wellness_responses(organization_id);

-- User-specific queries (athlete responses)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_responses_user_id
  ON wellness_responses(user_id);

-- Team-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_responses_team_id
  ON wellness_responses(team_id)
  WHERE team_id IS NOT NULL;

-- Request-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_responses_request_id
  ON wellness_responses(request_id)
  WHERE request_id IS NOT NULL;

-- Date range queries (analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_responses_date
  ON wellness_responses(date);

-- Magic link token lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_requests_public_token
  ON wellness_requests(public_token)
  WHERE public_token IS NOT NULL;

-- Composite index for organization + date range queries (most common analytics pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_responses_org_date
  ON wellness_responses(organization_id, date);

-- Composite index for request filtering by org + status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_requests_org_status
  ON wellness_requests(organization_id, status);
