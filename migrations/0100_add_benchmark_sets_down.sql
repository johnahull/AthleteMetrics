-- Rollback Migration: Remove Benchmark Sets feature
-- Description: Removes benchmark sets tables and related indexes

-- Drop indexes first
DROP INDEX IF EXISTS benchmark_set_items_unique;
DROP INDEX IF EXISTS benchmark_set_items_set_idx;
DROP INDEX IF EXISTS benchmark_sets_unique_org_name;
DROP INDEX IF EXISTS benchmark_sets_active_idx;
DROP INDEX IF EXISTS benchmark_sets_org_idx;

-- Drop tables (items first due to foreign key constraint)
DROP TABLE IF EXISTS benchmark_set_items;
DROP TABLE IF EXISTS benchmark_sets;
