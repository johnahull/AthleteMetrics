-- Performance optimization indexes for temporal team membership queries
-- These indexes improve the performance of the analytics queries with temporal constraints

-- Index for temporal team membership queries
CREATE INDEX IF NOT EXISTS "idx_user_teams_temporal" ON "user_teams" ("user_id", "team_id", "joined_at", "left_at", "is_active");

-- Index for team archive status queries  
CREATE INDEX IF NOT EXISTS "idx_teams_archive_status" ON "teams" ("is_archived", "archived_at");

-- Index for measurements date queries (used in temporal joins)
CREATE INDEX IF NOT EXISTS "idx_measurements_date_user" ON "measurements" ("date", "user_id");

-- Composite index for user teams active status
CREATE INDEX IF NOT EXISTS "idx_user_teams_active" ON "user_teams" ("is_active", "team_id") WHERE "is_active" = 'true';

-- Index for team organization relationship (used in access control)
CREATE INDEX IF NOT EXISTS "idx_teams_organization" ON "teams" ("organization_id", "is_archived");

-- Data integrity constraints
-- Ensure is_active is consistent with left_at
ALTER TABLE "user_teams" ADD CONSTRAINT "chk_active_consistency" 
CHECK (
  (is_active = 'true' AND left_at IS NULL) OR 
  (is_active = 'false' AND left_at IS NOT NULL)
);

-- Ensure archive date is consistent with archive status
ALTER TABLE "teams" ADD CONSTRAINT "chk_archive_consistency"
CHECK (
  (is_archived = 'false' AND archived_at IS NULL) OR
  (is_archived = 'true' AND archived_at IS NOT NULL)
);