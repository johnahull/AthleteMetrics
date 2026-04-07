-- Migration: 0108_fix_benchmark_data_integrity
-- Purpose: Fix benchmark data integrity issues before constraint enforcement.
--
-- Background: Migrations 0078 and 0079 added CHECK constraints to ensure
-- benchmark_value and min_value/max_value are mutually exclusive. However, data
-- created during the range-benchmark development period may violate these constraints.
-- These fixup statements were originally appended to 0078/0079, but since those
-- migrations have already been applied on production, the fixups never ran.
-- This migration applies them as a standalone, idempotent operation.
--
-- IDEMPOTENT: All UPDATEs use WHERE clauses that become no-ops on clean data.

-- Step 1: Fix non-range benchmarks with null benchmark_value but with min/max set.
-- Use whichever range bound is available as the single-value benchmark.
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

-- Step 2: Fix mutual exclusivity violations — non-range benchmarks should only
-- have benchmark_value set, not min_value/max_value.
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
