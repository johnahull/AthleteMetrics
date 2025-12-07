-- Rollback migration 0071: Remove membership_request from resource_type constraint

DO $$
BEGIN
  -- Drop the current constraint
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

  -- Restore the previous constraint without membership_request
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
    'site_settings'
  ));
END $$;
