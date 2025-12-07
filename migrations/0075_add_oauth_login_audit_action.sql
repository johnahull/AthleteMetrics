-- Migration 0075: Add OAuth login audit action
-- Adds action for tracking successful OAuth authentications

DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;

  -- Recreate constraint with OAuth login action added
  -- NOTE: This constraint must include ALL existing actions in the database
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
    'oauth_login',  -- NEW: OAuth authentication success

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
    'invitation_sent',
    'invitation_accepted',
    'invitation_revoked',
    'invitation_resent',

    -- Report actions
    'report_created',
    'report_updated',
    'report_deleted',
    'report_ai_insights_generated',  -- AI-generated report insights

    -- Site Settings actions
    'site_settings_updated',
    'ai_model_updated',
    'wellness_module_toggled',

    -- Cache actions
    'cache_invalidated',
    'cache_invalidation_failed',

    -- Membership Request actions
    'membership_request_created',
    'membership_request_approved',
    'membership_request_rejected',
    'membership_request_cancelled',
    'join_code_regenerated',
    'membership_settings_updated',

    -- Metric actions (site-wide metric management)
    'metric_created',
    'metric_updated',
    'metric_deleted',
    'metric_enabled',
    'metric_disabled',

    -- Organization metric actions
    'org_metric_enabled',
    'org_metric_disabled',
    'org_metrics_bulk_enabled',

    -- AI feature actions
    'org_ai_enabled_by_org_admin',
    'org_ai_enabled_by_site_admin',

    -- Benchmark actions
    'custom_benchmark_created',
    'custom_benchmark_updated',
    'org_benchmark_enabled'
  ));
END $$;
