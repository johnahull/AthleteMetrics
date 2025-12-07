-- Rollback migration 0075: Remove OAuth login audit action

DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;

  -- Recreate constraint without OAuth login action (back to migration 0070 state)
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
    'membership_settings_updated'
  ));
END $$;
