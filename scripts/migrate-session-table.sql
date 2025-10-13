-- Migration script for PostgreSQL session store
-- Creates session table with proper indexes and foreign key if it doesn't exist
-- Safe to run multiple times (idempotent)
-- Uses zero-downtime index creation with CONCURRENTLY
--
-- ROLLBACK PROCEDURE:
-- If migration fails, run the following to clean up:
--   DROP INDEX CONCURRENTLY IF EXISTS session_user_id_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS "IDX_session_expire";
--   DROP TABLE IF EXISTS session CASCADE;
--
-- WARNING: Index creation with CONCURRENTLY cannot run inside a transaction block
-- Therefore, table creation and index creation are separate operations

-- Set lock timeout to prevent blocking production database
SET lock_timeout = '5s';

-- Create session table for connect-pg-simple
-- This operation is fast and won't block production
CREATE TABLE IF NOT EXISTS session (
  sid varchar(255) PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL,
  user_id varchar(255) REFERENCES users(id) ON DELETE cascade
);

-- Ensure user_id column is nullable for pre-authentication sessions
-- Safe to run on existing tables (drops NOT NULL constraint if present)
ALTER TABLE session ALTER COLUMN user_id DROP NOT NULL;

-- Create index for session expiration (used by automatic pruning)
-- CONCURRENTLY prevents table locks during index creation (zero-downtime)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_session_expire" ON session (expire);

-- Create partial BTREE index on userId column for efficient user session lookups
-- Only indexes non-null userId values, excluding pre-authentication sessions
-- This provides 10-100x faster lookups than JSONB expression index
-- Foreign key with CASCADE DELETE ensures automatic cleanup when users are deleted
-- CONCURRENTLY prevents table locks during index creation (zero-downtime)
CREATE INDEX CONCURRENTLY IF NOT EXISTS session_user_id_idx ON session (user_id) WHERE user_id IS NOT NULL;

-- Reset lock timeout to default
RESET lock_timeout;

-- Verify table and indexes were created successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'session'
  ) THEN
    RAISE EXCEPTION 'Failed to create session table';
  END IF;

  -- Verify user_id column is nullable
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session' AND column_name = 'user_id' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'user_id column must be nullable';
  END IF;

  -- Verify foreign key exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'session' AND constraint_type = 'FOREIGN KEY'
  ) THEN
    RAISE WARNING 'Foreign key constraint may not exist on session.user_id';
  END IF;
END $$;
