-- Migration: Add membership requests feature
-- This migration adds the ability for athletes to request membership in organizations
-- via join codes/links or a public directory

-- 1. Add columns to organizations table for membership settings
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS join_code VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS is_public_directory BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_membership_requests BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_approve_requests BOOLEAN NOT NULL DEFAULT false;

-- 2. Generate join codes for existing organizations (8 char uppercase hex from UUID)
UPDATE organizations
SET join_code = UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE join_code IS NULL;

-- 3. Create membership_requests table
CREATE TABLE IF NOT EXISTS membership_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_role TEXT NOT NULL DEFAULT 'athlete',
  discovery_method TEXT,
  processed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- 4. Add check constraint for status enum
ALTER TABLE membership_requests
  ADD CONSTRAINT membership_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- 5. Add check constraint for discovery_method enum
ALTER TABLE membership_requests
  ADD CONSTRAINT membership_requests_discovery_method_check
  CHECK (discovery_method IS NULL OR discovery_method IN ('join_code', 'directory', 'direct_link'));

-- 6. Create indexes
-- Prevent duplicate pending requests per user/org combination
CREATE UNIQUE INDEX IF NOT EXISTS membership_requests_unique_pending
  ON membership_requests (user_id, organization_id) WHERE status = 'pending';

-- Index for admin queries (list pending requests for an org)
CREATE INDEX IF NOT EXISTS membership_requests_org_status_idx
  ON membership_requests (organization_id, status);

-- Index for athlete queries (list their own requests)
CREATE INDEX IF NOT EXISTS membership_requests_user_idx
  ON membership_requests (user_id);

-- Index for join code lookups
CREATE INDEX IF NOT EXISTS organizations_join_code_idx
  ON organizations (join_code) WHERE join_code IS NOT NULL;

-- Index for public directory queries
CREATE INDEX IF NOT EXISTS organizations_public_directory_idx
  ON organizations (is_public_directory) WHERE is_public_directory = true;

-- Comment for documentation
COMMENT ON TABLE membership_requests IS 'Athlete-initiated requests to join organizations';
COMMENT ON COLUMN organizations.join_code IS 'Unique shareable code for athletes to request membership';
COMMENT ON COLUMN organizations.is_public_directory IS 'Whether org appears in public browsable directory';
COMMENT ON COLUMN organizations.allow_membership_requests IS 'Whether org accepts membership requests at all';
COMMENT ON COLUMN organizations.auto_approve_requests IS 'Whether requests are automatically approved (open enrollment)';
