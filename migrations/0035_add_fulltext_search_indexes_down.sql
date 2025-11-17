-- Migration rollback: Remove trigram search indexes
-- Created: 2025-11-15
-- Updated: 2025-11-16 - Changed to trigram indexes

DROP INDEX IF EXISTS idx_users_fullname_trgm;
DROP INDEX IF EXISTS idx_users_firstname_trgm;
DROP INDEX IF EXISTS idx_users_lastname_trgm;
DROP INDEX IF EXISTS idx_users_username_trgm;
DROP INDEX IF EXISTS idx_teams_name_trgm;

-- Note: We don't drop pg_trgm extension as it may be used by other features
