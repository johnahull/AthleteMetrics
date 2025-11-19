-- Rollback Migration 0047: Remove report_ai_insights_generation_failed audit action

DO $$
BEGIN
  -- Only proceed if the constraint exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_action_valid'
  ) THEN
    -- Drop the constraint with the new action
    ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_valid;

    -- Re-create without the failed action (original from migration 0041)
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (
      action IN (
        'user_invited', 'user_joined', 'user_removed', 'user_role_changed',
        'team_created', 'team_updated', 'team_deleted', 'team_member_added', 'team_member_removed',
        'athlete_created', 'athlete_updated', 'athlete_deleted', 'athlete_merged',
        'measurement_added', 'measurement_imported', 'measurement_deleted',
        'report_created', 'report_updated', 'report_deleted', 'report_shared',
        'org_created', 'org_updated', 'org_settings_changed', 'organization_updated',
        'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled', 'benchmark_disabled',
        'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
        'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated', 'org_metric_enabled',
        'org_ai_enabled_by_site_admin', 'org_ai_disabled_by_site_admin',
        'org_ai_enabled_by_org_admin', 'org_ai_disabled_by_org_admin',
        'site_ai_model_changed', 'report_ai_insights_generated', 'report_ai_insights_updated',
        'invitation_created', 'invitation_accepted',
        'admin_password_synced', 'sessions_revoked',
        'privilege_restoration_blocked', 'site_admin_organization_access'
      )
    );
  END IF;
END $$;
