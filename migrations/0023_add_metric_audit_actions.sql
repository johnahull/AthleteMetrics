-- Migration 0023: Add metric management audit log actions
-- Description: Extends audit_logs CHECK constraints to support metric management actions
-- Created: 2025-11-02
-- Dependencies: 0003_add_audit_logs_table.sql, 0022_add_metric_management_system.sql

-- Validate before dropping: ensure no invalid actions or resource types exist
DO $$
BEGIN
  -- Validate all existing actions are in the new constraint
  IF EXISTS (
    SELECT 1 FROM audit_logs
    WHERE action NOT IN (
      'organization_created', 'organization_deactivated', 'organization_reactivated',
      'organization_deleted', 'organization_dependencies_viewed',
      'site_admin_access', 'site_admin_organization_access', 'user_created', 'user_updated',
      'user_deleted', 'user_role_changed', 'role_changed',
      'password_reset_unknown_email', 'email_verification_requested', 'password_change_failed',
      'privilege_restoration_blocked', 'admin_password_synced', 'privilege_restored',
      'team_created', 'team_updated', 'team_deleted', 'team_archived',
      'measurement_created', 'measurement_updated', 'measurement_deleted',
      'invitation_created', 'invitation_accepted', 'invitation_cancelled', 'invitation_resent',
      'sessions_revoked', 'zombie_sessions_cleaned', 'zombie_cleanup_failed', 'session_revocation_failed',
      'metric_created', 'metric_updated', 'metric_enabled', 'metric_disabled', 'metric_deleted',
      'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled'
    )
  ) THEN
    RAISE EXCEPTION 'Cannot apply migration: invalid action values exist in audit_logs table';
  END IF;

  -- Validate all existing resource types are in the new constraint
  IF EXISTS (
    SELECT 1 FROM audit_logs
    WHERE resource_type NOT IN ('organization', 'user', 'team', 'measurement', 'invitation', 'session', 'site_metric')
  ) THEN
    RAISE EXCEPTION 'Cannot apply migration: invalid resource_type values exist in audit_logs table';
  END IF;

  -- If validation passes, drop and recreate constraints
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

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
    'sessions_revoked', 'zombie_sessions_cleaned', 'zombie_cleanup_failed', 'session_revocation_failed',
    -- Metric management actions (NEW in 0023)
    'metric_created', 'metric_updated', 'metric_enabled', 'metric_disabled', 'metric_deleted',
    'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled'
  ));

  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
    'organization', 'user', 'team', 'measurement', 'invitation', 'session', 'site_metric'
  ));
END $$;

-- Add comment for documentation
COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS 'Valid audit log actions including metric management (added in migration 0023)';
COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS 'Valid resource types including site_metric (added in migration 0023)';
