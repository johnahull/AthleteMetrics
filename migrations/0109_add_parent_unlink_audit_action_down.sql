-- Migration 0109 DOWN: Remove parent unlink audit action and resource type
-- Restores constraints to their pre-0109 state (as defined in 0104 + 0078)

DO $$
BEGIN
  -- ============================================================================
  -- 1. Restore audit_logs_action_valid to pre-0109 state (removes parent_unlinked_child)
  -- ============================================================================
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;

  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
    'organization_created', 'organization_updated', 'organization_deactivated',
    'organization_reactivated', 'organization_deleted', 'organization_dependencies_viewed',
    'organization_type_accessed', 'site_admin_access', 'site_admin_organization_access',
    'user_created', 'user_updated', 'user_deleted', 'user_role_changed', 'user_role_updated',
    'user_registered', 'role_changed', 'password_reset_unknown_email',
    'email_verification_requested', 'password_change_failed', 'privilege_restoration_blocked',
    'admin_password_synced', 'privilege_restored', 'oauth_login', 'legal_accepted',
    'team_created', 'team_updated', 'team_deleted', 'team_archived',
    'measurement_created', 'measurement_updated', 'measurement_deleted',
    'measurements_bulk_verify', 'measurements_bulk_unverify',
    'invitation_created', 'invitation_accepted', 'invitation_cancelled', 'invitation_resent',
    'sessions_revoked', 'zombie_sessions_cleaned', 'zombie_cleanup_failed', 'session_revocation_failed',
    'metric_created', 'metric_updated', 'metric_enabled', 'metric_disabled', 'metric_deleted',
    'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled',
    'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled',
    'benchmark_disabled', 'custom_benchmark_created', 'custom_benchmark_updated',
    'custom_benchmark_deleted', 'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated',
    'org_ai_enabled_by_site_admin', 'org_ai_disabled_by_site_admin', 'org_ai_enabled_by_org_admin',
    'org_ai_disabled_by_org_admin', 'site_ai_model_changed', 'report_ai_insights_generated',
    'report_ai_insights_updated', 'report_ai_insights_generation_failed',
    'organization_type_metrics_queried', 'organization_type_benchmarks_queried',
    'cache_invalidated', 'cache_invalidation_failed', 'site_wellness_module_toggled',
    'org_wellness_enabled', 'org_wellness_disabled', 'org_events_enabled', 'org_events_disabled',
    'membership_request_created', 'membership_request_approved', 'membership_request_rejected',
    'membership_request_cancelled', 'organization_join_code_regenerated',
    'organization_join_code_set', 'organization_membership_settings_updated',
    'event_created', 'event_updated', 'event_deleted', 'event_frozen', 'event_unfrozen',
    'event_freeze_overridden', 'event_results_published', 'event_registration_created',
    'event_registration_approved', 'event_registration_declined', 'event_registration_cancelled',
    'event_registration_checked_in', 'event_registration_promoted', 'event_invitation_created',
    'event_invitation_accepted', 'event_invitation_declined', 'event_invitation_cancelled',
    'event_metric_added', 'event_metric_removed', 'event_metric_updated',
    'event_metrics_reordered', 'event_metrics_bulk_added',
    'event_results_unpublished', 'event_results_visibility_changed'
  ));

  -- ============================================================================
  -- 2. Restore audit_logs_resource_type_valid to pre-0109 state (removes parent_athlete_link)
  -- ============================================================================
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
    'organization', 'user', 'team', 'measurement', 'invitation', 'session',
    'site_metric', 'site_benchmark', 'custom_benchmark', 'organization_benchmark',
    'report', 'site_settings', 'membership_request', 'event'
  ));

  RAISE NOTICE 'Migration 0109 DOWN: Restored pre-0109 audit_logs constraints';
END $$;
