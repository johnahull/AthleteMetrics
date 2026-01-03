-- Migration: Add custom organization metrics table
-- Feature: Organization Custom Metrics
-- Description: Allows organizations to create private, custom metrics with full configuration

-- Create custom_org_metrics table
CREATE TABLE custom_org_metrics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Indexes for query performance
CREATE INDEX idx_custom_org_metrics_org ON custom_org_metrics(organization_id);
CREATE INDEX idx_custom_org_metrics_org_active ON custom_org_metrics(organization_id, is_active);
CREATE INDEX idx_custom_org_metrics_code ON custom_org_metrics(code);
CREATE INDEX idx_custom_org_metrics_derived ON custom_org_metrics(is_derived) WHERE is_derived = true;

-- Comments for documentation
COMMENT ON TABLE custom_org_metrics IS 'Organization-private custom metrics (org-scoped, not shared across orgs)';
COMMENT ON COLUMN custom_org_metrics.code IS 'Format: ORG_{orgId}_METRIC_NAME (auto-generated from label)';
COMMENT ON COLUMN custom_org_metrics.archived_at IS 'Soft delete timestamp - preserves historical measurements';
COMMENT ON COLUMN custom_org_metrics.calculation_config IS 'JSON config for derived metrics: {dateMatchStrategy, maxDateDifference, missingSourceBehavior}';
