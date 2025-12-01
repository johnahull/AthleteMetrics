-- Migration: Add notification tracking columns to user_global_athlete_links
-- These columns track when users are notified about auto-linking and when they acknowledge it

-- Add notification columns
ALTER TABLE user_global_athlete_links
ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS notification_acknowledged_at TIMESTAMP;

-- Add index for finding unacknowledged notifications
CREATE INDEX IF NOT EXISTS ugal_pending_notifications_idx
ON user_global_athlete_links (user_id, notified_at)
WHERE notified_at IS NOT NULL AND notification_acknowledged_at IS NULL;

COMMENT ON COLUMN user_global_athlete_links.notified_at IS 'When the user was notified about this link (null for link creators)';
COMMENT ON COLUMN user_global_athlete_links.notification_acknowledged_at IS 'When the user acknowledged the notification';
