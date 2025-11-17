-- Migration 0037: Add Organization AI Flags
-- Purpose: Add AI feature flags to organizations table
-- Author: Claude Code (Coaching Insights Feature)
-- Date: 2025-11-17

-- Add AI feature flags to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_enabled_by_site_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comments
COMMENT ON COLUMN organizations.ai_enabled_by_site_admin IS 'Whether site admin has enabled AI features for this organization (permission gate)';
COMMENT ON COLUMN organizations.ai_enabled IS 'Whether the organization admin has enabled AI features (requires ai_enabled_by_site_admin to be true)';

-- Create index for common query pattern (checking both flags)
CREATE INDEX IF NOT EXISTS organizations_ai_enabled_idx ON organizations(ai_enabled_by_site_admin, ai_enabled) WHERE ai_enabled_by_site_admin = TRUE AND ai_enabled = TRUE;
