-- Migration 0053 Rollback: Remove site_settings resource type
-- This migration removes the site_settings resource type from audit logs
-- IMPORTANT: This restores the constraint to its state in migration 0043

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_resource_type_valid'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_resource_type_valid;
  END IF;

  -- Re-create with resource types from migration 0043 (without site_settings)
  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
    'organization', 'user', 'team', 'measurement', 'invitation', 'session',
    'site_metric', 'site_benchmark', 'custom_benchmark', 'organization_benchmark',
    'report'
  ));

  -- Restore comment from migration 0043
  COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS
    'Valid resource types including report for AI insights audit logging (updated in migration 0043)';
END $$;
