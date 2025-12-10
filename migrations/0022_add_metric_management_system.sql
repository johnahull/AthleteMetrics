-- Migration: Add metric management system (site_metrics and organization_metrics tables)
-- Purpose: Enable site admins to create custom metrics and orgs to opt-in to available metrics
-- Context: Replaces hardcoded metric enums with database-driven metric catalog
-- Created: 2025-11-01

-- ============================================================================
-- PART 1: CREATE SITE_METRICS TABLE (Master metric catalog)
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,  -- "FLY10_TIME", "CUSTOM_SPRINT_20M"
  label VARCHAR(100) NOT NULL,       -- "10-Yard Fly Time"
  category VARCHAR(50),               -- "speed", "agility", "strength", "power"
  unit VARCHAR(20),                   -- "s", "in", "mph", "m"
  lower_is_better BOOLEAN NOT NULL DEFAULT true,
  is_system_default BOOLEAN NOT NULL DEFAULT false,  -- Cannot be deleted
  is_active BOOLEAN NOT NULL DEFAULT true,            -- Can be globally disabled by site admin
  display_order INTEGER,
  description TEXT,

  -- Advanced properties for sport-specific configuration
  sport_associations TEXT[],                             -- ["Soccer", "Basketball"]
  validation_min DECIMAL(10, 3),                         -- Minimum valid value
  validation_max DECIMAL(10, 3),                         -- Maximum valid value
  decimal_precision INTEGER NOT NULL DEFAULT 3,          -- Decimal places for display

  -- Display settings
  color VARCHAR(20),                                     -- Hex color or Tailwind class
  icon VARCHAR(50),                                      -- Icon identifier

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(36),                                -- Site admin who created
  updated_at TIMESTAMP,

  -- Foreign key to users table (on delete set null to preserve metric history)
  CONSTRAINT site_metrics_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,

  -- CHECK constraints
  CONSTRAINT site_metrics_code_format CHECK (
    code ~ '^[A-Z0-9_]+$' AND code !~ '^_'
  ),
  CONSTRAINT site_metrics_decimal_precision_range CHECK (
    decimal_precision >= 0 AND decimal_precision <= 10
  )
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS site_metrics_active_idx ON site_metrics(is_active);
CREATE INDEX IF NOT EXISTS site_metrics_code_idx ON site_metrics(code);
CREATE INDEX IF NOT EXISTS site_metrics_category_idx ON site_metrics(category);

-- Add comments for documentation
COMMENT ON TABLE site_metrics IS 'Site-level metric definitions (master catalog) managed by site admins';
COMMENT ON COLUMN site_metrics.code IS 'Unique metric code (e.g., FLY10_TIME, CUSTOM_SPRINT_20M)';
COMMENT ON COLUMN site_metrics.is_system_default IS 'True for built-in metrics that cannot be deleted';
COMMENT ON COLUMN site_metrics.is_active IS 'False when metric is globally disabled by site admin';

