-- Migration 0078: Add event to audit_logs resource_type constraint
-- This allows audit logging of event-related actions
-- IDEMPOTENT: Safe to run multiple times

DO $$
DECLARE
  constraint_def text;
BEGIN
  -- Check if the constraint exists and already includes 'event'
  SELECT pg_get_constraintdef(oid) INTO constraint_def
  FROM pg_constraint
  WHERE conname = 'audit_logs_resource_type_valid'
    AND conrelid = 'audit_logs'::regclass;

  -- If constraint already includes event, skip
  IF constraint_def IS NOT NULL AND constraint_def LIKE '%''event''%' THEN
    RAISE NOTICE 'Constraint already includes event, skipping';
    RETURN;
  END IF;

  -- Drop the existing constraint (IF EXISTS for idempotency)
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

  -- Add the updated constraint with event included
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
    'membership_request',
    'event'
  ));

  RAISE NOTICE 'Added event to audit_logs_resource_type_valid constraint';
END $$;
