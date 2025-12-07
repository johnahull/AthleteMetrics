-- Rollback migration: Remove auth method constraint

-- Remove CHECK constraint (idempotent via IF EXISTS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_must_have_auth_method') THEN
    ALTER TABLE users DROP CONSTRAINT users_must_have_auth_method;
  END IF;
END $$;
