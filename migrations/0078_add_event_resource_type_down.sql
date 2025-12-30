-- Rollback Migration 0078: Remove event from audit_logs resource_type constraint
-- Restores audit_logs_resource_type_valid constraint to pre-0078 state
-- IDEMPOTENT: Safe to run multiple times

DO $$
BEGIN
  -- Drop the existing constraint (IF EXISTS for idempotency)
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

  -- Recreate constraint without event
  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
    'organization',
    'user',
    'team',
    'measurement',
    'invitation',
    'session',
    'site_metric',
    'site_benchmark',
    'custom_benchmark',
    'organization_benchmark',
    'report',
    'site_settings',
    'membership_request'
  ));

  RAISE NOTICE 'Removed event from audit_logs_resource_type_valid constraint';
END $$;
