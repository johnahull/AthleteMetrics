-- Down Migration 0166: remove report templates.
--
-- Refuses to run while any template exists, so no coach work is dropped silently.

DO $$
DECLARE
  v_templates INTEGER := 0;
BEGIN
  IF to_regclass('report_templates') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_templates FROM report_templates;
  END IF;

  IF v_templates > 0 THEN
    RAISE EXCEPTION 'Migration 0166 (down) refused: % report templates still exist. Delete them first if removal is intended.', v_templates;
  END IF;
END $$;

DROP TABLE IF EXISTS report_templates;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0166_add_report_templates';
  END IF;
  RAISE NOTICE 'Migration 0166 (down): Removed report_templates.';
END $$;
