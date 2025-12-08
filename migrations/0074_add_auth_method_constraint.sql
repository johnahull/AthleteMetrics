-- Migration: Add constraint to ensure users have at least one authentication method
-- Prevents orphaned accounts with no way to login

-- First, clean up orphaned test users that have no auth method
-- These are test artifacts with '_test_' in username that can't login anyway

-- Delete related user_teams records first (FK constraint)
DELETE FROM user_teams
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND username LIKE '%\_test\_%' ESCAPE '\'
);

-- Delete related user_organizations records (FK constraint)
DELETE FROM user_organizations
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND username LIKE '%\_test\_%' ESCAPE '\'
);

-- Now delete the orphaned test users
DELETE FROM users
WHERE password IS NULL
  AND google_id IS NULL
  AND apple_id IS NULL
  AND username LIKE '%\_test\_%' ESCAPE '\';

-- Add CHECK constraint ensuring at least one auth method exists (idempotent via DO $$ block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_must_have_auth_method') THEN
    ALTER TABLE users ADD CONSTRAINT users_must_have_auth_method
      CHECK (password IS NOT NULL OR google_id IS NOT NULL OR apple_id IS NOT NULL);
  END IF;
END $$;
