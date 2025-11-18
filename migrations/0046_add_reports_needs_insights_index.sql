-- Migration 0046: Add index for reports needing insights
-- Purpose: Optimize queries finding reports without coaching insights
-- Author: Claude Code
-- Date: 2025-11-18

-- Add complementary index for reports WITHOUT insights (idempotent)
CREATE INDEX IF NOT EXISTS reports_needs_insights_idx
  ON reports(organization_id, id)
  WHERE coaching_insights IS NULL;

-- Add comment for documentation
COMMENT ON INDEX reports_needs_insights_idx IS
  'Optimizes queries finding reports that need coaching insights generated';
