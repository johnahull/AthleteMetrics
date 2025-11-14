-- Migration 0031: Add organization types for multi-tenant filtering
-- Purpose: Add organization type categorization to enable metric and benchmark filtering by org type
-- Context: Allows organizations to be categorized (youth, high school, college, etc.) and metrics/benchmarks to be scoped
-- Created: 2025-11-08

-- ============================================================================
-- PART 1: ADD ORG_TYPE COLUMN TO ORGANIZATIONS TABLE
-- ============================================================================

-- Add the org_type column to organizations table with proper enum constraint
DO $$
BEGIN
  -- Check if org_type column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'org_type'
  ) THEN
    -- Add org_type column with default 'club' and NOT NULL constraint
    ALTER TABLE organizations 
    ADD COLUMN org_type TEXT NOT NULL DEFAULT 'club';
    
    RAISE NOTICE 'Added org_type column to organizations table';
  ELSE
    RAISE NOTICE 'org_type column already exists in organizations table';
  END IF;

  -- Add CHECK constraint for valid organization types
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'organizations_org_type_check'
  ) THEN
    ALTER TABLE organizations 
    ADD CONSTRAINT organizations_org_type_check 
    CHECK (org_type IN ('youth', 'high_school', 'college', 'club', 'private_facility', 'elite_academy'));
    
    RAISE NOTICE 'Added organizations_org_type_check constraint';
  ELSE
    RAISE NOTICE 'organizations_org_type_check constraint already exists';
  END IF;
END $$;

-- ============================================================================
-- PART 2: ADD AVAILABLE_ORG_TYPES COLUMN TO SITE_METRICS TABLE
-- ============================================================================

-- Add the available_org_types column to site_metrics table (nullable text array)
DO $$
BEGIN
  -- Check if available_org_types column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_metrics' AND column_name = 'available_org_types'
  ) THEN
    -- Add available_org_types column as nullable text array
    ALTER TABLE site_metrics 
    ADD COLUMN available_org_types TEXT[];
    
    RAISE NOTICE 'Added available_org_types column to site_metrics table';
  ELSE
    RAISE NOTICE 'available_org_types column already exists in site_metrics table';
  END IF;
END $$;

-- ============================================================================
-- PART 3: ADD APPLICABLE_ORG_TYPES COLUMN TO SITE_BENCHMARKS TABLE
-- ============================================================================

-- Add the applicable_org_types column to site_benchmarks table (nullable text array)
DO $$
BEGIN
  -- Check if applicable_org_types column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks' AND column_name = 'applicable_org_types'
  ) THEN
    -- Add applicable_org_types column as nullable text array
    ALTER TABLE site_benchmarks 
    ADD COLUMN applicable_org_types TEXT[];
    
    RAISE NOTICE 'Added applicable_org_types column to site_benchmarks table';
  ELSE
    RAISE NOTICE 'applicable_org_types column already exists in site_benchmarks table';
  END IF;
END $$;

-- ============================================================================
-- PART 4: CREATE INDEXES FOR ORGANIZATION TYPE FILTERING
-- ============================================================================

-- Create index on organizations.org_type for efficient filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'organizations_org_type_idx'
  ) THEN
    CREATE INDEX organizations_org_type_idx ON organizations(org_type);
    RAISE NOTICE 'Created organizations_org_type_idx index';
  ELSE
    RAISE NOTICE 'Index organizations_org_type_idx already exists';
  END IF;
END $$;

-- Create index on site_metrics.available_org_types for efficient array filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'site_metrics_available_org_types_idx'
  ) THEN
    -- GIN index for efficient array overlap queries (WHERE available_org_types && ARRAY['college'])
    CREATE INDEX site_metrics_available_org_types_idx ON site_metrics USING GIN(available_org_types);
    RAISE NOTICE 'Created site_metrics_available_org_types_idx GIN index';
  ELSE
    RAISE NOTICE 'Index site_metrics_available_org_types_idx already exists';
  END IF;
END $$;

