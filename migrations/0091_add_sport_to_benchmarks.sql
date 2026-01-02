-- Migration: Add sport column to benchmark tables
-- Purpose: Enable sport-specific benchmark filtering for position-based benchmarks
-- Date: 2026-01-01
-- Feature: Sport and Position Filters for Benchmarks
--
-- Context: Benchmarks can now be filtered by sport and position. The position
-- field requires a sport to be set (enforced via Zod validation). This migration
-- adds the sport column to both site_benchmarks and custom_benchmarks tables.
--
-- Requirements:
-- 1. sport field accepts valid sport codes (varchar 50, optional, nullable)
-- 2. position field accepts valid position names (already exists, optional)
-- 3. position requires sport when set (enforced via CHECK constraints and Zod validation)
-- 4. both fields can be null (applies to all sports/positions)

-- Add sport column to site_benchmarks
ALTER TABLE site_benchmarks
ADD COLUMN IF NOT EXISTS sport varchar(50);

-- Add comment for documentation
COMMENT ON COLUMN site_benchmarks.sport IS
  'Sport code filter (e.g., SOCCER, BASKETBALL). When set with position, creates sport-position specific benchmarks. NULL = applies to all sports.';

-- Add CHECK constraint to enforce "position requires sport" rule
-- This prevents position being set without a sport at the database level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_benchmarks_position_requires_sport'
  ) THEN
    ALTER TABLE site_benchmarks
    ADD CONSTRAINT site_benchmarks_position_requires_sport
    CHECK (
      (position IS NULL OR TRIM(position) = '') OR
      (sport IS NOT NULL AND TRIM(sport) != '')
    );
  END IF;
END $$;

-- Add sport column to custom_benchmarks
ALTER TABLE custom_benchmarks
ADD COLUMN IF NOT EXISTS sport varchar(50);

-- Add comment for documentation
COMMENT ON COLUMN custom_benchmarks.sport IS
  'Sport code filter (e.g., SOCCER, BASKETBALL). When set with position, creates sport-position specific benchmarks. NULL = applies to all sports.';

-- Add CHECK constraint to enforce "position requires sport" rule
-- This prevents position being set without a sport at the database level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'custom_benchmarks_position_requires_sport'
  ) THEN
    ALTER TABLE custom_benchmarks
    ADD CONSTRAINT custom_benchmarks_position_requires_sport
    CHECK (
      (position IS NULL OR TRIM(position) = '') OR
      (sport IS NOT NULL AND TRIM(sport) != '')
    );
  END IF;
END $$;

-- Add index for sport filtering on site_benchmarks
-- This optimizes queries that filter benchmarks by sport
CREATE INDEX IF NOT EXISTS idx_site_benchmarks_sport
  ON site_benchmarks(sport)
  WHERE sport IS NOT NULL;

-- Add index for sport filtering on custom_benchmarks
CREATE INDEX IF NOT EXISTS idx_custom_benchmarks_sport
  ON custom_benchmarks(sport)
  WHERE sport IS NOT NULL;

-- Add composite index for sport+position filtering on site_benchmarks
-- This optimizes queries that filter benchmarks by both sport and position
CREATE INDEX IF NOT EXISTS idx_site_benchmarks_sport_position
  ON site_benchmarks(sport, position)
  WHERE sport IS NOT NULL AND position IS NOT NULL;

-- Add composite index for sport+position filtering on custom_benchmarks
CREATE INDEX IF NOT EXISTS idx_custom_benchmarks_sport_position
  ON custom_benchmarks(sport, position)
  WHERE sport IS NOT NULL AND position IS NOT NULL;

-- Index comments for documentation
COMMENT ON INDEX idx_site_benchmarks_sport IS
  'Partial index for sport-only filtering. Optimizes queries: WHERE sport = ? (excludes NULL rows). Used by getApplicableBenchmarksForAthlete() in storage.ts.';

COMMENT ON INDEX idx_custom_benchmarks_sport IS
  'Partial index for sport-only filtering. Optimizes queries: WHERE sport = ? (excludes NULL rows). Used by getApplicableBenchmarksForAthlete() in storage.ts.';

COMMENT ON INDEX idx_site_benchmarks_sport_position IS
  'Composite index for combined sport+position filtering. Optimizes queries: WHERE sport = ? AND position = ? (excludes rows where either is NULL). Column order (sport, position) supports sport-only queries via leftmost prefix rule. Used by benchmark applicability checks in storage.ts.';

COMMENT ON INDEX idx_custom_benchmarks_sport_position IS
  'Composite index for combined sport+position filtering. Optimizes queries: WHERE sport = ? AND position = ? (excludes rows where either is NULL). Column order (sport, position) supports sport-only queries via leftmost prefix rule. Used by benchmark applicability checks in storage.ts.';
