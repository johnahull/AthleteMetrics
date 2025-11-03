-- Migration: Add benchmarks system (site_benchmarks, custom_benchmarks, and organization_benchmarks tables)
-- Purpose: Enable site admins to create benchmark targets and orgs to opt-in to available benchmarks
-- Context: Allows comparison of athlete performance against predefined targets with athlete attribute filtering
-- Created: 2025-11-02

-- ============================================================================
-- PART 1: CREATE SITE_BENCHMARKS TABLE (Master benchmark catalog)
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_benchmarks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_code VARCHAR(50) NOT NULL,  -- FK to site_metrics.code
  name VARCHAR(100) NOT NULL,        -- "Elite College Defender"
  description TEXT,
  benchmark_value DECIMAL(10, 3) NOT NULL,         -- Target value (e.g., 4.50 seconds)
  comparison_operator VARCHAR(10) NOT NULL DEFAULT 'lte',  -- 'lte', 'gte', 'eq'

  -- Athlete attribute filters (NULL = applies to all)
  gender VARCHAR(20),                              -- "Male", "Female", NULL (any gender)
  age_min INTEGER,                                 -- Minimum age (inclusive)
  age_max INTEGER,                                 -- Maximum age (inclusive)
  position VARCHAR(50),                            -- "Forward", "Defender", "Midfielder", "Goalkeeper"
  level VARCHAR(50),                               -- "Club", "HS", "College", "Professional"

  -- Control flags
  is_system_default BOOLEAN NOT NULL DEFAULT false,  -- Cannot be deleted
  is_active BOOLEAN NOT NULL DEFAULT true,            -- Can be globally disabled by site admin
  display_order INTEGER,

  -- Display settings
  color VARCHAR(20),                                  -- Hex color or Tailwind class
  icon VARCHAR(50),                                   -- Icon identifier

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(36),                             -- Site admin who created
  updated_at TIMESTAMP,

  -- Foreign keys
  CONSTRAINT site_benchmarks_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_benchmarks_metric_fkey FOREIGN KEY (metric_code)
    REFERENCES site_metrics(code) ON DELETE CASCADE,

  -- CHECK constraints
  CONSTRAINT site_benchmarks_comparison_operator_valid CHECK (
    comparison_operator IN ('lte', 'gte', 'eq')
  ),
  CONSTRAINT site_benchmarks_age_range_valid CHECK (
    age_min IS NULL OR age_max IS NULL OR age_min <= age_max
  ),
  CONSTRAINT site_benchmarks_gender_valid CHECK (
    gender IS NULL OR gender IN ('Male', 'Female', 'Not Specified')
  ),
  CONSTRAINT site_benchmarks_value_positive CHECK (
    benchmark_value > 0
  )
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS site_benchmarks_metric_idx ON site_benchmarks(metric_code);
CREATE INDEX IF NOT EXISTS site_benchmarks_active_idx ON site_benchmarks(is_active);
CREATE INDEX IF NOT EXISTS site_benchmarks_metric_active_idx ON site_benchmarks(metric_code, is_active);
-- Composite index for benchmark filtering (optimizes getAthleteBenchmarkStatus queries)
CREATE INDEX IF NOT EXISTS site_benchmarks_filters_idx ON site_benchmarks(metric_code, gender, level) INCLUDE (age_min, age_max, position, is_active);

-- Add comments for documentation
COMMENT ON TABLE site_benchmarks IS 'Site-level benchmark definitions (master catalog) managed by site admins';
COMMENT ON COLUMN site_benchmarks.metric_code IS 'Reference to site_metrics.code - benchmark inherits units from metric';
COMMENT ON COLUMN site_benchmarks.comparison_operator IS 'How to compare: lte (lower is better, e.g., sprint times), gte (higher is better, e.g., jump height), eq (exact match)';
COMMENT ON COLUMN site_benchmarks.gender IS 'Gender filter - NULL means applies to all genders';
COMMENT ON COLUMN site_benchmarks.age_min IS 'Minimum age filter (inclusive) - NULL means no minimum';
COMMENT ON COLUMN site_benchmarks.age_max IS 'Maximum age filter (inclusive) - NULL means no maximum';
COMMENT ON COLUMN site_benchmarks.is_system_default IS 'True for built-in benchmarks that cannot be deleted';
COMMENT ON COLUMN site_benchmarks.is_active IS 'False when benchmark is globally disabled by site admin';

