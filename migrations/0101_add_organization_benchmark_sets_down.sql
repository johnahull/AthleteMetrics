-- Rollback: 0101_add_organization_benchmark_sets
-- Description: Remove organization_benchmark_sets table

-- Safety check: Warn if data exists before dropping
DO $$
DECLARE
  record_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO record_count FROM organization_benchmark_sets;
  IF record_count > 0 THEN
    RAISE WARNING 'organization_benchmark_sets contains % records that will be deleted', record_count;
  END IF;
END $$;

-- Drop the indexes
DROP INDEX IF EXISTS org_benchmark_sets_org_idx;
DROP INDEX IF EXISTS org_benchmark_sets_org_enabled_idx;

-- Drop the table (CASCADE will remove foreign key constraints in other tables)
DROP TABLE IF EXISTS organization_benchmark_sets CASCADE;
