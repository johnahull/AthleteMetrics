-- Migration 0023: Add metric management audit log actions
-- Description: Extends audit_logs CHECK constraints to support metric management actions
-- Created: 2025-11-02
-- Dependencies: 0003_add_audit_logs_table.sql, 0022_add_metric_management_system.sql

-- Drop existing CHECK constraints
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

-- Recreate action constraint with new metric-related actions
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

-- Recreate resource_type constraint with new site_metric type
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
  'organization', 'user', 'team', 'measurement', 'invitation', 'session', 'site_metric'
));

-- Add comment for documentation
COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS 'Valid audit log actions including metric management (added in migration 0023)';
COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS 'Valid resource types including site_metric (added in migration 0023)';
