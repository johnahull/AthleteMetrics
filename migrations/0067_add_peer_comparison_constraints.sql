-- Migration: Add validation constraints for peer comparison tables
-- Date: 2025-12-04
-- Purpose: Add CHECK constraints to enforce data integrity rules
-- Expected impact: Prevent invalid data entry, enforce minimum sample sizes

-- Constraint: Enforce minimum sample size of 10 for peer percentile cache
-- This prevents displaying unreliable percentiles from small sample sizes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'peer_percentile_cache_sample_size_min'
    AND table_name = 'peer_percentile_cache'
  ) THEN
    ALTER TABLE peer_percentile_cache
      ADD CONSTRAINT peer_percentile_cache_sample_size_min
      CHECK (sample_size >= 10);
  END IF;
END $$;

-- Constraint: Validate peer_percentile_target range for site_benchmarks
-- Percentile targets must be between 0 and 100 (inclusive) or NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'site_benchmarks_peer_percentile_range'
    AND table_name = 'site_benchmarks'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT site_benchmarks_peer_percentile_range
      CHECK (peer_percentile_target IS NULL OR
             (peer_percentile_target >= 0 AND peer_percentile_target <= 100));
  END IF;
END $$;

-- Constraint: Validate benchmark_source enum values
-- Must be either 'static' or 'peer_percentile'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'site_benchmarks_source_valid'
    AND table_name = 'site_benchmarks'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT site_benchmarks_source_valid
      CHECK (benchmark_source IN ('static', 'peer_percentile'));
  END IF;
END $$;

-- Constraint: Conditional field requirements for peer_percentile mode
-- If benchmark_source is 'peer_percentile', then peer_percentile_target and peer_filter_criteria must be provided
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'site_benchmarks_peer_fields_required'
    AND table_name = 'site_benchmarks'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT site_benchmarks_peer_fields_required
      CHECK (
        benchmark_source != 'peer_percentile' OR
        (peer_percentile_target IS NOT NULL AND peer_filter_criteria IS NOT NULL)
      );
  END IF;
END $$;
