-- Migration 0038 Rollback: Remove Report Insights Columns
-- Purpose: Rollback coaching insights columns from reports table
-- Author: Claude Code (Coaching Insights Feature)
-- Date: 2025-11-17

-- Drop index first
DROP INDEX IF EXISTS reports_has_insights_idx;

-- Remove columns
ALTER TABLE reports DROP COLUMN IF EXISTS coaching_insights_model;
ALTER TABLE reports DROP COLUMN IF EXISTS coaching_insights_generated_at;
ALTER TABLE reports DROP COLUMN IF EXISTS coaching_insights;
