-- Migration 0076 DOWN: Remove range-based benchmarks support
-- Removes minValue and maxValue columns and 'range' comparison operator

DO $$
BEGIN
  -- Drop validation constraints
  ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_range_validation;
  ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_range_order;
  ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS custom_benchmarks_range_validation;
  ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS custom_benchmarks_range_order;

  -- Restore original comparison_operator constraints (without 'range')
  ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_comparison_operator_check;
  ALTER TABLE site_benchmarks ADD CONSTRAINT site_benchmarks_comparison_operator_check
    CHECK (comparison_operator IN ('lte', 'gte', 'eq'));

  ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS custom_benchmarks_comparison_operator_check;
  ALTER TABLE custom_benchmarks ADD CONSTRAINT custom_benchmarks_comparison_operator_check
    CHECK (comparison_operator IN ('lte', 'gte', 'eq'));

  -- Remove minValue and maxValue columns
  ALTER TABLE site_benchmarks DROP COLUMN IF EXISTS min_value;
  ALTER TABLE site_benchmarks DROP COLUMN IF EXISTS max_value;
  ALTER TABLE custom_benchmarks DROP COLUMN IF EXISTS min_value;
  ALTER TABLE custom_benchmarks DROP COLUMN IF EXISTS max_value;

END $$;
