-- Migration: Add archive and dismiss columns to reports system
-- Description: Enables soft-hide functionality for coaches (archive reports) and athletes (dismiss shared reports)
-- Feature: Report Archive & Dismiss (PR #298)

-- Add archived_at column to reports table (for coach archive functionality)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

-- Add dismissed_at column to report_shares table (for athlete dismiss functionality)
ALTER TABLE report_shares ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP;

-- Create index for efficient filtering of archived reports
CREATE INDEX IF NOT EXISTS reports_archived_at_idx ON reports(archived_at);

-- Create composite index for querying non-archived reports by organization
CREATE INDEX IF NOT EXISTS reports_org_not_archived_idx ON reports(organization_id) WHERE archived_at IS NULL;

-- Create index for efficient filtering of dismissed shares
CREATE INDEX IF NOT EXISTS report_shares_dismissed_at_idx ON report_shares(dismissed_at);

-- Create composite index for querying non-dismissed shares by athlete
CREATE INDEX IF NOT EXISTS report_shares_athlete_not_dismissed_idx ON report_shares(athlete_id) WHERE dismissed_at IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN reports.archived_at IS 'Timestamp when coach archived this report. NULL means not archived. Archived reports are hidden from coach UI but still visible to athletes who received them.';
COMMENT ON COLUMN report_shares.dismissed_at IS 'Timestamp when athlete dismissed this shared report. NULL means not dismissed. Dismissed reports are hidden from athlete UI but coach can still see the share.';
