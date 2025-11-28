-- Rollback Migration: Remove sports and positions management system
-- Purpose: Safely revert migration 0058
-- Created: 2025-11-27

-- ============================================================================
-- PART 1: REVERT DATA MIGRATION (Codes back to Names)
-- ============================================================================

-- Revert users.sports from codes ("SOCCER") back to names ("Soccer")
UPDATE users
SET sports = ARRAY['Soccer']
WHERE sports @> ARRAY['SOCCER'];

-- Revert teams.sport from code to name
UPDATE teams
SET sport = 'Soccer'
WHERE sport = 'SOCCER';

-- ============================================================================
-- PART 2: DROP GIN INDEXES
-- ============================================================================

DROP INDEX IF EXISTS users_sports_gin_idx;
DROP INDEX IF EXISTS users_positions_gin_idx;

-- ============================================================================
-- PART 3: DROP TABLES (CASCADE handles foreign keys)
-- ============================================================================

DROP TABLE IF EXISTS site_positions;
DROP TABLE IF EXISTS site_sports;

-- ============================================================================
-- PART 4: LOG ROLLBACK COMPLETION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Rollback 0058 complete: Sports and positions management removed';
  RAISE NOTICE '- Dropped site_positions and site_sports tables';
  RAISE NOTICE '- Reverted data from codes back to names';
  RAISE NOTICE '- Dropped GIN indexes';
  RAISE NOTICE '=================================================================';
END $$;
