-- Migration 0077 DOWN: Remove tier grouping support
-- Removes tier_group_id, tier_order, tier_name, and tier_color columns
-- IDEMPOTENT: Safe to run multiple times

DO $$
BEGIN
  -- Drop indexes
  DROP INDEX IF EXISTS site_benchmarks_tier_group_idx;
  DROP INDEX IF EXISTS custom_benchmarks_tier_group_idx;

  -- Drop constraints
  ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS chk_tier_fields;
  ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS chk_tier_fields_custom;

  -- Drop tier columns from site_benchmarks
  ALTER TABLE site_benchmarks
    DROP COLUMN IF EXISTS tier_group_id,
    DROP COLUMN IF EXISTS tier_order,
    DROP COLUMN IF EXISTS tier_name,
    DROP COLUMN IF EXISTS tier_color;

  -- Drop tier columns from custom_benchmarks
  ALTER TABLE custom_benchmarks
    DROP COLUMN IF EXISTS tier_group_id,
    DROP COLUMN IF EXISTS tier_order,
    DROP COLUMN IF EXISTS tier_name,
    DROP COLUMN IF EXISTS tier_color;
END $$;
