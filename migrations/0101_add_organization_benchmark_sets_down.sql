-- Rollback: 0101_add_organization_benchmark_sets
-- Description: Remove organization_benchmark_sets table

-- Drop the index
DROP INDEX IF EXISTS org_benchmark_sets_org_idx;

-- Drop the table
DROP TABLE IF EXISTS organization_benchmark_sets;
