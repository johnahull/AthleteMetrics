-- Migration 0023 Down: Remove metric management audit log actions
-- Description: Reverts audit_logs CHECK constraints to pre-metric-management state
-- Created: 2025-11-04
-- Note: Existing audit logs with metric actions will remain in the table

-- Validate before reverting: check if any metric-related actions exist
DO $$
DECLARE metric_action_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO metric_action_count FROM audit_logs
  WHERE action IN (
    'metric_created', 'metric_updated', 'metric_enabled', 'metric_disabled', 'metric_deleted',
    'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled'
  );

  IF metric_action_count > 0 THEN
    RAISE WARNING 'Found % audit logs with metric actions. These will remain in the table but may cause constraint violations if not cleaned up.', metric_action_count;
  END IF;

  -- Drop current constraints
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

  -- Restore pre-migration 0023 constraints (without metric actions)
  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
    -- Organization actions
    'organization_created', 'organization_deactivated', 'organization_reactivated',
    'organization_deleted', 'organization_dependencies_viewed',
    -- User & authentication actions
    'site_admin_access', 'site_admin_organization_access', 'user_created', 'user_updated',
    'user_deleted', 'user_role_changed', 'role_changed',
    'password_reset_unknown_email', 'email_verification_requested', 'password_change_failed',
    'privilege_restoration_blocked', 'admin_password_synced', 'privilege_restored',
    -- Team actions
    'team_created', 'team_updated', 'team_deleted', 'team_archived',
    -- Measurement actions
    'measurement_created', 'measurement_updated', 'measurement_deleted',
    -- Invitation actions
    'invitation_created', 'invitation_accepted', 'invitation_cancelled', 'invitation_resent',
    -- Session management actions
    'sessions_revoked', 'zombie_sessions_cleaned', 'zombie_cleanup_failed', 'session_revocation_failed'
  ));

  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
    'organization', 'user', 'team', 'measurement', 'invitation', 'session'
  ));

  RAISE NOTICE 'Reverted audit_logs constraints to pre-migration 0023 state';
END $$;

-- Update comments
COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS 'Valid audit log actions (pre-metric management)';
COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS 'Valid resource types (pre-metric management)';
