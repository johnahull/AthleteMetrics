-- Migration: 0086_add_push_notifications
-- Description: Add push notification infrastructure tables
-- Tables: push_subscriptions, notification_preferences, notification_history, org_notification_settings

-- ============================================================================
-- PUSH SUBSCRIPTIONS TABLE
-- Stores Web Push subscriptions (one user can have multiple devices)
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Web Push subscription data
    endpoint VARCHAR(2048) NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    -- Device metadata
    device_name TEXT,
    user_agent TEXT,
    -- Lifecycle tracking
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP
);

-- Indexes for push_subscriptions
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON push_subscriptions(endpoint);

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- User-level notification toggle controls (one row per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    -- Master toggles
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Push notification type toggles
    push_wellness_surveys BOOLEAN NOT NULL DEFAULT true,
    push_wellness_digest BOOLEAN NOT NULL DEFAULT true,
    push_new_measurements BOOLEAN NOT NULL DEFAULT true,
    push_team_announcements BOOLEAN NOT NULL DEFAULT true,
    -- Email notification type toggles
    email_wellness_surveys BOOLEAN NOT NULL DEFAULT true,
    email_wellness_digest BOOLEAN NOT NULL DEFAULT true,
    email_new_measurements BOOLEAN NOT NULL DEFAULT false,
    email_team_announcements BOOLEAN NOT NULL DEFAULT true,
    -- Quiet hours (optional)
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone TEXT DEFAULT 'America/New_York',
    -- Lifecycle
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- NOTIFICATION HISTORY TABLE
-- Audit log and analytics for sent notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_history (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id VARCHAR REFERENCES organizations(id) ON DELETE SET NULL,
    -- Notification content
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    data JSONB,
    -- Delivery tracking
    channels TEXT[] NOT NULL DEFAULT ARRAY['push']::text[],
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP DEFAULT NOW() NOT NULL,
    delivered_at TIMESTAMP,
    clicked_at TIMESTAMP,
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

-- Add CHECK constraints idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_history_type_check'
  ) THEN
    ALTER TABLE notification_history
    ADD CONSTRAINT notification_history_type_check
    CHECK (type IN ('wellness_survey', 'wellness_digest', 'new_measurement', 'team_announcement'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_history_delivery_status_check'
  ) THEN
    ALTER TABLE notification_history
    ADD CONSTRAINT notification_history_delivery_status_check
    CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'expired'));
  END IF;
END $$;

-- Indexes for notification_history
CREATE INDEX IF NOT EXISTS notification_history_user_idx ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS notification_history_org_idx ON notification_history(org_id);
CREATE INDEX IF NOT EXISTS notification_history_type_idx ON notification_history(type);
CREATE INDEX IF NOT EXISTS notification_history_sent_at_idx ON notification_history(sent_at);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS notification_history_user_sent_idx ON notification_history(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS notification_history_org_type_sent_idx ON notification_history(org_id, type, sent_at DESC) WHERE org_id IS NOT NULL;

-- ============================================================================
-- ORG NOTIFICATION SETTINGS TABLE
-- Organization-level controls set by org admins
-- ============================================================================
CREATE TABLE IF NOT EXISTS org_notification_settings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    -- Master toggle for the organization
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Which notification types are available to users in this org
    wellness_surveys_enabled BOOLEAN NOT NULL DEFAULT true,
    wellness_digest_enabled BOOLEAN NOT NULL DEFAULT true,
    new_measurements_enabled BOOLEAN NOT NULL DEFAULT true,
    team_announcements_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Daily digest configuration for coaches
    digest_time TIME NOT NULL DEFAULT '07:00'::time,
    digest_skip_weekends BOOLEAN NOT NULL DEFAULT false,
    digest_timezone TEXT NOT NULL DEFAULT 'America/New_York',
    -- Default preferences for new users in this org
    default_push_wellness_surveys BOOLEAN NOT NULL DEFAULT true,
    default_push_measurements BOOLEAN NOT NULL DEFAULT true,
    default_push_announcements BOOLEAN NOT NULL DEFAULT true,
    default_email_wellness_surveys BOOLEAN NOT NULL DEFAULT true,
    default_email_measurements BOOLEAN NOT NULL DEFAULT false,
    default_email_announcements BOOLEAN NOT NULL DEFAULT true,
    -- Lifecycle
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- SITE SETTINGS - PUSH NOTIFICATION COLUMNS
-- Global push notification configuration
-- ============================================================================
DO $$
BEGIN
  -- Add push_notifications_enabled column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_settings' AND column_name = 'push_notifications_enabled'
  ) THEN
    ALTER TABLE site_settings
    ADD COLUMN push_notifications_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Add push_default_org_settings column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_settings' AND column_name = 'push_default_org_settings'
  ) THEN
    ALTER TABLE site_settings
    ADD COLUMN push_default_org_settings JSONB;
  END IF;
END $$;

COMMENT ON COLUMN site_settings.push_notifications_enabled IS 'Global kill switch for all push notifications';
COMMENT ON COLUMN site_settings.push_default_org_settings IS 'Default org notification settings for new organizations';
