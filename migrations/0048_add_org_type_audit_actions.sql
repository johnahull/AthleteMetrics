-- Migration 0048: Add organization type audit actions
-- This migration adds audit actions for organization type metrics/benchmarks queries
-- IMPORTANT: This preserves ALL actions from migration 0047 and adds the new actions

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_action_valid'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
  END IF;

  -- Re-create with ALL existing actions from 0047 plus the new actions
  -- Only add if it doesn't exist (handles partial migration runs)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_action_valid'
  ) THEN
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

    -- Update comment to reflect new actions
    COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS
      'Valid audit log actions including organization type query actions (updated in migration 0048)';
  END IF;
END $$;
