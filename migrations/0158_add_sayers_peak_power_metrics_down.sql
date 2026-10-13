-- Down Migration 0158: Remove the Sayers peak power derived metrics (PEAK_POWER_W, PEAK_POWER_REL)
--
-- Refuses to run if any goal, report benchmark, event metric, custom benchmark or site benchmark
-- references either code, so nothing is orphaned or cascade-deleted.
-- ALL measurements of both codes are deleted deliberately, including any directly entered
-- (non-calculated) rows: the metrics are derived, so rows are normally calculated and
-- recomputable from JUMP_CMJ_HOH + WEIGHT_LBS by re-applying 0158 and running the backfill, and the
-- measurements must go before the site_metrics rows. Source metrics (JUMP_CMJ_HOH, WEIGHT_LBS,
-- including a WEIGHT_LBS that 0158 created) are never touched.
-- organization_metrics rows cascade-delete with the site_metrics rows;
-- peer_percentile_cache is a recomputable cache.
-- Eval battery templates are deliberately NOT checked: the template service rejects any derived metric
-- as a template test (eval-template-service.ts, reason 'derived') and 0154 stripped existing ones, so a
-- template cannot reference these codes.
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0158.

DO $$
DECLARE
  v_goals INTEGER;
  v_report_benchmarks INTEGER;
  v_event_metrics INTEGER;
  v_custom_benchmarks INTEGER;
  v_site_benchmarks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_goals FROM goals WHERE metric IN ('PEAK_POWER_W', 'PEAK_POWER_REL');
  SELECT COUNT(*) INTO v_report_benchmarks FROM report_benchmarks WHERE metric_code IN ('PEAK_POWER_W', 'PEAK_POWER_REL');
  SELECT COUNT(*) INTO v_event_metrics FROM event_metrics WHERE metric_code IN ('PEAK_POWER_W', 'PEAK_POWER_REL');
  SELECT COUNT(*) INTO v_custom_benchmarks FROM custom_benchmarks WHERE metric_code IN ('PEAK_POWER_W', 'PEAK_POWER_REL');
  SELECT COUNT(*) INTO v_site_benchmarks FROM site_benchmarks WHERE metric_code IN ('PEAK_POWER_W', 'PEAK_POWER_REL');

  IF v_goals + v_report_benchmarks + v_event_metrics + v_custom_benchmarks + v_site_benchmarks > 0 THEN
    RAISE EXCEPTION 'Migration 0158 (down) refused: PEAK_POWER_W / PEAK_POWER_REL are still referenced (% goals, % report_benchmarks, % event_metrics, % custom_benchmarks, % site_benchmarks). Delete them first if removal is intended.',
      v_goals, v_report_benchmarks, v_event_metrics, v_custom_benchmarks, v_site_benchmarks;
  END IF;
END $$;

DELETE FROM measurements WHERE metric IN ('PEAK_POWER_W', 'PEAK_POWER_REL');

DELETE FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL');

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0158_add_sayers_peak_power_metrics';
  END IF;
  RAISE NOTICE 'Migration 0158 (down): Removed PEAK_POWER_W and PEAK_POWER_REL and their measurements.';
END $$;
