-- Migration: Add report_shared notification preferences
-- Description: Add push_report_shared and email_report_shared columns to notification_preferences table
-- Feature: Report Sharing to Athletes (PR #295)

-- Add push_report_shared column (for push notification preferences)
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS push_report_shared boolean DEFAULT true NOT NULL;

-- Add email_report_shared column (for email notification preferences)
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS email_report_shared boolean DEFAULT true NOT NULL;

-- Note: The notification type 'report_shared' is stored as text in notification_history.type
-- No enum modification needed - the schema uses text columns for notification types

-- Add comments for documentation
COMMENT ON COLUMN notification_preferences.push_report_shared IS 'Enable/disable push notifications when a coach shares a performance report';
COMMENT ON COLUMN notification_preferences.email_report_shared IS 'Enable/disable email notifications when a coach shares a performance report';
