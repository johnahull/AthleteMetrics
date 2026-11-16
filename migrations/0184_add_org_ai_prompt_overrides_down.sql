-- Down migration 0184: drop organizations.ai_prompt_overrides (the wording in it is lost). Forgets the
-- manual_migrations row so db:migrate:manual re-applies 0184.

ALTER TABLE organizations DROP COLUMN IF EXISTS ai_prompt_overrides;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0184_add_org_ai_prompt_overrides';
  END IF;
END $$;
