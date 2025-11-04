-- Migration 0025: Add organization update audit log action
-- Description: Extends audit_logs CHECK constraints to support organization_updated action
-- Created: 2025-11-03
-- Dependencies: 0023_add_metric_audit_actions.sql, 0024_add_benchmarks_system.sql
-- Note: Benchmark audit actions were already added in migration 0024

-- Validate before dropping: ensure no invalid actions exist
DO $$
BEGIN
  -- Validate all existing actions are in the new constraint
  IF EXISTS (
    SELECT 1 FROM audit_logs
    WHERE action NOT IN (
      'organization_created', 'organization_updated', 'organization_deactivated', 'organization_reactivated',
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
      'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled',
      'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled', 'benchmark_disabled',
      'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
      'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated'
    )
  ) THEN
    RAISE EXCEPTION 'Cannot apply migration: invalid action values exist in audit_logs table';
  END IF;

  -- If validation passes, drop and recreate constraint
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;

  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
    -- Organization actions
    'organization_created', 'organization_updated', 'organization_deactivated', 'organization_reactivated',
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
    -- Metric management actions
    'metric_created', 'metric_updated', 'metric_enabled', 'metric_disabled', 'metric_deleted',
    'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled',
    -- Benchmark management actions (added in migration 0024)
    'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled', 'benchmark_disabled',
    'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
    'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated'
  ));
END $$;

-- Add comment for documentation
COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS 'Valid audit log actions including organization_updated action (updated in migration 0025)';
