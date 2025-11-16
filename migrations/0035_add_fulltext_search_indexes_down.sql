-- Migration rollback: Remove full-text search indexes
-- Created: 2025-11-15

DROP INDEX IF EXISTS idx_users_fullname_fulltext;
DROP INDEX IF EXISTS idx_users_username_fulltext;
DROP INDEX IF EXISTS idx_teams_name_fulltext;
