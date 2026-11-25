-- Down migration 0187: drop wellness_requests.is_standing and wellness_responses.superseded_at
--
-- Every standing request becomes a one-time request, and superseded rows can no longer be told apart from the live
-- row of their day. Forgets the manual_migrations row so db:migrate:manual re-applies 0187.

ALTER TABLE wellness_requests DROP COLUMN IF EXISTS is_standing;
ALTER TABLE wellness_responses DROP COLUMN IF EXISTS superseded_at;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0187_add_wellness_standing_requests';
  END IF;
END $$;
