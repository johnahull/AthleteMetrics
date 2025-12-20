-- Migration: Add derived metrics support
-- Description: Adds columns to site_metrics and measurements tables to support
--              derived metrics (metrics calculated from other metrics using formulas)
--              Examples: Top speed = 10 / fly10_time * 2.045, Block reach = standing_reach + block_jump

-- ============================================
-- SITE METRICS TABLE - Add derived metric configuration
-- ============================================

-- Add isDerived flag (defaults to false for existing metrics)
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS is_derived BOOLEAN NOT NULL DEFAULT false;

-- Add formula for calculation (e.g., "10 / fly10_time * 2.045")
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS formula TEXT;

-- Add dependent metrics array (metric codes this formula depends on)
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS dependent_metrics TEXT[];

-- Add calculation configuration as JSONB
-- Structure: { dateMatchStrategy, maxDateDifference?, missingSourceBehavior, constants? }
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS calculation_config JSONB;

-- Add comments for documentation
COMMENT ON COLUMN site_metrics.is_derived IS 'Whether this metric is calculated from other metrics using a formula';
COMMENT ON COLUMN site_metrics.formula IS 'Formula for calculation using mathjs syntax (e.g., "10 / fly10_time * 2.045"). Metric codes must be lowercase with underscores.';
COMMENT ON COLUMN site_metrics.dependent_metrics IS 'Array of metric codes this formula depends on (e.g., ["FLY10_TIME"])';
COMMENT ON COLUMN site_metrics.calculation_config IS 'Configuration for derived metric calculation: { dateMatchStrategy: "same_date" | "latest_before" | "closest", maxDateDifference?: number, missingSourceBehavior: "skip" | "error", constants?: Record<string, number> }';

-- Add index for querying derived metrics
CREATE INDEX IF NOT EXISTS idx_site_metrics_is_derived ON site_metrics(is_derived) WHERE is_derived = true;

-- ============================================
-- MEASUREMENTS TABLE - Add calculated measurement tracking
-- ============================================

-- Add isCalculated flag (defaults to false for existing measurements)
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS is_calculated BOOLEAN NOT NULL DEFAULT false;

-- Add source measurement IDs array (measurements used in calculation)
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS calculated_from_measurement_ids TEXT[];

-- Add calculation metadata as JSONB
-- Structure: { formula, sourceValues, calculatedAt }
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS calculation_metadata JSONB;

-- Add comments for documentation
COMMENT ON COLUMN measurements.is_calculated IS 'Whether this measurement was automatically calculated from other measurements';
COMMENT ON COLUMN measurements.calculated_from_measurement_ids IS 'Array of measurement IDs used as source values for calculation';
COMMENT ON COLUMN measurements.calculation_metadata IS 'Metadata about calculation: { formula: string, sourceValues: Record<string, number>, calculatedAt: string (ISO 8601) }';

-- Add index for querying calculated measurements
CREATE INDEX IF NOT EXISTS idx_measurements_is_calculated ON measurements(is_calculated) WHERE is_calculated = true;

-- Add composite index for finding calculated measurements by source
CREATE INDEX IF NOT EXISTS idx_measurements_calculated_from ON measurements USING GIN (calculated_from_measurement_ids) WHERE is_calculated = true;
