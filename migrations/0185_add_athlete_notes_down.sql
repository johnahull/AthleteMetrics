-- Down migration 0185: drop athlete_notes (every coaching note is lost)
--
-- Forgets the manual_migrations row so db:migrate:manual re-applies 0185.

DROP TABLE IF EXISTS athlete_notes;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0185_add_athlete_notes';
  END IF;
END $$;
