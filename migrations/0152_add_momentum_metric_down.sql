-- Down Migration 0152: Remove the MOMENTUM derived metric
--
-- Refuses to run if any goal, report benchmark, event metric, custom benchmark or
-- site benchmark references MOMENTUM, so nothing is orphaned or cascade-deleted.
-- ALL MOMENTUM measurements are deleted deliberately, including any directly entered
-- (non-calculated) rows: the metric is derived, so rows are normally calculated and
-- recomputable from WEIGHT_LBS + FLY10_TIME by re-applying 0152, and the measurements
-- must go before the site_metrics row. Source metrics are untouched.
-- organization_metrics rows cascade-delete with the site_metrics row;
-- peer_percentile_cache is a recomputable cache.
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0152.

DO $$
DECLARE
  v_goals INTEGER;
  v_report_benchmarks INTEGER;
  v_event_metrics INTEGER;
  v_custom_benchmarks INTEGER;
  v_site_benchmarks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_goals FROM goals WHERE metric = 'MOMENTUM';
  SELECT COUNT(*) INTO v_report_benchmarks FROM report_benchmarks WHERE metric_code = 'MOMENTUM';
  SELECT COUNT(*) INTO v_event_metrics FROM event_metrics WHERE metric_code = 'MOMENTUM';
  SELECT COUNT(*) INTO v_custom_benchmarks FROM custom_benchmarks WHERE metric_code = 'MOMENTUM';
  SELECT COUNT(*) INTO v_site_benchmarks FROM site_benchmarks WHERE metric_code = 'MOMENTUM';

  IF v_goals + v_report_benchmarks + v_event_metrics + v_custom_benchmarks + v_site_benchmarks > 0 THEN
    RAISE EXCEPTION 'Migration 0152 (down) refused: MOMENTUM is still referenced (% goals, % report_benchmarks, % event_metrics, % custom_benchmarks, % site_benchmarks). Delete them first if removal is intended.',
      v_goals, v_report_benchmarks, v_event_metrics, v_custom_benchmarks, v_site_benchmarks;
  END IF;
END $$;

DELETE FROM measurements WHERE metric = 'MOMENTUM';

DELETE FROM site_metrics WHERE code = 'MOMENTUM';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0152_add_momentum_metric';
  END IF;
  RAISE NOTICE 'Migration 0152 (down): Removed MOMENTUM metric and its measurements.';
END $$;
