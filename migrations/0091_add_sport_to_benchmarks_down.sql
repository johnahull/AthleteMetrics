-- Rollback: Remove sport column from benchmark tables
-- This reverts migration 0091_add_sport_to_benchmarks.sql

-- Drop indexes
DROP INDEX IF EXISTS idx_custom_benchmarks_sport_position;
DROP INDEX IF EXISTS idx_site_benchmarks_sport_position;
DROP INDEX IF EXISTS idx_custom_benchmarks_sport;
DROP INDEX IF EXISTS idx_site_benchmarks_sport;

-- Drop sport column from custom_benchmarks
ALTER TABLE custom_benchmarks
DROP COLUMN IF EXISTS sport;

-- Drop sport column from site_benchmarks
ALTER TABLE site_benchmarks
DROP COLUMN IF EXISTS sport;
