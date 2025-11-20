-- Rollback migration 0048: Remove organization type audit actions
-- This restores the constraint to its state in migration 0047

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_action_valid'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_valid;

    -- Restore to 0047 state (without organization type query actions)
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
      'report_ai_insights_generation_failed'
    ));

    COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS
      'Valid audit log actions including AI feature management actions (updated in migration 0047 to add generation_failed)';
  END IF;
END $$;
