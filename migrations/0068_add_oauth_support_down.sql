-- Rollback migration: Remove OAuth authentication support
-- WARNING: This will remove OAuth authentication features and may prevent OAuth-only users from logging in

-- Safety check: Prevent rollback if OAuth-only users exist (users with no password)
DO $$
DECLARE
  oauth_only_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO oauth_only_count
  FROM users
  WHERE password IS NULL AND (google_id IS NOT NULL OR apple_id IS NOT NULL);

  IF oauth_only_count > 0 THEN
    RAISE EXCEPTION 'Cannot rollback OAuth support: % OAuth-only user(s) exist. Migration aborted.', oauth_only_count;
  END IF;
END $$;

-- Drop indexes first (idempotent via IF EXISTS)
DROP INDEX IF EXISTS idx_account_linking_tokens_user_id;
DROP INDEX IF EXISTS idx_account_linking_tokens_token;
DROP INDEX IF EXISTS idx_users_apple_id;
DROP INDEX IF EXISTS idx_users_google_id;

-- Drop account linking tokens table (idempotent via IF EXISTS)
DROP TABLE IF EXISTS account_linking_tokens;

-- Drop constraints (idempotent via IF EXISTS)
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_last_auth_method_check;
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_oauth_provider_check;
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_apple_id_key;
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_id_key;
END $$;

-- Remove OAuth columns from users table (idempotent via IF EXISTS)
ALTER TABLE users DROP COLUMN IF EXISTS account_linked_at;
ALTER TABLE users DROP COLUMN IF EXISTS last_auth_method;
ALTER TABLE users DROP COLUMN IF EXISTS oauth_email_verified;
ALTER TABLE users DROP COLUMN IF EXISTS oauth_email;
ALTER TABLE users DROP COLUMN IF EXISTS oauth_provider;
ALTER TABLE users DROP COLUMN IF EXISTS apple_id;
ALTER TABLE users DROP COLUMN IF EXISTS google_id;

-- Restore password as NOT NULL (only if all users have passwords)
DO $$
BEGIN
  -- Verify all users have passwords before adding NOT NULL constraint
  IF NOT EXISTS (SELECT 1 FROM users WHERE password IS NULL) THEN
    ALTER TABLE users ALTER COLUMN password SET NOT NULL;
  ELSE
    RAISE EXCEPTION 'Cannot restore password NOT NULL constraint: some users have NULL passwords';
  END IF;
END $$;
