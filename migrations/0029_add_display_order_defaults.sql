-- Migration 0029: Add default values for display_order columns
-- Description: Sets default value of 999 for display_order to ensure predictable sorting
-- Created: 2025-11-04
-- Dependencies: 0024_add_benchmarks_system.sql

-- Add default value for site_benchmarks.display_order
-- NULL values will sort last (999), new benchmarks get 999 by default
ALTER TABLE site_benchmarks
ALTER COLUMN display_order SET DEFAULT 999;

-- Add default value for custom_benchmarks.display_order
ALTER TABLE custom_benchmarks
ALTER COLUMN display_order SET DEFAULT 999;

-- Add default value for organization_benchmarks.display_order
ALTER TABLE organization_benchmarks
ALTER COLUMN display_order SET DEFAULT 999;

-- Update existing NULL values to 999 for predictable ordering
UPDATE site_benchmarks SET display_order = 999 WHERE display_order IS NULL;
UPDATE custom_benchmarks SET display_order = 999 WHERE display_order IS NULL;
UPDATE organization_benchmarks SET display_order = 999 WHERE display_order IS NULL;

-- Add NOT NULL constraints after backfilling NULL values
ALTER TABLE site_benchmarks ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE custom_benchmarks ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE organization_benchmarks ALTER COLUMN display_order SET NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN site_benchmarks.display_order IS 'Display order for UI sorting. Default 999 sorts last. Lower values appear first.';
COMMENT ON COLUMN custom_benchmarks.display_order IS 'Display order for UI sorting. Default 999 sorts last. Lower values appear first.';
COMMENT ON COLUMN organization_benchmarks.display_order IS 'Display order for UI sorting within organization. Default 999 sorts last. Lower values appear first.';
