-- Migration 0042: Add wellness feature flags
-- Purpose: Add site-level and organization-level wellness module toggles

-- Add wellness_enabled column to organizations table (defaults to true for backward compatibility)
ALTER TABLE organizations
ADD COLUMN wellness_enabled BOOLEAN NOT NULL DEFAULT true;

-- Add wellness module flag to site_settings table (defaults to true for backward compatibility)
ALTER TABLE site_settings
ADD COLUMN wellness_module_enabled BOOLEAN NOT NULL DEFAULT true;

-- Create index for faster wellness feature flag queries
CREATE INDEX IF NOT EXISTS organizations_wellness_enabled_idx ON organizations(wellness_enabled);

-- Add comment for documentation
COMMENT ON COLUMN organizations.wellness_enabled IS 'Organization-level wellness module toggle. Only effective when site-level wellness is enabled.';
COMMENT ON COLUMN site_settings.wellness_module_enabled IS 'Site-level wellness module toggle. When disabled, wellness is disabled for ALL organizations.';
