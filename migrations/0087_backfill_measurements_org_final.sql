-- Migration: Final backfill of organization_id for measurements with NULL values
-- Purpose: Complete multi-tenant isolation by ensuring all measurements have organization_id
--
-- IDEMPOTENT: Yes - safe to run multiple times
--   - All UPDATE statements only target rows WHERE organization_id IS NULL
--   - After first run, updated rows no longer match this condition
--   - Re-runs will process 0 rows and report current state
--
-- CONTEXT:
-- The getMeasurements() query in measurement-service.ts includes:
--   or(eq(organizationId, X), isNull(organizationId))
-- This causes measurements with NULL organization_id to be visible to ALL organizations,
-- creating a multi-tenant data isolation breach.
--
-- SOLUTION:
-- 1. Backfill organization_id from teams (primary source)
-- 2. Backfill from user_organizations (fallback for measurements without teams)
-- 3. Report orphaned measurements for manual handling
--
-- DATA MODEL NOTE:
-- - Athletes are stored in the 'users' table (not a separate 'players' table)
-- - Measurements link to athletes via 'user_id' (not 'player_id')
-- - Team membership provides the most authoritative organization assignment
--
-- After this migration, the code change to remove isNull() can be deployed.
--
-- CRITICAL: Run this BEFORE deploying the code change that removes NULL handling

-- ============================================================================
-- STEP 1: Report current state
-- ============================================================================

DO $$
DECLARE
  null_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM measurements;
  SELECT COUNT(*) INTO null_count FROM measurements WHERE organization_id IS NULL;

  RAISE NOTICE '======================================';
  RAISE NOTICE 'BACKFILL START: Pre-check';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Total measurements: %', total_count;
  RAISE NOTICE 'Measurements with NULL org_id: %', null_count;
  IF total_count > 0 THEN
    RAISE NOTICE 'Percentage NULL: %', ROUND((null_count::NUMERIC / total_count) * 100, 2);
  END IF;
  RAISE NOTICE '======================================';
END $$;

-- ============================================================================
-- STEP 1.5: Create temporary index for performance
-- Index on measurements.team_id WHERE organization_id IS NULL
-- This speeds up the JOIN in Step 2 significantly (from 5-10s to milliseconds per batch)
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_team_id_temp
  ON measurements(team_id)
  WHERE organization_id IS NULL;

-- ============================================================================
-- STEP 2: Backfill from teams table (measurements with team_id)
-- This is the most accurate source - team explicitly defines the organization
-- ============================================================================

DO $$
DECLARE
  rows_updated INTEGER := 1;
  total_updated INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting backfill from teams...';

  WHILE rows_updated > 0 LOOP
    WITH batch AS (
      SELECT m.id
      FROM measurements m
      INNER JOIN teams t ON m.team_id = t.id
      WHERE m.organization_id IS NULL
        AND t.organization_id IS NOT NULL
      LIMIT 1000
    )
    UPDATE measurements m
    SET organization_id = t.organization_id
    FROM teams t, batch
    WHERE m.id = batch.id
      AND m.team_id = t.id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_updated := total_updated + rows_updated;

    IF rows_updated > 0 THEN
      RAISE NOTICE 'Backfilled % measurements from teams (batch total: %)', rows_updated, total_updated;
    END IF;

    -- Small pause to reduce lock contention
    PERFORM pg_sleep(0.05);
  END LOOP;

  RAISE NOTICE 'Teams backfill complete: % measurements updated', total_updated;
END $$;

-- ============================================================================
-- STEP 3: Backfill from user_organizations (measurements without team_id)
-- For independent measurements, use the user's organization membership
-- ============================================================================

DO $$
DECLARE
  rows_updated INTEGER := 1;
  total_updated INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting backfill from user_organizations...';

  WHILE rows_updated > 0 LOOP
    WITH batch AS (
      SELECT m.id
      FROM measurements m
      WHERE m.organization_id IS NULL
        AND m.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM user_organizations uo
          WHERE uo.user_id = m.user_id
        )
      LIMIT 1000
    ),
    user_org_lookup AS (
      SELECT DISTINCT ON (uo.user_id)
        uo.user_id,
        uo.organization_id
      FROM user_organizations uo
      ORDER BY uo.user_id, uo.created_at DESC
    )
    UPDATE measurements m
    SET organization_id = uol.organization_id
    FROM batch, user_org_lookup uol
    WHERE m.id = batch.id
      AND m.user_id = uol.user_id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_updated := total_updated + rows_updated;

    IF rows_updated > 0 THEN
      RAISE NOTICE 'Backfilled % measurements from user_organizations (batch total: %)', rows_updated, total_updated;
    END IF;

    PERFORM pg_sleep(0.05);
  END LOOP;

  RAISE NOTICE 'User organizations backfill complete: % measurements updated', total_updated;
END $$;

-- ============================================================================
-- STEP 4: REMOVED - players table does not exist
-- Athletes are stored in the users table, which is already handled in Step 3
-- via user_organizations lookup. No separate player organization backfill needed.
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 4 skipped: Athletes are users in AthleteMetrics (no separate players table)';
  RAISE NOTICE 'User organization backfill in Step 3 handles all athlete-based backfills';
END $$;

-- ============================================================================
-- STEP 5: Report remaining NULL measurements (orphaned data)
-- ============================================================================

DO $$
DECLARE
  remaining_null INTEGER;
  orphaned_no_user INTEGER;
  orphaned_no_team INTEGER;
  orphaned_no_org INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_null
  FROM measurements WHERE organization_id IS NULL;

  -- Measurements with no user (user was deleted)
  SELECT COUNT(*) INTO orphaned_no_user
  FROM measurements m
  WHERE m.organization_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id);

  -- Measurements with deleted team
  SELECT COUNT(*) INTO orphaned_no_team
  FROM measurements m
  WHERE m.organization_id IS NULL
    AND m.team_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = m.team_id);

  -- Measurements where user exists but has no organization membership
  SELECT COUNT(*) INTO orphaned_no_org
  FROM measurements m
  WHERE m.organization_id IS NULL
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
    AND NOT EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = m.user_id);

  RAISE NOTICE '======================================';
  RAISE NOTICE 'BACKFILL COMPLETE: Post-check';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Remaining NULL org_id measurements: %', remaining_null;
  RAISE NOTICE '  - Orphaned (no user): %', orphaned_no_user;
  RAISE NOTICE '  - Orphaned (deleted team): %', orphaned_no_team;
  RAISE NOTICE '  - User has no org membership: %', orphaned_no_org;
  RAISE NOTICE '======================================';

  IF remaining_null > 0 THEN
    RAISE WARNING 'MANUAL ACTION MAY BE REQUIRED: % measurements still have NULL organization_id', remaining_null;
    RAISE NOTICE 'These measurements are orphaned and will be invisible after code deployment.';
    RAISE NOTICE 'Options:';
    RAISE NOTICE '  1. Leave as-is (orphaned data becomes invisible - recommended for test data)';
    RAISE NOTICE '  2. Manually assign to appropriate organization';
    RAISE NOTICE '  3. Delete orphaned measurements if confirmed as test/demo data';
  ELSE
    RAISE NOTICE '✅ SUCCESS: All measurements have organization_id set';
  END IF;
END $$;

-- ============================================================================
-- STEP 6: Clean up temporary index
-- ============================================================================

DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_team_id_temp;