-- ============================================================================
-- PART 2: CREATE CUSTOM_BENCHMARKS TABLE (Org-created benchmarks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_benchmarks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(36) NOT NULL,  -- FK to organizations.id
  metric_code VARCHAR(50) NOT NULL,      -- FK to site_metrics.code
  name VARCHAR(100) NOT NULL,
  description TEXT,
  benchmark_value DECIMAL(10, 3) NOT NULL,
  comparison_operator VARCHAR(10) NOT NULL DEFAULT 'lte',

  -- Athlete attribute filters (NULL = applies to all)
  gender VARCHAR(20),
  age_min INTEGER,
  age_max INTEGER,
  position VARCHAR(50),
  level VARCHAR(50),

  -- Control flags
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER,

  -- Display settings
  color VARCHAR(20),
  icon VARCHAR(50),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(36),                             -- Org admin who created
  updated_at TIMESTAMP,

  -- Foreign keys with cascade delete
  CONSTRAINT custom_benchmarks_org_fkey FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT custom_benchmarks_metric_fkey FOREIGN KEY (metric_code)
    REFERENCES site_metrics(code) ON DELETE CASCADE,
  CONSTRAINT custom_benchmarks_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,

  -- CHECK constraints
  CONSTRAINT custom_benchmarks_comparison_operator_valid CHECK (
    comparison_operator IN ('lte', 'gte', 'eq')
  ),
  CONSTRAINT custom_benchmarks_age_range_valid CHECK (
    age_min IS NULL OR age_max IS NULL OR age_min <= age_max
  ),
  CONSTRAINT custom_benchmarks_gender_valid CHECK (
    gender IS NULL OR gender IN ('Male', 'Female', 'Not Specified')
  ),
  CONSTRAINT custom_benchmarks_value_positive CHECK (
    benchmark_value > 0
  )
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS custom_benchmarks_org_idx ON custom_benchmarks(organization_id);
CREATE INDEX IF NOT EXISTS custom_benchmarks_metric_idx ON custom_benchmarks(metric_code);
CREATE INDEX IF NOT EXISTS custom_benchmarks_org_active_idx ON custom_benchmarks(organization_id, is_active);

-- Composite index for custom benchmark filtering (matches site_benchmarks pattern)
CREATE INDEX IF NOT EXISTS custom_benchmarks_filters_idx
ON custom_benchmarks(organization_id, metric_code, gender, level)
INCLUDE (age_min, age_max, position, is_active);

-- Add comments for documentation
COMMENT ON TABLE custom_benchmarks IS 'Organization-specific custom benchmarks created by org admins';
COMMENT ON COLUMN custom_benchmarks.organization_id IS 'Organization that owns this custom benchmark';
COMMENT ON COLUMN custom_benchmarks.metric_code IS 'Reference to site_metrics.code - benchmark inherits units from metric';

-- ============================================================================
-- PART 3: CREATE ORGANIZATION_BENCHMARKS TABLE (Org enablement of benchmarks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_benchmarks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(36) NOT NULL,
  benchmark_id VARCHAR(36) NOT NULL,
  benchmark_type VARCHAR(10) NOT NULL,  -- 'site' or 'custom'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  custom_name VARCHAR(100),              -- Org can customize benchmark name
  display_order INTEGER,                 -- Org-specific ordering
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,

  -- Foreign keys with cascade delete
  CONSTRAINT organization_benchmarks_org_fkey FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE CASCADE,

  -- CHECK constraints
  CONSTRAINT organization_benchmarks_type_valid CHECK (
    benchmark_type IN ('site', 'custom')
  ),

  -- Unique constraint: one entry per org per benchmark (composite key with type)
  CONSTRAINT organization_benchmarks_unique_org_benchmark UNIQUE (organization_id, benchmark_id, benchmark_type)
);

-- Create indexes for efficient queries
-- Note: org_benchmarks_org_idx is redundant due to leftmost prefix rule
-- org_benchmarks_org_enabled_idx covers single-column queries on organization_id
CREATE INDEX IF NOT EXISTS org_benchmarks_org_enabled_idx ON organization_benchmarks(organization_id, is_enabled);
CREATE INDEX IF NOT EXISTS org_benchmarks_benchmark_idx ON organization_benchmarks(benchmark_id, benchmark_type);

-- Unique constraint for display_order per organization (allows NULL)
CREATE UNIQUE INDEX IF NOT EXISTS org_benchmarks_display_order_unique
ON organization_benchmarks(organization_id, display_order)
WHERE display_order IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE organization_benchmarks IS 'Organization-level benchmark enablement (org opt-in to site/custom benchmarks)';
COMMENT ON COLUMN organization_benchmarks.benchmark_type IS 'Type of benchmark: site (from site_benchmarks) or custom (from custom_benchmarks)';
COMMENT ON COLUMN organization_benchmarks.is_enabled IS 'True when org has enabled this benchmark for use';
COMMENT ON COLUMN organization_benchmarks.custom_name IS 'Organization-specific custom name override (optional)';

-- ============================================================================
-- PART 4: ADD ORGANIZATION FEATURE FLAGS
-- ============================================================================

-- Add benchmarks_enabled flag to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS benchmarks_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add allow_custom_benchmarks flag to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS allow_custom_benchmarks BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.benchmarks_enabled IS 'Site admin setting: Enable/disable entire benchmarks feature for this organization';
COMMENT ON COLUMN organizations.allow_custom_benchmarks IS 'Site admin setting: Allow/disallow org admins to create custom benchmarks';

-- ============================================================================
-- PART 5: SEED DEFAULT BENCHMARKS (Examples for common metrics)
-- ============================================================================

-- Insert example benchmarks as system defaults (cannot be deleted)
-- Use INSERT ... ON CONFLICT to make idempotent (safe for re-runs)
INSERT INTO site_benchmarks (id, metric_code, name, description, benchmark_value, comparison_operator, is_system_default, is_active, display_order, color, icon, gender, age_min, age_max, level)
VALUES
  -- 10-Yard Fly Time benchmarks (lower is better)
  ('00000000-0000-0000-0000-000000000001', 'FLY10_TIME', 'Elite Speed', 'Elite-level 10-yard fly time', 1.00, 'lte', true, true, 1, 'emerald', 'Zap', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000000002', 'FLY10_TIME', 'College Level', 'College-level 10-yard fly time', 1.20, 'lte', true, true, 2, 'blue', 'Target', NULL, NULL, NULL, 'College'),

  -- Vertical Jump benchmarks (higher is better)
  ('00000000-0000-0000-0000-000000000003', 'VERTICAL_JUMP', 'Elite Power', 'Elite-level vertical jump height', 32.0, 'gte', true, true, 3, 'purple', 'TrendingUp', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000000004', 'VERTICAL_JUMP', 'College Level', 'College-level vertical jump height', 26.0, 'gte', true, true, 4, 'indigo', 'Target', NULL, NULL, NULL, 'College'),

  -- 40-Yard Dash benchmarks (lower is better)
  ('00000000-0000-0000-0000-000000000005', 'DASH_40YD', 'Elite Speed', 'Elite-level 40-yard dash time', 4.50, 'lte', true, true, 5, 'red', 'Zap', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000000006', 'DASH_40YD', 'College Level', 'College-level 40-yard dash time', 5.00, 'lte', true, true, 6, 'orange', 'Target', NULL, NULL, NULL, 'College')
ON CONFLICT (id) DO NOTHING;

-- Log seed completion
DO $$
BEGIN
  RAISE NOTICE 'Seeded 6 example benchmarks as system defaults';
END $$;

-- ============================================================================
-- PART 6: UPDATE AUDIT LOGS CONSTRAINTS (Add benchmark actions)
-- ============================================================================

-- Validate existing audit log data before modifying constraints
DO $$
DECLARE
  invalid_actions_count INTEGER;
  invalid_resource_types_count INTEGER;
BEGIN
  -- Check for invalid actions
  SELECT COUNT(*) INTO invalid_actions_count
  FROM audit_logs
  WHERE action NOT IN (
    'organization_created', 'organization_deactivated', 'organization_reactivated',
    'organization_deleted', 'organization_dependencies_viewed',
    'site_admin_access', 'site_admin_organization_access', 'user_created', 'user_updated',
    'user_deleted', 'user_role_changed', 'role_changed',
    'password_reset_unknown_email', 'email_verification_requested', 'password_change_failed',
    'privilege_restoration_blocked', 'admin_password_synced', 'privilege_restored',
    'team_created', 'team_updated', 'team_deleted', 'team_archived',
    'measurement_created', 'measurement_updated', 'measurement_deleted',
    'invitation_created', 'invitation_accepted', 'invitation_cancelled', 'invitation_resent',
    'sessions_revoked', 'zombie_sessions_cleaned', 'zombie_cleanup_failed', 'session_revocation_failed',
    'metric_created', 'metric_updated', 'metric_enabled', 'metric_disabled', 'metric_deleted',
    'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled',
    'benchmark_created', 'benchmark_updated', 'benchmark_enabled', 'benchmark_disabled', 'benchmark_deleted',
    'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
    'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated'
  );

  IF invalid_actions_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: Found % audit log entries with invalid actions. Clean up data before proceeding.', invalid_actions_count;
  END IF;

  -- Check for invalid resource types
  SELECT COUNT(*) INTO invalid_resource_types_count
  FROM audit_logs
  WHERE resource_type NOT IN (
    'organization', 'user', 'team', 'measurement', 'invitation', 'session', 'site_metric',
    'site_benchmark', 'custom_benchmark', 'organization_benchmark'
  );

  IF invalid_resource_types_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: Found % audit log entries with invalid resource types. Clean up data before proceeding.', invalid_resource_types_count;
  END IF;

  RAISE NOTICE 'Pre-validation passed: All existing audit log data is valid';
END $$;

-- Drop existing CHECK constraints
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

-- Recreate action constraint with new benchmark-related actions
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  -- Organization actions
  'organization_created', 'organization_deactivated', 'organization_reactivated',
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
  -- Benchmark management actions (NEW in 0024)
  'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled', 'benchmark_disabled',
  'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
  'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated'
));

-- Recreate resource_type constraint with new benchmark types
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
  'organization', 'user', 'team', 'measurement', 'invitation', 'session', 'site_metric',
  'site_benchmark', 'custom_benchmark', 'organization_benchmark'
));

