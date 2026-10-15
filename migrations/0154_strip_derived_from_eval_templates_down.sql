-- Down Migration 0154: put MOMENTUM back as an optional test of the global eval template.
--
-- Only the global 'Soccer eval (yards)' template (organization_id NULL, not archived) gets MOMENTUM back, as
-- an optional entry after the last existing one, and only when it has no MOMENTUM entry and a MOMENTUM
-- site_metrics row exists. Organization templates are not restored (the stripped entries are not recorded).
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0154.

DO $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  IF to_regclass('eval_battery_templates') IS NOT NULL
     AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'MOMENTUM') THEN
    UPDATE eval_battery_templates t
       SET metrics = t.metrics || jsonb_build_array(jsonb_build_object(
             'metricKey', 'MOMENTUM',
             'isRequired', false,
             'displayOrder', COALESCE((SELECT MAX((e.value->>'displayOrder')::int) FROM jsonb_array_elements(t.metrics) AS e(value)), 0) + 1
           )),
           updated_at = NOW()
     WHERE t.organization_id IS NULL
       AND t.name = 'Soccer eval (yards)'
       AND t.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.metrics) AS e(value) WHERE e.value->>'metricKey' = 'MOMENTUM');
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0154_strip_derived_from_eval_templates';
  END IF;
  RAISE NOTICE 'Migration 0154 (down): MOMENTUM re-added to % global template(s).', v_updated;
END $$;
