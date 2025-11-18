-- Migration 0043: Add 'report' to audit_logs resource_type constraint
-- Purpose: Allow audit logging for AI-generated report insights
-- Author: Claude Code
-- Date: 2025-11-18

-- Validate before dropping: ensure no invalid resource_types exist
DO $$
BEGIN
  -- Validate all existing resource_types are in the new constraint
  IF EXISTS (
    SELECT 1 FROM audit_logs
    WHERE resource_type NOT IN (
      'organization', 'user', 'team', 'measurement', 'invitation', 'session',
      'site_metric', 'site_benchmark', 'custom_benchmark', 'organization_benchmark',
      'report'
    )
  ) THEN
    RAISE EXCEPTION 'Cannot apply migration: invalid resource_type values exist in audit_logs table';
  END IF;

  -- If validation passes, drop and recreate constraint
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
    'organization', 'user', 'team', 'measurement', 'invitation', 'session',
    'site_metric', 'site_benchmark', 'custom_benchmark', 'organization_benchmark',
    'report'
  ));
END $$;

-- Add comment for documentation
COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS
  'Valid resource types including report for AI insights audit logging (updated in migration 0043)';
