-- Down Migration: Remove report_shared notification preferences
-- Reverts: 0098_add_report_shared_notification_preferences.sql

-- Remove columns from notification_preferences
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS push_report_shared;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS email_report_shared;

-- Note: Enum values cannot be easily removed in PostgreSQL
-- The 'report_shared' value will remain but be unused
