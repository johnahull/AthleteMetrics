-- Migration 0029 Down: Remove display_order defaults
-- Description: Reverts display_order columns to allow NULL without defaults
-- Created: 2025-11-04

-- Remove default value for site_benchmarks.display_order
ALTER TABLE site_benchmarks
ALTER COLUMN display_order DROP DEFAULT;

-- Remove default value for custom_benchmarks.display_order
ALTER TABLE custom_benchmarks
ALTER COLUMN display_order DROP DEFAULT;

-- Remove default value for organization_benchmarks.display_order
ALTER TABLE organization_benchmarks
ALTER COLUMN display_order DROP DEFAULT;

-- Remove comments
COMMENT ON COLUMN site_benchmarks.display_order IS NULL;
COMMENT ON COLUMN custom_benchmarks.display_order IS NULL;
COMMENT ON COLUMN organization_benchmarks.display_order IS NULL;
