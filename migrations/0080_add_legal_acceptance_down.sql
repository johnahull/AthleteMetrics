-- Rollback: Remove legal acceptance tracking from users table

-- Remove index
DROP INDEX IF EXISTS idx_users_legal_accepted_at;

-- Remove legal acceptance columns
ALTER TABLE users DROP COLUMN IF EXISTS legal_accepted_at;
ALTER TABLE users DROP COLUMN IF EXISTS legal_accepted_version;
