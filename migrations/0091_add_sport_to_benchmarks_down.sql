-- Rollback: Remove sport column from benchmark tables
-- This reverts migration 0091_add_sport_to_benchmarks.sql

-- Drop indexes
DROP INDEX IF EXISTS idx_custom_benchmarks_sport_position;
DROP INDEX IF EXISTS idx_site_benchmarks_sport_position;
DROP INDEX IF EXISTS idx_custom_benchmarks_sport;
DROP INDEX IF EXISTS idx_site_benchmarks_sport;

-- Drop CHECK constraints
ALTER TABLE custom_benchmarks DROP CONSTRAINT IF EXISTS custom_benchmarks_position_requires_sport;
ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_position_requires_sport;

-- Drop sport column from custom_benchmarks
ALTER TABLE custom_benchmarks
DROP COLUMN IF EXISTS sport;

-- Drop sport column from site_benchmarks
ALTER TABLE site_benchmarks
DROP COLUMN IF EXISTS sport;
