-- Migration: Add constraint to ensure users have at least one authentication method
-- Prevents orphaned accounts with no way to login

-- ONE-TIME CLEANUP: This migration deletes test user artifacts created before 2024-12-08
-- These patterns match test data conventions from integration tests (see scripts/cleanup-test-data.ts)
-- Rationale for broad patterns (e.g., '%-api-%', '%-del-%'):
--   1. Limited scope: Only applies to users with NULL password AND NULL OAuth IDs
--   2. Production safety: Real users must have at least one auth method
--   3. Historical cleanup: This is a one-time operation for legacy test data
-- Future test data should use stricter naming conventions (e.g., 'test-api-*' instead of '*-api-*')

-- First, clean up orphaned test users that have no auth method
-- These are test artifacts that can't login anyway
-- Pattern matches test data created by integration tests (see scripts/cleanup-test-data.ts)

-- Delete related records first (FK constraints)
-- Note: We need to check for NULL auth methods AND test username patterns

-- Delete measurements
DELETE FROM measurements
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Delete audit logs
DELETE FROM audit_logs
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Delete sessions (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
    DELETE FROM sessions
    WHERE user_id IN (
      SELECT id FROM users
      WHERE password IS NULL
        AND google_id IS NULL
        AND apple_id IS NULL
        AND (
          username LIKE 'test-%'
          OR username LIKE '%-api-%'
          OR username LIKE '%-creation-%'
          OR username LIKE '%-del-%'
          OR username LIKE 'bulk-ops-%'
          OR username LIKE 'dep-user%'
          OR emails::text LIKE '%@test.com%'
        )
    );
  END IF;
END $$;

-- Delete email verification tokens
DELETE FROM email_verification_tokens
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Delete account linking tokens
DELETE FROM account_linking_tokens
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Delete athlete profiles
DELETE FROM athlete_profiles
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Delete invitations (check both user_id and invited_by FK references)
DELETE FROM invitations
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
)
OR invited_by IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Delete user_teams records
DELETE FROM user_teams
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Delete user_organizations records
DELETE FROM user_organizations
WHERE user_id IN (
  SELECT id FROM users
  WHERE password IS NULL
    AND google_id IS NULL
    AND apple_id IS NULL
    AND (
      username LIKE 'test-%'
      OR username LIKE '%-api-%'
      OR username LIKE '%-creation-%'
      OR username LIKE '%-del-%'
      OR username LIKE 'bulk-ops-%'
      OR username LIKE 'dep-user%'
      OR emails::text LIKE '%@test.com%'
    )
);

-- Now delete the orphaned test users
DELETE FROM users
WHERE password IS NULL
  AND google_id IS NULL
  AND apple_id IS NULL
  AND (
    username LIKE 'test-%'
    OR username LIKE '%-api-%'
    OR username LIKE '%-creation-%'
    OR username LIKE '%-del-%'
    OR username LIKE 'bulk-ops-%'
    OR username LIKE 'dep-user%'
    OR emails::text LIKE '%@test.com%'
  );

-- Add CHECK constraint ensuring at least one auth method exists (idempotent via DO $$ block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_must_have_auth_method') THEN
    ALTER TABLE users ADD CONSTRAINT users_must_have_auth_method
      CHECK (password IS NOT NULL OR google_id IS NOT NULL OR apple_id IS NOT NULL);
  END IF;
END $$;
