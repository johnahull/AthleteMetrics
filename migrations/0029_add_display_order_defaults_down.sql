-- Migration 0029 Down: Remove display_order defaults and NOT NULL constraints
-- Description: Reverts display_order columns to allow NULL without defaults
-- Created: 2025-11-04

-- Validation: Check for NULL values before removing constraints
DO $$
DECLARE
  site_nulls INTEGER;
  custom_nulls INTEGER;
  org_nulls INTEGER;
BEGIN
  SELECT COUNT(*) INTO site_nulls FROM site_benchmarks WHERE display_order IS NULL;
  SELECT COUNT(*) INTO custom_nulls FROM custom_benchmarks WHERE display_order IS NULL;
  SELECT COUNT(*) INTO org_nulls FROM organization_benchmarks WHERE display_order IS NULL;

  IF site_nulls > 0 OR custom_nulls > 0 OR org_nulls > 0 THEN
    RAISE WARNING 'Rollback will allow NULL display_order values. Current NULL counts: site=%, custom=%, org=%',
      site_nulls, custom_nulls, org_nulls;
    RAISE WARNING 'Application code may need updates to handle NULL display_order values';
  END IF;
END $$;

-- Remove NOT NULL constraints first
ALTER TABLE site_benchmarks ALTER COLUMN display_order DROP NOT NULL;
ALTER TABLE custom_benchmarks ALTER COLUMN display_order DROP NOT NULL;
ALTER TABLE organization_benchmarks ALTER COLUMN display_order DROP NOT NULL;

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
