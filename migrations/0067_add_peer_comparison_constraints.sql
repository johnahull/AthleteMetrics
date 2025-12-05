-- Migration: Add validation constraints for peer comparison tables
-- Date: 2025-12-04
-- Purpose: Add CHECK constraints to enforce data integrity rules
-- Expected impact: Prevent invalid data entry, enforce minimum sample sizes

-- Constraint: Enforce minimum sample size of 10 for peer percentile cache
-- This prevents displaying unreliable percentiles from small sample sizes

-- First, clean up any existing cache entries with sample_size < 10
-- These represent unreliable data that will be regenerated on demand
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'peer_percentile_cache'
  ) THEN
    DELETE FROM peer_percentile_cache WHERE sample_size < 10;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'peer_percentile_cache_sample_size_min'
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
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_benchmarks_peer_percentile_range'
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
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_benchmarks_source_valid'
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
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_benchmarks_peer_fields_required'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT site_benchmarks_peer_fields_required
      CHECK (
        benchmark_source != 'peer_percentile' OR
        (peer_percentile_target IS NOT NULL AND peer_filter_criteria IS NOT NULL)
      );
  END IF;
END $$;

-- Constraint: Mutual exclusivity for static vs peer-percentile benchmarks
-- If benchmark_source is 'static', peer fields should be NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_benchmarks_static_fields_null'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT site_benchmarks_static_fields_null
      CHECK (
        benchmark_source != 'static' OR
        (peer_percentile_target IS NULL AND peer_filter_criteria IS NULL)
      );
  END IF;
END $$;
