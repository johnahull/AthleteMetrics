-- Migration 0052 Rollback: Remove site_wellness_module_toggled audit action
-- This migration removes the site_wellness_module_toggled action from audit logs
-- IMPORTANT: This restores the constraint to its state in migration 0048

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_action_valid'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_valid;
  END IF;

  -- Re-create with actions from migration 0048 (without site_wellness_module_toggled)
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
    -- Benchmark management actions
    'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled', 'benchmark_disabled',
    'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
    'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated',
    -- AI feature management actions
    'org_ai_enabled_by_site_admin', 'org_ai_disabled_by_site_admin',
    'org_ai_enabled_by_org_admin', 'org_ai_disabled_by_org_admin',
    'site_ai_model_changed', 'report_ai_insights_generated', 'report_ai_insights_updated',
    'report_ai_insights_generation_failed',
    -- Organization type query actions (added in 0048)
    'organization_type_metrics_queried', 'organization_type_benchmarks_queried'
  ));

  -- Restore comment from migration 0048
  COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS
    'Valid audit log actions including organization type query actions (updated in migration 0048)';
END $$;
