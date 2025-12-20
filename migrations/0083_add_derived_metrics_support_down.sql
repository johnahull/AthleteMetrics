-- Migration: Rollback derived metrics support
-- Description: Removes columns added for derived metrics feature from
--              site_metrics and measurements tables

-- ============================================
-- MEASUREMENTS TABLE - Remove calculated measurement tracking
-- ============================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_measurements_calculated_from;
DROP INDEX IF EXISTS idx_measurements_is_calculated;

-- Drop columns
ALTER TABLE measurements DROP COLUMN IF EXISTS calculation_metadata;
ALTER TABLE measurements DROP COLUMN IF EXISTS calculated_from_measurement_ids;
ALTER TABLE measurements DROP COLUMN IF EXISTS is_calculated;

-- ============================================
-- SITE METRICS TABLE - Remove derived metric configuration
-- ============================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_site_metrics_is_derived;

-- Drop columns
ALTER TABLE site_metrics DROP COLUMN IF EXISTS calculation_config;
ALTER TABLE site_metrics DROP COLUMN IF EXISTS dependent_metrics;
ALTER TABLE site_metrics DROP COLUMN IF EXISTS formula;
ALTER TABLE site_metrics DROP COLUMN IF EXISTS is_derived;
