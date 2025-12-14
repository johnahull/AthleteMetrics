-- Rollback: Remove legal acceptance tracking from users table

-- Remove legal acceptance columns
ALTER TABLE users DROP COLUMN IF EXISTS legal_accepted_at;
ALTER TABLE users DROP COLUMN IF EXISTS legal_accepted_version;