-- ============================================================================
-- PART 2: CREATE ORGANIZATION_METRICS TABLE (Org opt-in to site metrics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(36) NOT NULL,
  metric_code VARCHAR(50) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER,              -- Org-specific ordering
  custom_label VARCHAR(100),          -- Org can customize label
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,

  -- Foreign keys with cascade delete
  CONSTRAINT organization_metrics_org_fkey FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT organization_metrics_metric_fkey FOREIGN KEY (metric_code)
    REFERENCES site_metrics(code) ON DELETE CASCADE,

  -- Unique constraint: one entry per org per metric
  CONSTRAINT organization_metrics_unique_org_metric UNIQUE (organization_id, metric_code)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS org_metrics_org_idx ON organization_metrics(organization_id);
CREATE INDEX IF NOT EXISTS org_metrics_org_enabled_idx ON organization_metrics(organization_id, is_enabled);

-- Add comments for documentation
COMMENT ON TABLE organization_metrics IS 'Organization-level metric enablement (org opt-in to site metrics)';
COMMENT ON COLUMN organization_metrics.is_enabled IS 'True when org has enabled this metric for use';
COMMENT ON COLUMN organization_metrics.custom_label IS 'Organization-specific custom label override (optional)';

-- ============================================================================
-- PART 3: SEED DEFAULT METRICS (8 existing metrics)
-- ============================================================================

-- Insert default metrics as system defaults (cannot be deleted)
-- Use ON CONFLICT DO NOTHING for idempotency (safe to re-run)
--
-- COMPATIBILITY NOTE: This migration handles both schema versions for two scenarios:
-- 1. Sequential migration execution: Migration 0022 runs BEFORE 0065, so metric_type doesn't exist yet
-- 2. db:push compatibility: Users running `npm run db:push` skip migrations and apply schema directly,
--    which includes metric_type from packages/shared/schema.ts
-- The conditional logic detects which schema version exists and seeds data accordingly.
DO $$
DECLARE
  has_metric_type BOOLEAN;
BEGIN
  -- Check if metric_type column exists (post-migration 0065 OR db:push)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_metrics' AND column_name = 'metric_type'
  ) INTO has_metric_type;

  IF has_metric_type THEN
    -- New schema with metric_type column
    INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, description, sport_associations, decimal_precision, color, icon)
    VALUES
      ('FLY10_TIME', '10-Yard Fly Time', 'speed', 's', 'lower_is_better', true, true, 1,
       'Time to cover 10 yards after a flying start, measuring maximum velocity.',
       ARRAY['Soccer'], 3, 'blue', 'Clock'),
      ('VERTICAL_JUMP', 'Vertical Jump', 'power', 'in', 'higher_is_better', true, true, 2,
       'Maximum vertical jump height in inches, measuring explosive leg power.',
       ARRAY['Soccer'], 1, 'purple', 'ArrowUp'),
      ('AGILITY_505', '5-0-5 Agility', 'agility', 's', 'lower_is_better', true, true, 3,
       '5-0-5 agility test: sprint 5 yards, turn 180 degrees, sprint 5 yards back.',
       ARRAY['Soccer'], 3, 'green', 'Zap'),
      ('AGILITY_5105', '5-10-5 Agility', 'agility', 's', 'lower_is_better', true, true, 4,
       '5-10-5 agility test (Pro Agility): sprint 5 yards, turn 180, sprint 10 yards, turn 180, sprint 5 yards.',
       ARRAY['Soccer'], 3, 'yellow', 'Zap'),
      ('T_TEST', 'T-Test Agility', 'agility', 's', 'lower_is_better', true, true, 5,
       'T-test agility drill: forward sprint, lateral shuffles, and backward sprint in T-pattern.',
       ARRAY['Soccer'], 3, 'red', 'Move'),
      ('DASH_40YD', '40-Yard Dash', 'speed', 's', 'lower_is_better', true, true, 6,
       'Time to sprint 40 yards from a stationary start, measuring acceleration and top-end speed.',
       ARRAY['Soccer'], 3, 'indigo', 'Timer'),
      ('RSI', 'Reactive Strength Index', 'power', '', 'higher_is_better', true, true, 7,
       'Ratio of jump height to ground contact time, measuring elastic leg power and explosiveness.',
       ARRAY['Soccer'], 2, 'orange', 'TrendingUp'),
      ('TOP_SPEED', 'Top Speed', 'speed', 'mph', 'higher_is_better', true, true, 8,
       'Maximum running velocity in miles per hour.',
       ARRAY['Soccer'], 2, 'teal', 'Gauge')
    ON CONFLICT (code) DO NOTHING;
  ELSE
    -- Old schema with lower_is_better column
    INSERT INTO site_metrics (code, label, category, unit, lower_is_better, is_system_default, is_active, display_order, description, sport_associations, decimal_precision, color, icon)
    VALUES
      ('FLY10_TIME', '10-Yard Fly Time', 'speed', 's', true, true, true, 1,
       'Time to cover 10 yards after a flying start, measuring maximum velocity.',
       ARRAY['Soccer'], 3, 'blue', 'Clock'),
      ('VERTICAL_JUMP', 'Vertical Jump', 'power', 'in', false, true, true, 2,
       'Maximum vertical jump height in inches, measuring explosive leg power.',
       ARRAY['Soccer'], 1, 'purple', 'ArrowUp'),
      ('AGILITY_505', '5-0-5 Agility', 'agility', 's', true, true, true, 3,
       '5-0-5 agility test: sprint 5 yards, turn 180 degrees, sprint 5 yards back.',
       ARRAY['Soccer'], 3, 'green', 'Zap'),
      ('AGILITY_5105', '5-10-5 Agility', 'agility', 's', true, true, true, 4,
       '5-10-5 agility test (Pro Agility): sprint 5 yards, turn 180, sprint 10 yards, turn 180, sprint 5 yards.',
       ARRAY['Soccer'], 3, 'yellow', 'Zap'),
      ('T_TEST', 'T-Test Agility', 'agility', 's', true, true, true, 5,
       'T-test agility drill: forward sprint, lateral shuffles, and backward sprint in T-pattern.',
       ARRAY['Soccer'], 3, 'red', 'Move'),
      ('DASH_40YD', '40-Yard Dash', 'speed', 's', true, true, true, 6,
       'Time to sprint 40 yards from a stationary start, measuring acceleration and top-end speed.',
       ARRAY['Soccer'], 3, 'indigo', 'Timer'),
      ('RSI', 'Reactive Strength Index', 'power', '', false, true, true, 7,
       'Ratio of jump height to ground contact time, measuring elastic leg power and explosiveness.',
       ARRAY['Soccer'], 2, 'orange', 'TrendingUp'),
      ('TOP_SPEED', 'Top Speed', 'speed', 'mph', false, true, true, 8,
       'Maximum running velocity in miles per hour.',
       ARRAY['Soccer'], 2, 'teal', 'Gauge')
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;

