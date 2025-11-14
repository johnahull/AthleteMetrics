-- Rollback migration: Restore NOT NULL constraints on createdBy columns
-- WARNING: This rollback will FAIL if any NULL values exist in created_by columns
-- Only safe to rollback immediately after forward migration if no user deletions occurred

-- Restore reports.created_by NOT NULL
ALTER TABLE reports
ALTER COLUMN created_by SET NOT NULL;

-- Restore report_snapshots.created_by NOT NULL
ALTER TABLE report_snapshots
ALTER COLUMN created_by SET NOT NULL;
