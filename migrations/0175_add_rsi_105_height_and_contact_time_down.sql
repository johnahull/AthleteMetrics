-- Migration 0175 (down): remove RSI_105_HEIGHT and RSI_105_GCT
--
-- Refuses to run while any measurement, goal, event metric, report benchmark, custom benchmark, site benchmark, saved report or report template uses one
-- of the two codes: they are entered metrics, so measurements are real data and are never deleted here.
-- organization_metrics rows cascade-delete with the site_metrics rows. RSI_105 is untouched.
-- Limit: an unused row with one of these codes is deleted even if it existed before 0175.
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0175.

DO $$
DECLARE
  v_codes TEXT[] := ARRAY['RSI_105_HEIGHT', 'RSI_105_GCT'];
  v_measurements INTEGER;
  v_goals INTEGER;
  v_event_metrics INTEGER;
  v_report_benchmarks INTEGER;
  v_custom_benchmarks INTEGER;
  v_site_benchmarks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_measurements FROM measurements WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_goals FROM goals WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_event_metrics FROM event_metrics WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_report_benchmarks FROM report_benchmarks WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_custom_benchmarks FROM custom_benchmarks WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_site_benchmarks FROM site_benchmarks WHERE metric_code = ANY(v_codes);

  IF v_measurements + v_goals + v_event_metrics + v_report_benchmarks + v_custom_benchmarks + v_site_benchmarks > 0 THEN
    RAISE EXCEPTION 'Migration 0175 (down) refused: RSI_105_HEIGHT / RSI_105_GCT are still used (% measurements, % goals, % event_metrics, % report_benchmarks, % custom_benchmarks, % site_benchmarks). Delete them first if removal is intended.',
      v_measurements, v_goals, v_event_metrics, v_report_benchmarks, v_custom_benchmarks, v_site_benchmarks;
  END IF;

  -- Saved reports and report templates keep metric codes in JSON with no foreign key. A plain substring match on the JSON
  -- text, deliberately over-cautious: refusing is safer than leaving reports that point at deleted metrics. Full codes, not
  -- a 'RSI_105_' prefix, so a report that only names RSI_105 itself does not block the rollback.
  IF EXISTS (SELECT 1 FROM reports WHERE strpos(config::text, 'RSI_105_HEIGHT') > 0 OR strpos(config::text, 'RSI_105_GCT') > 0)
     OR EXISTS (SELECT 1 FROM report_templates WHERE strpos(metrics::text, 'RSI_105_HEIGHT') > 0 OR strpos(metrics::text, 'RSI_105_GCT') > 0) THEN
    RAISE EXCEPTION 'Migration 0175 (down) refused: reports or report templates reference RSI_105_HEIGHT / RSI_105_GCT. Remove them from those first if removal is intended.';
  END IF;

  -- No foreign key on site_metric_explanations.metric_code, so it is not cleaned up by the metric delete
  DELETE FROM site_metric_explanations WHERE metric_code = ANY(v_codes);
  DELETE FROM organization_metrics WHERE metric_code = ANY(v_codes);
  DELETE FROM site_metrics WHERE code = ANY(v_codes);

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0175_add_rsi_105_height_and_contact_time';
  END IF;
END $$;
