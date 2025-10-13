-- Migration script for PostgreSQL session store
-- Creates session table with proper indexes and foreign key if it doesn't exist
-- Safe to run multiple times (idempotent)
-- Wrapped in transaction for atomicity

BEGIN;

-- Create session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS session (
  sid varchar(255) PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL,
  user_id varchar(255) REFERENCES users(id) ON DELETE cascade
);

-- Create index for session expiration (used by automatic pruning)
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);

-- Create partial BTREE index on userId column for efficient user session lookups
-- Only indexes non-null userId values, excluding pre-authentication sessions
-- This provides 10-100x faster lookups than JSONB expression index
-- Foreign key with CASCADE DELETE ensures automatic cleanup when users are deleted
CREATE INDEX IF NOT EXISTS session_user_id_idx ON session (user_id) WHERE user_id IS NOT NULL;

-- Ensure user_id column is nullable for pre-authentication sessions
-- Safe to run on existing tables (drops NOT NULL constraint if present)
ALTER TABLE session ALTER COLUMN user_id DROP NOT NULL;

-- Verify table was created successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'session'
  ) THEN
    RAISE EXCEPTION 'Failed to create session table';
  END IF;
END $$;

COMMIT;
