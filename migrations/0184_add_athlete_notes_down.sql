-- Down migration 0184: drop athlete_notes (every coaching note is lost)
--
-- Forgets the manual_migrations row so db:migrate:manual re-applies 0184.

DROP TABLE IF EXISTS athlete_notes;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0184_add_athlete_notes';
  END IF;
END $$;
