-- Migration 0155: allow the eval template audit actions (AM-FEAT-019, Manage templates)
--
-- PATCH /api/eval-templates/:id writes 'eval_template_updated' and DELETE writes 'eval_template_deleted',
-- both with resource_type 'eval_template'. Both CHECK constraints are re-defined as the canonical lists of
-- migration 0130 plus the new values (a strict superset, so every existing row still conforms).
-- The service writes these rows best effort (a failed audit insert is logged and never fails the change),
-- so the template routes keep working on a database that has not run this migration yet.
--
-- IDEMPOTENT: safe to run multiple times.

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
    -- Organization actions
    'organization_created',
    'organization_updated',
    'organization_deactivated',
    'organization_reactivated',
    'organization_deleted',
    'organization_dependencies_viewed',
    'organization_type_accessed',
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

    -- Legal acceptance action
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

    -- Metric actions
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
    'site_sprint_fv_module_toggled',

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
    'organization_join_code_set',
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
    'event_results_visibility_changed',

    -- Training module actions
    'site_training_module_toggled',
    'org_training_enabled',

    -- Parent/COPPA actions
    'parent_unlinked_child',

    -- Profile management actions
    -- Note: `profile_merge` is emitted by services/profile-merge-service.ts:634
    -- but was never added to a forward-only constraint migration. Added here
    -- so existing prod audit rows satisfy the constraint.
    'profile_merge',

    -- Eval battery template actions (AM-FEAT-019)
    'eval_template_updated',
    'eval_template_deleted'
));

COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS
  'Valid audit log actions — canonical list of 0130 plus eval_template_updated / eval_template_deleted (migration 0155).';

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
    'organization',
    'user',
    'team',
    'measurement',
    'invitation',
    'session',
    'site_metric',
    'site_benchmark',
    'custom_benchmark',
    'organization_benchmark',
    'report',
    'site_settings',
    'membership_request',
    'event',
    'parent_athlete_link',

    -- Resource types emitted by code that were never added to a forward-only
    -- constraint migration. Added here so existing prod audit rows satisfy the
    -- constraint. Follow-up: canonicalize singular vs plural naming
    -- (site_metric/site_metrics, site_benchmark/site_benchmarks).
    'user_organization',     -- routes/organization-routes.ts:791
    'organization_type',     -- middleware/organization-type-middleware.ts:695
    'site_metrics',          -- services/organization-type-service.ts:327 (plural — coexists with site_metric)
    'site_benchmarks',       -- services/organization-type-service.ts:398 (plural — coexists with site_benchmark)

    'eval_template'          -- services/eval-template-service.ts (AM-FEAT-019)
));

COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS
  'Valid audit log resource_type values — canonical list of 0130 plus eval_template (migration 0155).';

DO $$
BEGIN
  RAISE NOTICE 'Migration 0155: added eval_template_updated, eval_template_deleted and resource type eval_template to the audit_logs CHECK constraints';
END $$;
