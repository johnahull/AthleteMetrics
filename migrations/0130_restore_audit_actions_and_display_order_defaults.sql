-- Migration 0130: Restore audit_logs CHECK constraints and display_order defaults
--
-- Forward-only convergence migration. Asserts the intended end-state of two
-- prior migrations (0029 and the audit-action chain culminating in 0114/0122)
-- which can be rolled back inadvertently when a `_down.sql` file is applied.
--
-- Historical root cause:
--   `scripts/apply-manual-migrations.js` previously did not filter `_down.sql`
--   files during discovery. The filter at line 45 of the current script
--   (`if (file.endsWith('_down.sql')) return false`) is the regression
--   prevention. Any DB that ran the script in the unfiltered window may have
--   had `0023_add_metric_audit_actions_down`, `0029_add_display_order_defaults_down`,
--   or other _down migrations applied alongside their forward counterparts.
--   Because subsequent forward migrations are recorded in `manual_migrations`,
--   they will not re-apply on top, leaving the schema stuck in a partially-rolled-back
--   state.
--
-- This migration is designed to be a **no-op on prod/staging** where the
-- schema is already correct, and a **convergence operation on drifted DBs**.
--
-- Scope:
--   A. Re-assert `display_order` DEFAULT 999 + NOT NULL on three benchmark tables
--      (mirrors `0029_add_display_order_defaults.sql`).
--   B. Re-define `audit_logs_action_valid` with the canonical action list
--      (verbatim from `0122_add_sprint_fv_module_toggled_audit_action.sql`).
--   C. Re-define `audit_logs_resource_type_valid` with the canonical resource_type
--      list (verbatim from `0114_add_parent_unlink_audit_action.sql`; that file's
--      internal header says "Migration 0109" — a pre-existing numbering inconsistency).
--
-- All operations are idempotent: re-running this migration on a clean DB
-- produces the same end-state without observable change.
--
-- Lock behavior:
--   Sections B and C use plain `ADD CONSTRAINT` (without NOT VALID).
--   This acquires AccessExclusiveLock and performs a full sequential scan of
--   audit_logs to validate all existing rows. On prod/staging where the
--   constraint definition is byte-identical to the current state, all rows
--   already conform so the scan completes quickly — but it still scans every
--   row; "zero rows to scan" would be wrong. Schedule this migration in a
--   low-traffic window if audit_logs is large.
--   Note: the ShareUpdateExclusiveLock benefit of `ADD … NOT VALID; VALIDATE`
--   only applies when the two steps run in *separate* transactions. Using that
--   pattern inside a single sql.begin() provides no lock-duration reduction
--   (the AccessExclusiveLock is held from DROP+ADD through the end of the
--   transaction regardless), so plain `ADD CONSTRAINT` is used here to avoid
--   implying a lock-reduction technique that is not active.

-- ============================================================================
-- Section A — display_order defaults on three benchmark tables
-- ============================================================================
-- Backfill any NULL display_order values to 999 (idempotent — affects 0 rows
-- on a clean DB).
UPDATE site_benchmarks         SET display_order = 999 WHERE display_order IS NULL;
UPDATE custom_benchmarks       SET display_order = 999 WHERE display_order IS NULL;
UPDATE organization_benchmarks SET display_order = 999 WHERE display_order IS NULL;

-- Re-assert default + NOT NULL (no-op when already in this state).
ALTER TABLE site_benchmarks         ALTER COLUMN display_order SET DEFAULT 999;
ALTER TABLE custom_benchmarks       ALTER COLUMN display_order SET DEFAULT 999;
ALTER TABLE organization_benchmarks ALTER COLUMN display_order SET DEFAULT 999;

ALTER TABLE site_benchmarks         ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE custom_benchmarks       ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE organization_benchmarks ALTER COLUMN display_order SET NOT NULL;

-- Restore documentation comments (mirrors 0029 lines 30-32).
COMMENT ON COLUMN site_benchmarks.display_order
  IS 'Display order for UI sorting. Default 999 sorts last. Lower values appear first.';
COMMENT ON COLUMN custom_benchmarks.display_order
  IS 'Display order for UI sorting. Default 999 sorts last. Lower values appear first.';
COMMENT ON COLUMN organization_benchmarks.display_order
  IS 'Display order for UI sorting within organization. Default 999 sorts last. Lower values appear first.';

-- ============================================================================
-- Section B — audit_logs_action_valid (canonical list from migration 0122)
-- ============================================================================
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
    'profile_merge'
));

COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS
  'Valid audit log actions — full canonical list as of migration 0122; restored by 0130 after _down rollback drift.';

-- ============================================================================
-- Section C — audit_logs_resource_type_valid (canonical list from migration 0114)
-- ============================================================================
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
    'site_benchmarks'        -- services/organization-type-service.ts:398 (plural — coexists with site_benchmark)
));

COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS
  'Valid audit log resource_type values — full canonical list as of migration 0114; restored by 0130.';

-- ============================================================================
-- Section D — verification (NOTICE only; non-blocking)
-- ============================================================================
DO $$
DECLARE
  v_action_count        INTEGER;
  v_resource_type_count INTEGER;
  v_so_default          TEXT;
  v_co_default          TEXT;
  v_oo_default          TEXT;
  v_so_nullable         TEXT;
  v_co_nullable         TEXT;
  v_oo_nullable         TEXT;
BEGIN
  -- Approximate count of CHECK list members (split by commas in pg_get_constraintdef).
  -- Used as a sanity signal in NOTICE output, not a strict assertion.
  SELECT array_length(string_to_array(pg_get_constraintdef(oid), ','), 1)
    INTO v_action_count
    FROM pg_constraint WHERE conname = 'audit_logs_action_valid';
  SELECT array_length(string_to_array(pg_get_constraintdef(oid), ','), 1)
    INTO v_resource_type_count
    FROM pg_constraint WHERE conname = 'audit_logs_resource_type_valid';

  SELECT column_default, is_nullable INTO v_so_default, v_so_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='site_benchmarks'         AND column_name='display_order';
  SELECT column_default, is_nullable INTO v_co_default, v_co_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='custom_benchmarks'       AND column_name='display_order';
  SELECT column_default, is_nullable INTO v_oo_default, v_oo_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organization_benchmarks' AND column_name='display_order';

  RAISE NOTICE 'Migration 0130 complete. action list ~% items; resource_type list ~% items. display_order — site=(default %, nullable %), custom=(default %, nullable %), org=(default %, nullable %).',
    v_action_count, v_resource_type_count,
    v_so_default, v_so_nullable,
    v_co_default, v_co_nullable,
    v_oo_default, v_oo_nullable;
END $$;
