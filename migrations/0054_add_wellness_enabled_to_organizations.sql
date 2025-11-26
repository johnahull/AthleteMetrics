-- Migration 0054: Add wellness_enabled column to organizations table
-- This allows org admins to enable/disable wellness features for their organization

-- Add wellness_enabled column if it doesn't exist
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS wellness_enabled boolean NOT NULL DEFAULT true;

-- Add index for querying organizations with wellness enabled
CREATE INDEX IF NOT EXISTS organizations_wellness_enabled_idx
ON organizations(wellness_enabled)
WHERE wellness_enabled = true;

-- Add comment (will not error if column already exists)
COMMENT ON COLUMN organizations.wellness_enabled IS
  'Organization-level wellness module toggle (only effective when site wellness is enabled)';
