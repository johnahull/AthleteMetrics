-- Rollback Migration 0043: Remove 'report' from audit_logs resource_type constraint

DO $$
BEGIN
  -- Check if any audit logs use 'report' resource_type
  IF EXISTS (SELECT 1 FROM audit_logs WHERE resource_type = 'report') THEN
    RAISE EXCEPTION 'Cannot rollback: audit_logs with resource_type "report" exist. Delete them first.';
  END IF;

  -- Drop and recreate constraint without 'report' (idempotent)
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_resource_type_valid'
  ) THEN
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
      'organization', 'user', 'team', 'measurement', 'invitation', 'session',
      'site_metric', 'site_benchmark', 'custom_benchmark', 'organization_benchmark'
    ));
  END IF;
END $$;

-- Update comment
COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS
  'Valid resource types (reverted from migration 0043)';