-- Add comment for documentation
COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS 'Valid audit log actions including benchmark management (added in migration 0024)';
COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS 'Valid resource types including benchmark types (added in migration 0024)';

-- Migration complete
DO $$
BEGIN
  -- Create trigger function for cascading deletes on polymorphic relationship
  -- This ensures referential integrity for organization_benchmarks.benchmark_id
  CREATE OR REPLACE FUNCTION cleanup_org_benchmarks()
  RETURNS TRIGGER AS $trigger$
  BEGIN
    DELETE FROM organization_benchmarks
    WHERE benchmark_id = OLD.id
    AND benchmark_type = TG_ARGV[0];
    RETURN OLD;
  END;
  $trigger$ LANGUAGE plpgsql;

  -- Create triggers for cascading deletes from site_benchmarks
  CREATE TRIGGER cleanup_org_benchmarks_site
  AFTER DELETE ON site_benchmarks
  FOR EACH ROW EXECUTE FUNCTION cleanup_org_benchmarks('site');

  -- Create triggers for cascading deletes from custom_benchmarks
  CREATE TRIGGER cleanup_org_benchmarks_custom
  AFTER DELETE ON custom_benchmarks
  FOR EACH ROW EXECUTE FUNCTION cleanup_org_benchmarks('custom');

  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Migration 0024 complete: Benchmarks system initialized';
  RAISE NOTICE '- Created site_benchmarks table (master benchmark catalog)';
  RAISE NOTICE '- Created custom_benchmarks table (org-created benchmarks)';
  RAISE NOTICE '- Created organization_benchmarks table (org opt-in mechanism)';
  RAISE NOTICE '- Added benchmarks_enabled and allow_custom_benchmarks to organizations';
  RAISE NOTICE '- Seeded 6 example benchmarks as system defaults';
  RAISE NOTICE '- Updated audit_logs constraints for benchmark actions';
  RAISE NOTICE '- Added polymorphic FK triggers for referential integrity';
  RAISE NOTICE '=================================================================';
END $$;
