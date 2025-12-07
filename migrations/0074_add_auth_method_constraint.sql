-- Migration: Add constraint to ensure users have at least one authentication method
-- Prevents orphaned accounts with no way to login

-- Add CHECK constraint ensuring at least one auth method exists (idempotent via DO $$ block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_must_have_auth_method') THEN
    ALTER TABLE users ADD CONSTRAINT users_must_have_auth_method
      CHECK (password IS NOT NULL OR google_id IS NOT NULL OR apple_id IS NOT NULL);
  END IF;
END $$;
