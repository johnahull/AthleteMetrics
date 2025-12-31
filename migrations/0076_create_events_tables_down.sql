-- Rollback: Drop Events Tables

-- Drop indexes first
DROP INDEX IF EXISTS event_freeze_overrides_user_idx;
DROP INDEX IF EXISTS event_freeze_overrides_action_idx;
DROP INDEX IF EXISTS event_freeze_overrides_event_idx;

DROP INDEX IF EXISTS event_metrics_display_order_idx;
DROP INDEX IF EXISTS event_metrics_event_idx;

DROP INDEX IF EXISTS event_invitations_status_idx;
DROP INDEX IF EXISTS event_invitations_email_idx;
DROP INDEX IF EXISTS event_invitations_token_idx;
DROP INDEX IF EXISTS event_invitations_user_idx;
DROP INDEX IF EXISTS event_invitations_event_idx;

DROP INDEX IF EXISTS event_registrations_waitlist_idx;
DROP INDEX IF EXISTS event_registrations_event_status_idx;
DROP INDEX IF EXISTS event_registrations_status_idx;
DROP INDEX IF EXISTS event_registrations_user_idx;
DROP INDEX IF EXISTS event_registrations_event_idx;

DROP INDEX IF EXISTS events_org_status_idx;
DROP INDEX IF EXISTS events_code_idx;
DROP INDEX IF EXISTS events_start_date_idx;
DROP INDEX IF EXISTS events_visibility_idx;
DROP INDEX IF EXISTS events_status_idx;
DROP INDEX IF EXISTS events_org_idx;

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS event_freeze_overrides;
DROP TABLE IF EXISTS event_metrics;
DROP TABLE IF EXISTS event_invitations;
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS events;
