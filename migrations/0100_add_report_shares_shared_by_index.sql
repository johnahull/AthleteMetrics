-- Migration: Add index on report_shares.shared_by
-- Description: Improves performance for queries finding reports shared by a specific user
-- Issue: Missing index causes full table scans for "reports I shared" queries
-- OWASP: Performance optimization - prevents resource exhaustion

-- Add index for shared_by column to optimize queries like:
-- "SELECT * FROM report_shares WHERE shared_by = :userId"
-- Used when coaches view the list of reports they've shared with athletes

CREATE INDEX CONCURRENTLY IF NOT EXISTS report_shares_shared_by_idx
  ON report_shares(shared_by);

-- Add comment for documentation
COMMENT ON INDEX report_shares_shared_by_idx IS 'Optimizes queries for reports shared by a specific user (coach). Prevents full table scans when viewing "Reports I Shared" list.';
