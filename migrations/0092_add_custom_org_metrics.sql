-- Migration: Add custom organization metrics table
-- Feature: Organization Custom Metrics
-- Description: Allows organizations to create private, custom metrics with full configuration

-- Create custom_org_metrics table
CREATE TABLE IF NOT EXISTS custom_org_metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Metric identity
  code VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  unit VARCHAR(20),
  metric_type TEXT NOT NULL DEFAULT 'lower_is_better'
    CHECK (metric_type IN ('lower_is_better', 'higher_is_better', 'tracking')),
  description TEXT,

  -- Validation rules
  validation_min DECIMAL(10, 3),
  validation_max DECIMAL(10, 3),
  decimal_precision INTEGER NOT NULL DEFAULT 3,

  -- Sport associations
  sport_associations TEXT[],

  -- Derived metric configuration
  is_derived BOOLEAN NOT NULL DEFAULT false,
  formula TEXT,
  dependent_metrics TEXT[],
  calculation_config JSONB,

  -- Display settings
  display_order INTEGER DEFAULT 999,
  color VARCHAR(20),
  icon VARCHAR(50),

  -- Lifecycle (soft delete)
  is_active BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMP,

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP,

  -- Constraints
  UNIQUE(organization_id, code)
);

-- Add CHECK constraints idempotently
-- Ensure non-derived metrics have a unit (how do you measure without units?)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_non_derived_has_unit'
  ) THEN
    ALTER TABLE custom_org_metrics
    ADD CONSTRAINT check_non_derived_has_unit
    CHECK (is_derived = true OR unit IS NOT NULL);
  END IF;
END $$;

-- Ensure derived metrics have a formula
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_derived_has_formula'
  ) THEN
    ALTER TABLE custom_org_metrics
    ADD CONSTRAINT check_derived_has_formula
    CHECK (is_derived = false OR formula IS NOT NULL);
  END IF;
END $$;

-- Ensure validation_min < validation_max
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_validation_min_max'
  ) THEN
    ALTER TABLE custom_org_metrics
    ADD CONSTRAINT check_validation_min_max
    CHECK (validation_min IS NULL OR validation_max IS NULL OR validation_min < validation_max);
  END IF;
END $$;

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_custom_org_metrics_org_active ON custom_org_metrics(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_custom_org_metrics_code ON custom_org_metrics(code);
CREATE INDEX IF NOT EXISTS idx_custom_org_metrics_derived ON custom_org_metrics(is_derived) WHERE is_derived = true;

-- Comments for documentation
COMMENT ON TABLE custom_org_metrics IS 'Organization-private custom metrics (org-scoped, not shared across orgs)';
COMMENT ON COLUMN custom_org_metrics.code IS 'Format: ORG_{orgId}_METRIC_NAME (auto-generated from label)';
COMMENT ON COLUMN custom_org_metrics.archived_at IS 'Soft delete timestamp - preserves historical measurements';
COMMENT ON COLUMN custom_org_metrics.calculation_config IS 'JSON config for derived metrics: {dateMatchStrategy, maxDateDifference, missingSourceBehavior}';
