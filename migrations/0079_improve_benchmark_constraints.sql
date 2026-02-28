-- Migration 0079: Improve benchmark constraints and data integrity
-- DEPENDS ON: Migrations 0076, 0077, 0078
-- Fixes identified in code review:
-- 1. Add mutual exclusivity constraint (benchmark_value XOR min_value/max_value)
-- 2. Standardize constraint naming patterns
-- 3. Fix decimal precision mismatch (DECIMAL(10,2) → DECIMAL(10,3))
-- 4. Add tier order uniqueness constraints
-- IDEMPOTENT: Safe to run multiple times

-- Fix mutual exclusivity violations before adding the constraint:
-- Non-range benchmarks should only have benchmark_value set, not min_value/max_value.
-- Clear min_value/max_value for non-range benchmarks that had them set (data created
-- before this constraint existed).
UPDATE site_benchmarks
  SET min_value = NULL, max_value = NULL
  WHERE comparison_operator != 'range'
    AND benchmark_value IS NOT NULL
    AND (min_value IS NOT NULL OR max_value IS NOT NULL);

UPDATE custom_benchmarks
  SET min_value = NULL, max_value = NULL
  WHERE comparison_operator != 'range'
    AND benchmark_value IS NOT NULL
    AND (min_value IS NOT NULL OR max_value IS NOT NULL);

DO $$
BEGIN
  -- 1. ADD MUTUAL EXCLUSIVITY CONSTRAINTS
  -- Ensure EITHER benchmark_value OR min_value/max_value are set, but not both
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'site_benchmarks_value_or_range_exclusive'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT site_benchmarks_value_or_range_exclusive
      CHECK (
        NOT (benchmark_value IS NOT NULL AND min_value IS NOT NULL)
        AND NOT (benchmark_value IS NOT NULL AND max_value IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'custom_benchmarks_value_or_range_exclusive'
  ) THEN
    ALTER TABLE custom_benchmarks
      ADD CONSTRAINT custom_benchmarks_value_or_range_exclusive
      CHECK (
        NOT (benchmark_value IS NOT NULL AND min_value IS NOT NULL)
        AND NOT (benchmark_value IS NOT NULL AND max_value IS NOT NULL)
      );
  END IF;

  -- 2. STANDARDIZE CONSTRAINT NAMING (if constraints exist)
  -- Rename chk_tier_fields to follow {table_name}_{constraint_purpose} pattern
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'chk_tier_fields'
  ) THEN
    ALTER TABLE site_benchmarks RENAME CONSTRAINT chk_tier_fields
      TO site_benchmarks_tier_fields;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'chk_tier_fields_custom'
  ) THEN
    ALTER TABLE custom_benchmarks RENAME CONSTRAINT chk_tier_fields_custom
      TO custom_benchmarks_tier_fields;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'chk_benchmark_value_or_range'
  ) THEN
    ALTER TABLE site_benchmarks RENAME CONSTRAINT chk_benchmark_value_or_range
      TO site_benchmarks_value_or_range;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'chk_custom_benchmark_value_or_range'
  ) THEN
    ALTER TABLE custom_benchmarks RENAME CONSTRAINT chk_custom_benchmark_value_or_range
      TO custom_benchmarks_value_or_range;
  END IF;

  -- 3. FIX DECIMAL PRECISION MISMATCH
  -- Align min_value and max_value to 3 decimal places (same as benchmark_value)
  -- This prevents data loss when converting between benchmark types
  ALTER TABLE site_benchmarks
    ALTER COLUMN min_value TYPE DECIMAL(10, 3),
    ALTER COLUMN max_value TYPE DECIMAL(10, 3);

  ALTER TABLE custom_benchmarks
    ALTER COLUMN min_value TYPE DECIMAL(10, 3),
    ALTER COLUMN max_value TYPE DECIMAL(10, 3);

  -- 4. ADD TIER ORDER UNIQUENESS CONSTRAINTS
  -- Prevent duplicate tier_order values within same tier_group_id
  -- Partial unique index only applies WHERE tier_group_id IS NOT NULL
  CREATE UNIQUE INDEX IF NOT EXISTS site_benchmarks_tier_group_order_unique
    ON site_benchmarks(tier_group_id, tier_order)
    WHERE tier_group_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS custom_benchmarks_tier_group_order_unique
    ON custom_benchmarks(tier_group_id, tier_order)
    WHERE tier_group_id IS NOT NULL;

END $$;

-- Add comments documenting the improvements
COMMENT ON CONSTRAINT site_benchmarks_value_or_range_exclusive ON site_benchmarks IS 'Ensures mutual exclusivity: either benchmark_value OR min_value/max_value, never both';
COMMENT ON CONSTRAINT custom_benchmarks_value_or_range_exclusive ON custom_benchmarks IS 'Ensures mutual exclusivity: either benchmark_value OR min_value/max_value, never both';
