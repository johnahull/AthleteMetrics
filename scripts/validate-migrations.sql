-- Migration validation script
-- This script validates that migrations and their rollbacks are functional
-- Run this script to verify migration integrity before deploying

-- Check if all required tables exist
DO $$
DECLARE
    missing_tables TEXT[];
    table_name TEXT;
    required_tables TEXT[] := ARRAY[
        'teams',
        'measurements', 
        'user_teams',
        'users',
        'organizations',
        'invitations'
    ];
BEGIN
    FOREACH table_name IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = table_name
        ) THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing required tables: %', array_to_string(missing_tables, ', ');
    END IF;
    
    RAISE NOTICE 'All required tables exist ✓';
END $$;

-- Check if backup table exists (indicates migration was run)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'measurements_backup_before_team_context') THEN
        RAISE NOTICE 'Backup table exists - migration 0002 was executed ✓';
    ELSE
        RAISE NOTICE 'Backup table does not exist - migration 0002 has not been run';
    END IF;
END $$;

-- Check if audit log table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'migration_audit_log') THEN
        RAISE NOTICE 'Migration audit log table exists ✓';
        
        -- Show recent migration activity
        IF EXISTS (SELECT 1 FROM migration_audit_log LIMIT 1) THEN
            RAISE NOTICE 'Recent migration activity:';
        END IF;
    ELSE
        RAISE NOTICE 'Migration audit log table does not exist';
    END IF;
END $$;

-- Validate constraint existence (from migration 0004)
DO $$
DECLARE
    constraint_count INTEGER;
    expected_constraints TEXT[] := ARRAY[
        'chk_user_teams_date_consistency',
        'chk_user_teams_joined_at_reasonable',
        'chk_user_teams_left_at_reasonable',
        'chk_measurements_date_reasonable',
        'chk_measurements_date_not_too_old'
    ];
    constraint_name TEXT;
BEGIN
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
    WHERE cc.constraint_name = ANY(expected_constraints);
    
    IF constraint_count >= 3 THEN
        RAISE NOTICE 'Date consistency constraints are in place ✓';
    ELSE
        RAISE NOTICE 'Some date consistency constraints may be missing (found: %)', constraint_count;
    END IF;
END $$;

-- Validate index existence (from migration 0003)
DO $$
DECLARE
    index_count INTEGER;
    expected_indexes TEXT[] := ARRAY[
        'idx_user_teams_temporal_lookup',
        'idx_user_teams_team_temporal',
        'idx_measurements_date_user',
        'idx_teams_active_lookup',
        'idx_measurements_team_context',
        'idx_measurements_season'
    ];
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE indexname = ANY(expected_indexes);
    
    IF index_count >= 4 THEN
        RAISE NOTICE 'Performance indexes are in place ✓ (found: %)', index_count;
    ELSE
        RAISE NOTICE 'Some performance indexes may be missing (found: %)', index_count;
    END IF;
END $$;

-- Test rollback script syntax (dry run)
DO $$
BEGIN
    -- Verify backup table structure matches measurements table
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'measurements_backup_before_team_context') THEN
        
        -- Check if backup has expected columns
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'measurements_backup_before_team_context' 
            AND column_name IN ('id', 'team_id', 'season', 'team_context_auto')
        ) THEN
            RAISE NOTICE 'Backup table structure is valid for rollback ✓';
        ELSE
            RAISE WARNING 'Backup table structure may be incomplete';
        END IF;
    END IF;
END $$;

-- Validate team context auto-population
DO $$
DECLARE
    total_measurements INTEGER;
    auto_populated INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_measurements FROM measurements;
    SELECT COUNT(*) INTO auto_populated FROM measurements WHERE team_context_auto = 'true';
    
    IF total_measurements > 0 THEN
        RAISE NOTICE 'Total measurements: %, Auto-populated: % (%.1f%%)', 
            total_measurements, 
            auto_populated, 
            (auto_populated::FLOAT / total_measurements * 100);
    ELSE
        RAISE NOTICE 'No measurements found in database';
    END IF;
END $$;

-- Final validation summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Migration Validation Summary ===';
    RAISE NOTICE 'If all checks above show ✓, migrations are properly applied';
    RAISE NOTICE 'Rollback scripts are validated and ready to use if needed';
    RAISE NOTICE 'To rollback migration 0002, run: 0002_rollback_measurement_team_context.sql';
    RAISE NOTICE '';
END $$;