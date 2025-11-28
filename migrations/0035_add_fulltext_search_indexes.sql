-- Migration: Add trigram indexes for ILIKE search on command palette
-- Created: 2025-11-15
-- Updated: 2025-11-16 - Changed from full-text to trigram for ILIKE support
-- Purpose: Add GIN trigram indexes for fast ILIKE pattern matching on users and teams tables

-- Enable pg_trgm extension for trigram matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram index on users.full_name for fast ILIKE searches
-- This enables fast fuzzy search for athletes in the command palette
CREATE INDEX IF NOT EXISTS idx_users_fullname_trgm
ON users USING GIN(full_name gin_trgm_ops);

-- Add trigram index on users.first_name for partial name matches
CREATE INDEX IF NOT EXISTS idx_users_firstname_trgm
ON users USING GIN(first_name gin_trgm_ops);

-- Add trigram index on users.last_name for partial name matches
CREATE INDEX IF NOT EXISTS idx_users_lastname_trgm
ON users USING GIN(last_name gin_trgm_ops);

-- Add trigram index on users.username for username search
CREATE INDEX IF NOT EXISTS idx_users_username_trgm
ON users USING GIN(username gin_trgm_ops);

-- Add trigram index on teams.name for fast team search
CREATE INDEX IF NOT EXISTS idx_teams_name_trgm
ON teams USING GIN(name gin_trgm_ops);

-- Add comments for documentation
COMMENT ON INDEX idx_users_fullname_trgm IS 'Trigram index for ILIKE search on athlete full names (command palette)';
COMMENT ON INDEX idx_users_firstname_trgm IS 'Trigram index for ILIKE search on athlete first names (command palette)';
COMMENT ON INDEX idx_users_lastname_trgm IS 'Trigram index for ILIKE search on athlete last names (command palette)';
COMMENT ON INDEX idx_users_username_trgm IS 'Trigram index for ILIKE search on usernames (command palette)';
COMMENT ON INDEX idx_teams_name_trgm IS 'Trigram index for ILIKE search on team names (command palette)';
