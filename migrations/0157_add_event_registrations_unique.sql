-- Migration 0157: full UNIQUE (event_id, user_id) on event_registrations
--
-- POST /api/events/:eventId/registrations/bulk-add inserts with ON CONFLICT (event_id, user_id). Postgres can only
-- infer that arbiter from a full unique constraint, and schema.ts declares one (event_registrations_event_user_unique),
-- but no migration created it: 0076 only made the partial index event_registrations_user_active_unique. A
-- migration-built database (staging) therefore answered bulk-add with 500 (42P10); db:push databases (CI) had it.
-- Fails (and changes nothing) if a (event_id, user_id) pair already has more than one row; resolve those first.
--
-- The partial index event_registrations_user_active_unique from 0076 is now redundant; it is left in place.
--
-- IDEMPOTENT: safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_registrations_event_user_unique' AND conrelid = 'event_registrations'::regclass
  ) THEN
    ALTER TABLE event_registrations
      ADD CONSTRAINT event_registrations_event_user_unique UNIQUE (event_id, user_id);
  END IF;
END $$;
