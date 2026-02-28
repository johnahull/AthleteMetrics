-- Migration: 0078_make_benchmark_value_nullable
-- Description: Make benchmark_value nullable to support range-based benchmarks
-- Range benchmarks use min_value/max_value instead of benchmark_value
-- IDEMPOTENT: Safe to run multiple times

-- Make benchmark_value nullable in site_benchmarks (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks'
    AND column_name = 'benchmark_value'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE site_benchmarks ALTER COLUMN benchmark_value DROP NOT NULL;
  END IF;
END $$;

-- Make benchmark_value nullable in custom_benchmarks (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_benchmarks'
    AND column_name = 'benchmark_value'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE custom_benchmarks ALTER COLUMN benchmark_value DROP NOT NULL;
  END IF;
END $$;

-- Fix data integrity before adding constraint:
-- Non-range benchmarks with null benchmark_value but with min_value/max_value
-- were likely created during range-benchmark development. Use whichever is set.
UPDATE site_benchmarks
  SET benchmark_value = COALESCE(min_value, max_value)
  WHERE comparison_operator != 'range'
    AND benchmark_value IS NULL
    AND (min_value IS NOT NULL OR max_value IS NOT NULL);

UPDATE custom_benchmarks
  SET benchmark_value = COALESCE(min_value, max_value)
  WHERE comparison_operator != 'range'
    AND benchmark_value IS NULL
    AND (min_value IS NOT NULL OR max_value IS NOT NULL);

-- Add a check constraint to ensure data integrity:
-- Either benchmark_value is set (for non-range) OR min_value/max_value are set (for range)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'chk_benchmark_value_or_range'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT chk_benchmark_value_or_range
      CHECK (
        (comparison_operator != 'range' AND benchmark_value IS NOT NULL)
        OR (comparison_operator = 'range' AND min_value IS NOT NULL AND max_value IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'chk_custom_benchmark_value_or_range'
  ) THEN
    ALTER TABLE custom_benchmarks
      ADD CONSTRAINT chk_custom_benchmark_value_or_range
      CHECK (
        (comparison_operator != 'range' AND benchmark_value IS NOT NULL)
        OR (comparison_operator = 'range' AND min_value IS NOT NULL AND max_value IS NOT NULL)
      );
  END IF;
END $$;