-- Create index on site_benchmarks.applicable_org_types for efficient array filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'site_benchmarks_org_types_idx'
  ) THEN
    -- GIN index for efficient array overlap queries (WHERE applicable_org_types && ARRAY['college'])
    CREATE INDEX site_benchmarks_org_types_idx ON site_benchmarks USING GIN(applicable_org_types);
    RAISE NOTICE 'Created site_benchmarks_org_types_idx GIN index';
  ELSE
    RAISE NOTICE 'Index site_benchmarks_org_types_idx already exists';
  END IF;
END $$;

-- Create composite index for site_metrics filtering by code and org type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'site_metrics_code_org_types_idx'
  ) THEN
    -- Composite index for queries like: WHERE code = ? AND is_active = true AND available_org_types && ARRAY[?]
    CREATE INDEX site_metrics_code_org_types_idx ON site_metrics(code, available_org_types)
    WHERE is_active = true;
    RAISE NOTICE 'Created site_metrics_code_org_types_idx composite index';
  ELSE
    RAISE NOTICE 'Index site_metrics_code_org_types_idx already exists';
  END IF;
END $$;

-- Create composite index for site_benchmarks filtering by metric_code and org type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'site_benchmarks_metric_org_types_idx'
  ) THEN
    -- Composite index for queries like: WHERE metric_code = ? AND is_active = true AND applicable_org_types && ARRAY[?]
    CREATE INDEX site_benchmarks_metric_org_types_idx ON site_benchmarks(metric_code, applicable_org_types)
    WHERE is_active = true;
    RAISE NOTICE 'Created site_benchmarks_metric_org_types_idx composite index';
  ELSE
    RAISE NOTICE 'Index site_benchmarks_metric_org_types_idx already exists';
  END IF;
END $$;

-- ============================================================================
-- PART 5: VERIFY MIGRATION SUCCESS
-- ============================================================================

DO $$
DECLARE
  org_type_col_exists BOOLEAN;
  metrics_col_exists BOOLEAN;
  benchmarks_col_exists BOOLEAN;
  constraint_exists BOOLEAN;
  org_count INTEGER;
BEGIN
  -- Check if all columns were added successfully
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
  
  -- Count existing organizations to verify default value application
  SELECT COUNT(*) INTO org_count FROM organizations;
  
  -- Report migration status
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 0031 VERIFICATION';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Organizations org_type column:       %', CASE WHEN org_type_col_exists THEN '✓ SUCCESS' ELSE '✗ FAILED' END;
  RAISE NOTICE 'Site_metrics available_org_types:    %', CASE WHEN metrics_col_exists THEN '✓ SUCCESS' ELSE '✗ FAILED' END;
  RAISE NOTICE 'Site_benchmarks applicable_org_types: %', CASE WHEN benchmarks_col_exists THEN '✓ SUCCESS' ELSE '✗ FAILED' END;
  RAISE NOTICE 'Organization type CHECK constraint:   %', CASE WHEN constraint_exists THEN '✓ SUCCESS' ELSE '✗ FAILED' END;
  RAISE NOTICE 'Existing organizations updated:       % organizations with default org_type=''club''', org_count;
  RAISE NOTICE '';
  
  IF org_type_col_exists AND metrics_col_exists AND benchmarks_col_exists AND constraint_exists THEN
    RAISE NOTICE '🎉 Migration 0031 completed successfully!';
    RAISE NOTICE 'Organization types feature is now ready for use.';
    RAISE NOTICE '';
    RAISE NOTICE 'Available organization types:';
    RAISE NOTICE '  • youth - Youth/children organizations';
    RAISE NOTICE '  • high_school - High school teams';  
    RAISE NOTICE '  • college - College/university teams';
    RAISE NOTICE '  • club - Club teams (default)';
    RAISE NOTICE '  • private_facility - Private training facilities';
    RAISE NOTICE '  • elite_academy - Elite sports academies';
  ELSE
    RAISE EXCEPTION 'Migration 0031 verification failed - some components were not created successfully';
  END IF;
  
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;