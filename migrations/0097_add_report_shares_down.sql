-- Down Migration: Remove report_shares table
-- Reverts: 0097_add_report_shares.sql

DROP INDEX IF EXISTS report_shares_org_idx;
DROP INDEX IF EXISTS report_shares_athlete_idx;
DROP INDEX IF EXISTS report_shares_report_idx;
DROP TABLE IF EXISTS report_shares;
