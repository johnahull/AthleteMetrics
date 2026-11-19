-- Down migration 0186: drop metrics.meaning (every stored meaning text is lost)
--
-- Forgets the manual_migrations row so db:migrate:manual re-applies 0186.

ALTER TABLE site_metrics DROP COLUMN IF EXISTS meaning;
ALTER TABLE custom_org_metrics DROP COLUMN IF EXISTS meaning;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0186_add_metric_meaning';
  END IF;
END $$;
