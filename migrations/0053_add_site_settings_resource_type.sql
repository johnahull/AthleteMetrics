-- Migration 0053: Add site_settings to audit_logs resource_type constraint
-- This migration adds the site_settings resource type for site-wide settings changes
-- IMPORTANT: This preserves ALL resource types from migration 0043 and adds the new type

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_resource_type_valid'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;
  END IF;

  -- Re-create with ALL existing resource types from 0043 plus the new type
  -- Only add if it doesn't exist (handles partial migration runs)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_resource_type_valid'
  ) THEN
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
      'organization', 'user', 'team', 'measurement', 'invitation', 'session',
      'site_metric', 'site_benchmark', 'custom_benchmark', 'organization_benchmark',
      'report',
      'site_settings'
    ));

    -- Update comment to reflect new resource type
    COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS
      'Valid resource types including site_settings for site-wide configuration changes (updated in migration 0053)';
  END IF;
END $$;
