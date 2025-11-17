-- Migration 0040 Rollback: Remove Missing Insights Indexes
-- Purpose: Remove the insights indexes
-- Author: Claude Code (Code Review Fix)
-- Date: 2025-11-17

-- Drop index for reports without insights
DROP INDEX IF EXISTS reports_needs_insights_idx;
