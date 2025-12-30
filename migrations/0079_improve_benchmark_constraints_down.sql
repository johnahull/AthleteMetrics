-- Migration 0079 DOWN: Rollback benchmark constraint improvements
-- Reverts changes made in 0079_improve_benchmark_constraints.sql
-- IDEMPOTENT: Safe to run multiple times

DO $$
BEGIN
  -- 1. DROP MUTUAL EXCLUSIVITY CONSTRAINTS
  ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_value_or_range_exclusive;
  ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS custom_benchmarks_value_or_range_exclusive;

  -- 2. RESTORE ORIGINAL CONSTRAINT NAMES (if using new names)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'site_benchmarks_tier_fields'
  ) THEN
    ALTER TABLE site_benchmarks RENAME CONSTRAINT site_benchmarks_tier_fields
      TO chk_tier_fields;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'custom_benchmarks_tier_fields'
  ) THEN
    ALTER TABLE custom_benchmarks RENAME CONSTRAINT custom_benchmarks_tier_fields
      TO chk_tier_fields_custom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'site_benchmarks_value_or_range'
  ) THEN
    ALTER TABLE site_benchmarks RENAME CONSTRAINT site_benchmarks_value_or_range
      TO chk_benchmark_value_or_range;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'custom_benchmarks_value_or_range'
  ) THEN
    ALTER TABLE custom_benchmarks RENAME CONSTRAINT custom_benchmarks_value_or_range
      TO chk_custom_benchmark_value_or_range;
  END IF;

  -- 3. REVERT DECIMAL PRECISION (3 decimals → 2 decimals)
  -- WARNING: This may cause data loss if values have 3 decimal places
  -- PostgreSQL will round values during conversion
  ALTER TABLE site_benchmarks
    ALTER COLUMN min_value TYPE DECIMAL(10, 2),
    ALTER COLUMN max_value TYPE DECIMAL(10, 2);

  ALTER TABLE custom_benchmarks
    ALTER COLUMN min_value TYPE DECIMAL(10, 2),
    ALTER COLUMN max_value TYPE DECIMAL(10, 2);

  -- 4. DROP TIER ORDER UNIQUENESS CONSTRAINTS
  DROP INDEX IF EXISTS site_benchmarks_tier_group_order_unique;
  DROP INDEX IF EXISTS custom_benchmarks_tier_group_order_unique;

END $$;
