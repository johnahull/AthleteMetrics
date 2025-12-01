-- Rollback: Remove notification tracking columns from user_global_athlete_links

-- Drop the index
DROP INDEX IF EXISTS ugal_pending_notifications_idx;

-- Remove the columns
ALTER TABLE user_global_athlete_links
DROP COLUMN IF EXISTS notified_at,
DROP COLUMN IF EXISTS notification_acknowledged_at;
