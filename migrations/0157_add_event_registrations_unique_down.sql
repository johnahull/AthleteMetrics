-- Down Migration 0157: drop event_registrations_event_user_unique
--
-- Bulk-add (ON CONFLICT (event_id, user_id)) answers 500 again on a database built without the constraint.
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0157.

ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_event_user_unique;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0157_add_event_registrations_unique';
  END IF;
END $$;
