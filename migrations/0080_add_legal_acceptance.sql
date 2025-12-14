-- Migration: Add legal acceptance tracking to users table
-- Description: Adds legalAcceptedAt and legalAcceptedVersion columns to track
--              when users accepted the Privacy Policy and Terms of Service

-- Add legal acceptance timestamp column (nullable for existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMP;

-- Add legal acceptance version column (stores the LAST_UPDATED date from privacy/terms pages)
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_version TEXT;

-- Document existing users as grandfathered (users created before this feature)
COMMENT ON COLUMN users.legal_accepted_at IS 'NULL for users created before legal acceptance was implemented (grandfathered)';
COMMENT ON COLUMN users.legal_accepted_version IS 'Version of privacy policy and terms accepted (e.g., "2024-12-13")';
