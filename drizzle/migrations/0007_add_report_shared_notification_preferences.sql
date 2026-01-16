-- Migration: Add report_shared notification preferences
-- Description: Add push_report_shared and email_report_shared columns to notification_preferences table
-- Author: TDD Implementation
-- Date: 2026-01-15

-- Add push_report_shared column (for push notification preferences)
ALTER TABLE "notification_preferences"
ADD COLUMN IF NOT EXISTS "push_report_shared" boolean DEFAULT true NOT NULL;

-- Add email_report_shared column (for email notification preferences)
ALTER TABLE "notification_preferences"
ADD COLUMN IF NOT EXISTS "email_report_shared" boolean DEFAULT true NOT NULL;

-- Update notification type enum to include 'report_shared'
-- Note: This is a type change that requires special handling
-- PostgreSQL doesn't support ALTER TYPE ... ADD VALUE IF NOT EXISTS, so we use a DO block

DO $$
BEGIN
  -- Check if 'report_shared' value already exists in the enum
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'notification_type_enum'
    AND e.enumlabel = 'report_shared'
  ) THEN
    -- Add 'report_shared' to the enum
    ALTER TYPE notification_type_enum ADD VALUE 'report_shared';
  END IF;
END $$;

-- Add comment to document the new notification type
COMMENT ON COLUMN "notification_preferences"."push_report_shared" IS 'Enable/disable push notifications when a coach shares a performance report';
COMMENT ON COLUMN "notification_preferences"."email_report_shared" IS 'Enable/disable email notifications when a coach shares a performance report';
