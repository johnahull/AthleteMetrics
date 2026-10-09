-- Down Migration 0153: remove eval battery templates and org eval report settings.
--
-- Refuses to run while any organization-owned template or any org settings row exists, so no coach
-- work is dropped silently. The seeded global template goes away with the table.

DO $$
DECLARE
  v_templates INTEGER := 0;
  v_settings INTEGER := 0;
BEGIN
  IF to_regclass('eval_battery_templates') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_templates FROM eval_battery_templates WHERE organization_id IS NOT NULL;
  END IF;
  IF to_regclass('org_eval_report_settings') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_settings FROM org_eval_report_settings;
  END IF;

  IF v_templates + v_settings > 0 THEN
    RAISE EXCEPTION 'Migration 0153 (down) refused: % organization templates and % org eval report settings rows still exist. Delete them first if removal is intended.',
      v_templates, v_settings;
  END IF;
END $$;

DROP INDEX IF EXISTS reports_eval_athlete_event_idx;
DROP TABLE IF EXISTS org_eval_report_settings;
DROP TABLE IF EXISTS eval_battery_templates;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0153_add_eval_report_templates';
  END IF;
  RAISE NOTICE 'Migration 0153 (down): Removed eval_battery_templates and org_eval_report_settings.';
END $$;
