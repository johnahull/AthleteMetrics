-- Migration: Add missing schema elements
-- Adds columns and tables that exist in the Drizzle schema but were never
-- given a corresponding SQL migration:
--   1. sport column on site_benchmarks
--   2. sport column on custom_benchmarks
--   3. push_notifications_enabled column on site_settings
--   4. archived_at column on reports
--   5. custom_org_metrics table (full table + indexes)

-- 1. Add sport column to site_benchmarks
ALTER TABLE site_benchmarks
  ADD COLUMN IF NOT EXISTS sport VARCHAR(50);

-- 2. Add sport column to custom_benchmarks
ALTER TABLE custom_benchmarks
  ADD COLUMN IF NOT EXISTS sport VARCHAR(50);

-- 3. Add push_notifications_enabled to site_settings
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN NOT NULL DEFAULT true;

-- 4. Add archived_at to reports
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS reports_archived_at_idx ON reports (archived_at);

-- 5. Create custom_org_metrics table
CREATE TABLE IF NOT EXISTS custom_org_metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Metric identity (mirrors site_metrics structure)
  code VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  unit VARCHAR(20),
  metric_type TEXT NOT NULL DEFAULT 'lower_is_better',
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

  CONSTRAINT custom_org_metrics_org_code_unique UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS custom_org_metrics_org_active_idx
  ON custom_org_metrics (organization_id, is_active);

CREATE INDEX IF NOT EXISTS custom_org_metrics_code_idx
  ON custom_org_metrics (code);

CREATE INDEX IF NOT EXISTS custom_org_metrics_is_derived_idx
  ON custom_org_metrics (is_derived)
  WHERE is_derived = true;
