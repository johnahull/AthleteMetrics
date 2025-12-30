-- Migration 0078 DOWN: Restore benchmark_value NOT NULL constraint
-- DEPENDS ON: Migration 0076 (which added min_value/max_value columns)
-- WARNING: This will fail if any rows have NULL benchmark_value
-- IDEMPOTENT: Safe to run multiple times

DO $$
BEGIN
  -- Check if any rows have NULL benchmark_value (safety check)
  IF EXISTS (SELECT 1 FROM site_benchmarks WHERE benchmark_value IS NULL) THEN
    RAISE EXCEPTION 'Cannot restore NOT NULL constraint on site_benchmarks.benchmark_value: NULL values exist. Clean up data before rolling back.';
  END IF;

  IF EXISTS (SELECT 1 FROM custom_benchmarks WHERE benchmark_value IS NULL) THEN
    RAISE EXCEPTION 'Cannot restore NOT NULL constraint on custom_benchmarks.benchmark_value: NULL values exist. Clean up data before rolling back.';
  END IF;

  -- Drop check constraints added in 0078
  ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS chk_benchmark_value_or_range;
  ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS chk_custom_benchmark_value_or_range;

  -- Restore NOT NULL constraint on benchmark_value
  -- Only runs if no NULL values exist (checked above)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks'
    AND column_name = 'benchmark_value'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE site_benchmarks ALTER COLUMN benchmark_value SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_benchmarks'
    AND column_name = 'benchmark_value'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE custom_benchmarks ALTER COLUMN benchmark_value SET NOT NULL;
  END IF;
END $$;
