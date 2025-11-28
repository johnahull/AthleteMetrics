-- Rollback Migration 0046: Remove reports needs insights index

DROP INDEX IF EXISTS reports_needs_insights_idx;
