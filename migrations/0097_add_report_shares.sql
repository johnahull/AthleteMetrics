-- Migration: Add report_shares table
-- Description: Allows coaches to share reports with athletes' accounts
-- Feature: Report Sharing to Athletes (PR #295)

-- Create the report_shares table
CREATE TABLE IF NOT EXISTS report_shares (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id VARCHAR NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    athlete_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    message TEXT,
    viewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now() NOT NULL,

    -- Prevent duplicate shares of same report to same athlete
    CONSTRAINT report_shares_unique_report_athlete UNIQUE (report_id, athlete_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS report_shares_report_idx ON report_shares(report_id);
CREATE INDEX IF NOT EXISTS report_shares_athlete_idx ON report_shares(athlete_id);
CREATE INDEX IF NOT EXISTS report_shares_org_idx ON report_shares(organization_id);

-- Add comment for documentation
COMMENT ON TABLE report_shares IS 'Tracks which reports have been shared with which athletes. Enables coaches to share individual or team reports with athletes in their organization.';