-- Log seed completion
DO $$
BEGIN
  RAISE NOTICE 'Seeded 8 default metrics as system defaults';
END $$;

-- ============================================================================
-- PART 4: BACKFILL ORGANIZATION_METRICS (Enable all defaults for all orgs)
-- ============================================================================

-- Backfill organization_metrics to enable all system default metrics for all existing organizations
-- This ensures all organizations have access to the 8 default metrics immediately after migration
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled, display_order, created_at)
SELECT
  o.id AS organization_id,
  sm.code AS metric_code,
  true AS is_enabled,
  sm.display_order,
  NOW() AS created_at
FROM organizations o
CROSS JOIN site_metrics sm
WHERE sm.is_system_default = true
  AND sm.is_active = true
  -- Only insert if not already exists (for idempotency)
  AND NOT EXISTS (
    SELECT 1 FROM organization_metrics om
    WHERE om.organization_id = o.id
      AND om.metric_code = sm.code
  );

-- Log backfill completion
DO $$
DECLARE
  total_orgs INTEGER;
  total_metrics INTEGER;
  total_inserted INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_orgs FROM organizations;
  SELECT COUNT(*) INTO total_metrics FROM site_metrics WHERE is_system_default = true AND is_active = true;
  SELECT COUNT(*) INTO total_inserted FROM organization_metrics;

  RAISE NOTICE 'Backfill complete: % organizations × % default metrics = % organization_metrics entries',
    total_orgs, total_metrics, total_inserted;
END $$;

-- ============================================================================
-- PART 5: ADD MEASUREMENT VALIDATION (Future-proofing)
-- ============================================================================

-- Note: We do NOT add a CHECK constraint to measurements.metric yet because:
-- 1. The application code still uses hardcoded enums for validation
-- 2. Adding it now would break existing functionality
-- 3. We'll add it in a future migration after updating all application code
--
-- Future migration will add:
-- ALTER TABLE measurements ADD CONSTRAINT measurements_valid_metric_code
--   CHECK (metric IN (SELECT code FROM site_metrics WHERE is_active = true));
--
-- This constraint will be added after:
-- - Updating measurement form validation to query organization_metrics
-- - Updating API validation to use dynamic metric list
-- - Updating analytics queries to filter by org-enabled metrics

COMMENT ON COLUMN measurements.metric IS 'Metric code (will be validated against site_metrics in future migration)';

-- Migration complete
DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Migration 0022 complete: Metric management system initialized';
  RAISE NOTICE '- Created site_metrics table (master metric catalog)';
  RAISE NOTICE '- Created organization_metrics table (org opt-in mechanism)';
  RAISE NOTICE '- Seeded 8 default metrics as system defaults';
  RAISE NOTICE '- Backfilled organization_metrics for all existing organizations';
  RAISE NOTICE '=================================================================';
END $$;
