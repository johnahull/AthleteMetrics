-- Down Migration 0161: drop display_format from site_metrics and custom_org_metrics
--
-- Duration metrics fall back to plain seconds; no measurement value changes.

ALTER TABLE site_metrics DROP COLUMN IF EXISTS display_format;
ALTER TABLE custom_org_metrics DROP COLUMN IF EXISTS display_format;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0161_add_metric_display_format';
  END IF;
END $$;
