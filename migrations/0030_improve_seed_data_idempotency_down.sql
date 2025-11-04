-- Migration 0030 Down: Revert seed data idempotency improvements
-- Description: Removes semantic unique constraint (if it was added by this migration)
-- Created: 2025-11-04
-- Note: Does not remove seed data, only the constraint

-- Remove the unique constraint on (metric_code, name) if we added it
-- Check if constraint exists and was added by this migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_benchmarks_metric_name_unique'
    AND conrelid = 'site_benchmarks'::regclass
  ) THEN
    ALTER TABLE site_benchmarks
    DROP CONSTRAINT site_benchmarks_metric_name_unique;
    RAISE NOTICE 'Dropped site_benchmarks_metric_name_unique constraint';
  END IF;
END $$;
