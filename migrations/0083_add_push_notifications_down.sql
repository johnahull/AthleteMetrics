-- Migration: 0083_add_push_notifications_down
-- Description: Rollback push notification infrastructure tables
-- WARNING: This will delete all push notification data!

-- Drop indexes first
DROP INDEX IF EXISTS notification_history_sent_at_idx;
DROP INDEX IF EXISTS notification_history_type_idx;
DROP INDEX IF EXISTS notification_history_org_idx;
DROP INDEX IF EXISTS notification_history_user_idx;
DROP INDEX IF EXISTS push_subscriptions_endpoint_idx;
DROP INDEX IF EXISTS push_subscriptions_user_idx;

-- Drop tables in order (respecting foreign key dependencies)
DROP TABLE IF EXISTS org_notification_settings;
DROP TABLE IF EXISTS notification_history;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS push_subscriptions;
