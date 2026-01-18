/**
 * Migration 0099: Add partial index for unread report queries
 *
 * This migration adds a partial index on report_shares to optimize queries
 * for unread reports (WHERE viewed_at IS NULL). The sidebar badge query
 * will benefit from this index.
 *
 * Performance impact: Improves query performance for athletes with many shared reports
 * Rollback: See 0099_add_report_shares_viewed_index_down.sql
 */

-- Add partial index for unread reports query
-- This index only includes rows where viewed_at IS NULL, making it very efficient
-- for the common "unread count" query used in sidebar badges
CREATE INDEX IF NOT EXISTS report_shares_athlete_unviewed_idx
  ON report_shares(athlete_id)
  WHERE viewed_at IS NULL;
