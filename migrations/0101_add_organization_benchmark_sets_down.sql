-- Rollback: 0101_add_organization_benchmark_sets
-- Description: Remove organization_benchmark_sets table

-- Drop the indexes
DROP INDEX IF EXISTS org_benchmark_sets_org_idx;
DROP INDEX IF EXISTS org_benchmark_sets_org_enabled_idx;

-- Drop the table
DROP TABLE IF EXISTS organization_benchmark_sets;
