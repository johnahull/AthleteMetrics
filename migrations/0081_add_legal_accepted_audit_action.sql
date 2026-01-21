-- Migration 0081: Add legal_accepted audit action
-- Fixes: audit_logs constraint violation when accepting invitations
-- The legal_accepted action is used to log when users accept privacy policy and terms

DO $$
BEGIN
  -- Drop existing constraint (idempotent - IF EXISTS)
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;

  -- Recreate constraint with legal_accepted action added
  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
    -- Organization actions
    'organization_created',
    'organization_updated',
    'organization_deactivated',
    'organization_reactivated',
    'organization_deleted',
    'organization_dependencies_viewed',
    'site_admin_access',
    'site_admin_organization_access',

    -- User actions
    'user_created',
    'user_updated',
    'user_deleted',
    'user_role_changed',
    'user_role_updated',
    'user_registered',
    'role_changed',
    'password_reset_unknown_email',
    'email_verification_requested',
    'password_change_failed',
    'privilege_restoration_blocked',
    'admin_password_synced',
    'privilege_restored',
    'oauth_login',

    -- Legal acceptance action (NEW - fixes invitation acceptance bug)
    'legal_accepted',

    -- Team actions
    'team_created',
    'team_updated',
    'team_deleted',
    'team_archived',

    -- Measurement actions
    'measurement_created',
    'measurement_updated',
    'measurement_deleted',
    'measurements_bulk_verify',
    'measurements_bulk_unverify',

    -- Invitation actions
    'invitation_created',
    'invitation_accepted',
    'invitation_cancelled',
    'invitation_resent',

    -- Session actions
    'sessions_revoked',
    'zombie_sessions_cleaned',
    'zombie_cleanup_failed',
    'session_revocation_failed',

    -- Metric actions (site-wide metric management)
    'metric_created',
    'metric_updated',
    'metric_enabled',
    'metric_disabled',
    'metric_deleted',
    'org_metric_enabled',
    'org_metric_disabled',
    'org_metric_updated',
    'org_metrics_bulk_enabled',

    -- Benchmark actions
    'benchmark_created',
    'benchmark_updated',
    'benchmark_deleted',
    'benchmark_enabled',
    'benchmark_disabled',
    'custom_benchmark_created',
    'custom_benchmark_updated',
    'custom_benchmark_deleted',
    'org_benchmark_enabled',
    'org_benchmark_disabled',
    'org_benchmark_updated',

    -- AI feature actions
    'org_ai_enabled_by_site_admin',
    'org_ai_disabled_by_site_admin',
    'org_ai_enabled_by_org_admin',
    'org_ai_disabled_by_org_admin',
    'site_ai_model_changed',
    'report_ai_insights_generated',
    'report_ai_insights_updated',
    'report_ai_insights_generation_failed',

    -- Organization type actions
    'organization_type_metrics_queried',
    'organization_type_benchmarks_queried',

    -- Cache actions
    'cache_invalidated',
    'cache_invalidation_failed',

    -- Site settings actions
    'site_wellness_module_toggled',

    -- Organization wellness actions
    'org_wellness_enabled',
    'org_wellness_disabled',

    -- Organization events actions
    'org_events_enabled',
    'org_events_disabled',

    -- Membership request actions
    'membership_request_created',
    'membership_request_approved',
    'membership_request_rejected',
    'membership_request_cancelled',
    'organization_join_code_regenerated',
    'organization_membership_settings_updated',

    -- Event actions
    'event_created',
    'event_updated',
    'event_deleted',
    'event_frozen',
    'event_unfrozen',
    'event_freeze_overridden',
    'event_results_published',
    'event_registration_created',
    'event_registration_approved',
    'event_registration_declined',
    'event_registration_cancelled',
    'event_registration_checked_in',
    'event_registration_promoted',
    'event_invitation_created',
    'event_invitation_accepted',
    'event_invitation_declined',
    'event_invitation_cancelled',

    -- Event metric actions
    'event_metric_added',
    'event_metric_removed',
    'event_metric_updated',
    'event_metrics_reordered',
    'event_metrics_bulk_added',

    -- Event results actions
    'event_results_unpublished',
    'event_results_visibility_changed'
  ));
END $$;

-- Add comment documenting the change
COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS
  'Valid audit log actions including legal_accepted for privacy/terms acceptance (added in migration 0081)';
