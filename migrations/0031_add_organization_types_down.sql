-- Migration 0031 DOWN: Remove organization types (rollback)
-- Purpose: Rollback organization types feature - removes org type columns and constraints
-- Warning: This will permanently remove organization type data!
-- Created: 2025-11-08

-- ============================================================================
-- SAFETY WARNING
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ ⚠️ ⚠️  ROLLBACK WARNING  ⚠️ ⚠️ ⚠️';
  RAISE NOTICE '';
  RAISE NOTICE 'This rollback will permanently remove:';
  RAISE NOTICE '  • Organization type classifications (org_type column)';
  RAISE NOTICE '  • Metric organization type filtering (available_org_types column)';
  RAISE NOTICE '  • Benchmark organization type filtering (applicable_org_types column)';
  RAISE NOTICE '  • All related indexes and constraints';
  RAISE NOTICE '';
  RAISE NOTICE 'This data CANNOT be recovered after rollback!';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- PART 1: DROP INDEXES FOR ORGANIZATION TYPE FILTERING
-- ============================================================================

-- Drop index on site_benchmarks.applicable_org_types
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'site_benchmarks_org_types_idx'
  ) THEN
    DROP INDEX site_benchmarks_org_types_idx;
    RAISE NOTICE 'Dropped site_benchmarks_org_types_idx index';
  ELSE
    RAISE NOTICE 'Index site_benchmarks_org_types_idx does not exist';
  END IF;
END $$;

-- Drop index on site_metrics.available_org_types
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'site_metrics_available_org_types_idx'
  ) THEN
    DROP INDEX site_metrics_available_org_types_idx;
    RAISE NOTICE 'Dropped site_metrics_available_org_types_idx index';
  ELSE
    RAISE NOTICE 'Index site_metrics_available_org_types_idx does not exist';
  END IF;
END $$;

-- Drop index on organizations.org_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'organizations_org_type_idx'
  ) THEN
    DROP INDEX organizations_org_type_idx;
    RAISE NOTICE 'Dropped organizations_org_type_idx index';
  ELSE
    RAISE NOTICE 'Index organizations_org_type_idx does not exist';
  END IF;
END $$;

-- Drop composite index on site_benchmarks(metric_code, applicable_org_types)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'site_benchmarks_metric_org_types_idx'
  ) THEN
    DROP INDEX site_benchmarks_metric_org_types_idx;
    RAISE NOTICE 'Dropped site_benchmarks_metric_org_types_idx composite index';
  ELSE
    RAISE NOTICE 'Index site_benchmarks_metric_org_types_idx does not exist';
  END IF;
END $$;

-- Drop composite index on site_metrics(code, available_org_types)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'site_metrics_code_org_types_idx'
  ) THEN
    DROP INDEX site_metrics_code_org_types_idx;
    RAISE NOTICE 'Dropped site_metrics_code_org_types_idx composite index';
  ELSE
    RAISE NOTICE 'Index site_metrics_code_org_types_idx does not exist';
  END IF;
END $$;

-- ============================================================================
-- PART 2: DROP APPLICABLE_ORG_TYPES COLUMN FROM SITE_BENCHMARKS TABLE
-- ============================================================================

-- Remove the applicable_org_types column from site_benchmarks table
DO $$
BEGIN
  -- Check if applicable_org_types column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks' AND column_name = 'applicable_org_types'
  ) THEN
    ALTER TABLE site_benchmarks 
    DROP COLUMN applicable_org_types;
    
    RAISE NOTICE 'Removed applicable_org_types column from site_benchmarks table';
  ELSE
    RAISE NOTICE 'applicable_org_types column does not exist in site_benchmarks table';
  END IF;
END $$;

-- ============================================================================
-- PART 3: DROP AVAILABLE_ORG_TYPES COLUMN FROM SITE_METRICS TABLE
-- ============================================================================

-- Remove the available_org_types column from site_metrics table
DO $$
BEGIN
  -- Check if available_org_types column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_metrics' AND column_name = 'available_org_types'
  ) THEN
    ALTER TABLE site_metrics 
    DROP COLUMN available_org_types;
    
    RAISE NOTICE 'Removed available_org_types column from site_metrics table';
  ELSE
    RAISE NOTICE 'available_org_types column does not exist in site_metrics table';
  END IF;
END $$;

-- ============================================================================
-- PART 4: DROP ORG_TYPE COLUMN FROM ORGANIZATIONS TABLE
-- ============================================================================

-- Remove the CHECK constraint first, then the column
DO $$
BEGIN
  -- Drop CHECK constraint for valid organization types
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'organizations_org_type_check'
  ) THEN
    ALTER TABLE organizations 
    DROP CONSTRAINT organizations_org_type_check;
    
    RAISE NOTICE 'Removed organizations_org_type_check constraint';
  ELSE
    RAISE NOTICE 'organizations_org_type_check constraint does not exist';
  END IF;

  -- Drop org_type column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'org_type'
  ) THEN
    ALTER TABLE organizations 
    DROP COLUMN org_type;
    
    RAISE NOTICE 'Removed org_type column from organizations table';
  ELSE
    RAISE NOTICE 'org_type column does not exist in organizations table';
  END IF;
END $$;

-- ============================================================================
-- PART 5: VERIFY ROLLBACK SUCCESS
-- ============================================================================

DO $$
DECLARE
  org_type_col_exists BOOLEAN;
  metrics_col_exists BOOLEAN;
  benchmarks_col_exists BOOLEAN;
  constraint_exists BOOLEAN;
BEGIN
  -- Check if all columns were removed successfully
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'org_type'
  ) INTO org_type_col_exists;
  
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_metrics' AND column_name = 'available_org_types'
  ) INTO metrics_col_exists;
  
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks' AND column_name = 'applicable_org_types'
  ) INTO benchmarks_col_exists;
  
  SELECT EXISTS(
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'organizations_org_type_check'
  ) INTO constraint_exists;
  
  -- Report rollback status
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 0031 ROLLBACK VERIFICATION';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Organizations org_type column:       %', CASE WHEN NOT org_type_col_exists THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
  RAISE NOTICE 'Site_metrics available_org_types:    %', CASE WHEN NOT metrics_col_exists THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
  RAISE NOTICE 'Site_benchmarks applicable_org_types: %', CASE WHEN NOT benchmarks_col_exists THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
  RAISE NOTICE 'Organization type CHECK constraint:   %', CASE WHEN NOT constraint_exists THEN '✓ REMOVED' ELSE '✗ STILL EXISTS' END;
  RAISE NOTICE '';
  
  IF NOT org_type_col_exists AND NOT metrics_col_exists AND NOT benchmarks_col_exists AND NOT constraint_exists THEN
    RAISE NOTICE '✓ Migration 0031 rollback completed successfully!';
    RAISE NOTICE 'Organization types feature has been completely removed.';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Note: All organization type data has been permanently deleted.';
    RAISE NOTICE 'Organizations will need to be re-categorized if migration 0031 is re-applied.';
  ELSE
    RAISE EXCEPTION 'Migration 0031 rollback verification failed - some components were not removed successfully';
  END IF;
  
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;