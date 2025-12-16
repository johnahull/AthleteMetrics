-- Migration: Add legal acceptance tracking to users table
-- Description: Adds legalAcceptedAt and legalAcceptedVersion columns to track
--              when users accepted the Privacy Policy and Terms of Service

-- Add legal acceptance timestamp column (nullable for existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMP;

-- Add legal acceptance version column (stores acceptance date in YYYY-MM-DD format)
-- Note: Expected format is YYYY-MM-DD (10 chars), but no database constraint is enforced.
-- Application validates format via legal-acceptance.ts utilities.
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_version TEXT;

-- Document existing users as grandfathered (users created before this feature)
COMMENT ON COLUMN users.legal_accepted_at IS 'NULL for users created before legal acceptance was implemented (grandfathered)';
COMMENT ON COLUMN users.legal_accepted_version IS 'Version of privacy policy and terms accepted (format: YYYY-MM-DD, e.g., "2024-12-13"). Represents acceptance date, not policy document version. No length constraint - application validates format.';

-- Add index for compliance queries (e.g., "find all users who accepted before date X")
CREATE INDEX IF NOT EXISTS idx_users_legal_accepted_at ON users(legal_accepted_at);
