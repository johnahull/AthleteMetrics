-- Down Migration: Remove archive and dismiss columns from reports system
-- Rollback for: 0103_add_report_archive_dismiss.sql

-- Drop indexes first
DROP INDEX IF EXISTS report_shares_athlete_not_dismissed_idx;
DROP INDEX IF EXISTS report_shares_dismissed_at_idx;
DROP INDEX IF EXISTS reports_org_pinned_not_archived_idx;
DROP INDEX IF EXISTS reports_org_not_archived_idx;
DROP INDEX IF EXISTS reports_archived_at_idx;

-- Remove columns
ALTER TABLE report_shares DROP COLUMN IF EXISTS dismissed_at;
ALTER TABLE reports DROP COLUMN IF EXISTS archived_at;
