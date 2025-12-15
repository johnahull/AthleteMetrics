-- Migration 0076: Add range-based benchmarks support
-- Adds minValue and maxValue columns to site_benchmarks and custom_benchmarks
-- Extends comparison_operator enum to include 'range' option

DO $$
BEGIN
  -- Add minValue and maxValue columns to site_benchmarks
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks' AND column_name = 'min_value'
  ) THEN
    ALTER TABLE site_benchmarks ADD COLUMN min_value DECIMAL(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks' AND column_name = 'max_value'
  ) THEN
    ALTER TABLE site_benchmarks ADD COLUMN max_value DECIMAL(10, 2);
  END IF;

  -- Add minValue and maxValue columns to custom_benchmarks
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_benchmarks' AND column_name = 'min_value'
  ) THEN
    ALTER TABLE custom_benchmarks ADD COLUMN min_value DECIMAL(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_benchmarks' AND column_name = 'max_value'
  ) THEN
    ALTER TABLE custom_benchmarks ADD COLUMN max_value DECIMAL(10, 2);
  END IF;

  -- Drop existing constraint on comparison_operator for site_benchmarks
  ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_comparison_operator_check;

  -- Add updated constraint with 'range' operator
  ALTER TABLE site_benchmarks ADD CONSTRAINT site_benchmarks_comparison_operator_check
    CHECK (comparison_operator IN ('lte', 'gte', 'eq', 'range'));

  -- Drop existing constraint on comparison_operator for custom_benchmarks
  ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS custom_benchmarks_comparison_operator_check;

  -- Add updated constraint with 'range' operator
  ALTER TABLE custom_benchmarks ADD CONSTRAINT custom_benchmarks_comparison_operator_check
    CHECK (comparison_operator IN ('lte', 'gte', 'eq', 'range'));

  -- Add validation constraint: if comparison_operator is 'range', minValue and maxValue must be set
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'site_benchmarks_range_validation'
  ) THEN
    ALTER TABLE site_benchmarks ADD CONSTRAINT site_benchmarks_range_validation
      CHECK (
        (comparison_operator != 'range') OR
        (comparison_operator = 'range' AND min_value IS NOT NULL AND max_value IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'custom_benchmarks_range_validation'
  ) THEN
    ALTER TABLE custom_benchmarks ADD CONSTRAINT custom_benchmarks_range_validation
      CHECK (
        (comparison_operator != 'range') OR
        (comparison_operator = 'range' AND min_value IS NOT NULL AND max_value IS NOT NULL)
      );
  END IF;

  -- Add validation constraint: minValue must be less than maxValue for range benchmarks
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'site_benchmarks_range_order'
  ) THEN
    ALTER TABLE site_benchmarks ADD CONSTRAINT site_benchmarks_range_order
      CHECK (
        (comparison_operator != 'range') OR
        (min_value < max_value)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'custom_benchmarks_range_order'
  ) THEN
    ALTER TABLE custom_benchmarks ADD CONSTRAINT custom_benchmarks_range_order
      CHECK (
        (comparison_operator != 'range') OR
        (min_value < max_value)
      );
  END IF;

END $$;
