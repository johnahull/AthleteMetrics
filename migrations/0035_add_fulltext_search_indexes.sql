-- Migration: Add full-text search indexes for command palette
-- Created: 2025-11-15
-- Purpose: Add GIN indexes for fast text search on users and teams tables

-- Add full-text search index on users.full_name
-- This enables fast fuzzy search for athletes in the command palette
CREATE INDEX IF NOT EXISTS idx_users_fullname_fulltext
ON users USING GIN(to_tsvector('english', full_name));

-- Add full-text search index on users.username
-- This enables search by username as well
CREATE INDEX IF NOT EXISTS idx_users_username_fulltext
ON users USING GIN(to_tsvector('english', username));

-- Add full-text search index on teams.name
-- This enables fast team search in the command palette
CREATE INDEX IF NOT EXISTS idx_teams_name_fulltext
ON teams USING GIN(to_tsvector('english', name));

-- Add comment for documentation
COMMENT ON INDEX idx_users_fullname_fulltext IS 'Full-text search index for athlete names (command palette)';
COMMENT ON INDEX idx_users_username_fulltext IS 'Full-text search index for usernames (command palette)';
COMMENT ON INDEX idx_teams_name_fulltext IS 'Full-text search index for team names (command palette)';
