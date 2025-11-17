-- Migration 0040: Add Missing Insights Indexes
-- Purpose: Optimize queries for reports without insights
-- Author: Claude Code (Code Review Fix)
-- Date: 2025-11-17

-- Index for finding reports without insights (common query: "Which reports need insights?")
CREATE INDEX IF NOT EXISTS reports_needs_insights_idx
  ON reports(organization_id, id)
  WHERE coaching_insights IS NULL;

-- Comment explaining the index
COMMENT ON INDEX reports_needs_insights_idx IS
  'Optimizes queries for finding reports that need coaching insights generated';
