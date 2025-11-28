-- ============================================================================
-- Rollback Wellness Performance Indexes Migration (0056)
-- ============================================================================
-- Purpose: Remove wellness performance indexes added in migration 0056
-- Impact: Queries will revert to previous performance levels
-- Safe to run: YES - only removes indexes, data is preserved
-- ============================================================================

-- Drop wellness_responses indexes
DROP INDEX IF EXISTS idx_wellness_responses_recent;
DROP INDEX IF EXISTS idx_wellness_responses_org_date_submitted;
DROP INDEX IF EXISTS idx_wellness_responses_request_user;
DROP INDEX IF EXISTS idx_wellness_responses_team_date_submitted;
DROP INDEX IF EXISTS idx_wellness_responses_user_submitted;

-- Drop wellness_templates indexes
DROP INDEX IF EXISTS idx_wellness_templates_system_active;
DROP INDEX IF EXISTS idx_wellness_templates_org_active;

-- ============================================================================
-- ROLLBACK SUMMARY
-- ============================================================================
-- Removed 7 performance indexes:
--   - 5 wellness_responses indexes
--   - 2 wellness_templates indexes
--
-- Data preserved - only indexes removed
-- Queries will use existing indexes from migrations 0049-0050
-- ============================================================================
