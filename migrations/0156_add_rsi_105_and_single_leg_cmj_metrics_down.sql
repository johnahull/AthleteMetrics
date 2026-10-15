-- Down Migration 0156: remove RSI_105, JUMP_CMJ_SL_L and JUMP_CMJ_SL_R and their global eval template entries
--
-- Refuses to run while any measurement, goal, event metric, report benchmark, custom benchmark or site benchmark uses one
-- of the three codes: they are entered (not derived) metrics, so measurements are real data and are never deleted here.
-- Removes the RSI_BILATERAL, CMJ_SL_LEFT and CMJ_SL_RIGHT entries (by key or literal code) from the global
-- 'Soccer eval (yards)' template (organization_id NULL, not archived, metrics a jsonb array) only; organization templates
-- are left alone (their entries then resolve as 'missing'). A template that would be left with no entries is not
-- rewritten. organization_metrics rows cascade-delete with the site_metrics rows. RSI and JUMP_CMJ_HOH are untouched.
-- Limit: an unused row with one of these codes is deleted even if it existed before 0156 (staging and production had
-- none when 0156 was written).
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0156.

DO $$
DECLARE
  v_codes TEXT[] := ARRAY['RSI_105', 'JUMP_CMJ_SL_L', 'JUMP_CMJ_SL_R'];
  v_measurements INTEGER;
  v_goals INTEGER;
  v_event_metrics INTEGER;
  v_report_benchmarks INTEGER;
  v_custom_benchmarks INTEGER;
  v_site_benchmarks INTEGER;
  v_templates INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO v_measurements FROM measurements WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_goals FROM goals WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_event_metrics FROM event_metrics WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_report_benchmarks FROM report_benchmarks WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_custom_benchmarks FROM custom_benchmarks WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_site_benchmarks FROM site_benchmarks WHERE metric_code = ANY(v_codes);

  IF v_measurements + v_goals + v_event_metrics + v_report_benchmarks + v_custom_benchmarks + v_site_benchmarks > 0 THEN
    RAISE EXCEPTION 'Migration 0156 (down) refused: RSI_105 / JUMP_CMJ_SL_L / JUMP_CMJ_SL_R are still used (% measurements, % goals, % event_metrics, % report_benchmarks, % custom_benchmarks, % site_benchmarks). Delete them first if removal is intended.',
      v_measurements, v_goals, v_event_metrics, v_report_benchmarks, v_custom_benchmarks, v_site_benchmarks;
  END IF;

  WITH stripped AS (
    SELECT t.id,
           (SELECT COALESCE(jsonb_agg(e.value ORDER BY e.ord), '[]'::jsonb)
              FROM jsonb_array_elements(t.metrics) WITH ORDINALITY AS e(value, ord)
             WHERE NOT COALESCE(e.value->>'metricKey' IN ('RSI_BILATERAL', 'CMJ_SL_LEFT', 'CMJ_SL_RIGHT', 'RSI_105', 'JUMP_CMJ_SL_L', 'JUMP_CMJ_SL_R'), false)) AS kept
      FROM eval_battery_templates t
     WHERE t.organization_id IS NULL AND t.name = 'Soccer eval (yards)' AND t.archived_at IS NULL
       AND jsonb_typeof(t.metrics) = 'array'
  )
  UPDATE eval_battery_templates t
     SET metrics = s.kept, updated_at = NOW()
    FROM stripped s
   WHERE s.id = t.id AND s.kept <> t.metrics AND jsonb_array_length(s.kept) > 0;
  GET DIAGNOSTICS v_templates = ROW_COUNT;

  DELETE FROM site_metrics WHERE code = ANY(v_codes);

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0156_add_rsi_105_and_single_leg_cmj_metrics';
  END IF;
  RAISE NOTICE 'Migration 0156 (down): removed RSI_105, JUMP_CMJ_SL_L, JUMP_CMJ_SL_R and their entries from % global template(s).', v_templates;
END $$;
