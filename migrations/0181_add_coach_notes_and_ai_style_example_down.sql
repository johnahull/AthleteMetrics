-- Down Migration 0181: drop reports.coach_notes and organizations.ai_style_example (the data in them is lost)
--
-- Forgets the manual_migrations row so db:migrate:manual re-applies 0181.

ALTER TABLE reports DROP COLUMN IF EXISTS coach_notes;
ALTER TABLE organizations DROP COLUMN IF EXISTS ai_style_example;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0181_add_coach_notes_and_ai_style_example';
  END IF;
END $$;
