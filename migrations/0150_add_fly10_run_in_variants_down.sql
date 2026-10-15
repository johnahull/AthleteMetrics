-- Down Migration 0150: Remove FLY10 run-in variant metrics
--
-- Refuses to run if any measurement, goal, report benchmark, event metric,
-- custom benchmark or site benchmark references a new code, so no data is
-- orphaned or cascade-deleted. peer_percentile_cache rows are not checked: it is
-- a recomputable cache that cascade-deletes with the site_metrics row.
-- Restores the FLY10_TIME label/description/explanation as left by 0022/0121
-- (admin edits made after 0150 are overwritten).
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0150.

DO $$
DECLARE
  v_codes TEXT[] := ARRAY['FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30'];
  v_measurements INTEGER;
  v_goals INTEGER;
  v_report_benchmarks INTEGER;
  v_event_metrics INTEGER;
  v_custom_benchmarks INTEGER;
  v_site_benchmarks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_measurements FROM measurements WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_goals FROM goals WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_report_benchmarks FROM report_benchmarks WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_event_metrics FROM event_metrics WHERE metric_code = ANY(v_codes);

  SELECT COUNT(*) INTO v_custom_benchmarks FROM custom_benchmarks WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_site_benchmarks FROM site_benchmarks WHERE metric_code = ANY(v_codes);

  IF v_measurements + v_goals + v_report_benchmarks + v_event_metrics + v_custom_benchmarks + v_site_benchmarks > 0 THEN
    RAISE EXCEPTION 'Migration 0150 (down) refused: FLY10 run-in metrics are still referenced (% measurements, % goals, % report_benchmarks, % event_metrics, % custom_benchmarks, % site_benchmarks). Delete them first if removal is intended.',
      v_measurements, v_goals, v_report_benchmarks, v_event_metrics, v_custom_benchmarks, v_site_benchmarks;
  END IF;
END $$;

-- organization_metrics rows cascade-delete with the site_metrics rows.
DELETE FROM site_metrics
 WHERE code IN ('FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30');

UPDATE site_metrics
   SET label = '10-Yard Fly Time',
       description = 'Time to cover 10 yards after a flying start, measuring maximum velocity.',
       short_description = 'How fast you cover 10 yards at top speed — a pure max velocity measurement.',
       what_it_measures = 'The 10-yard fly measures the time it takes to run 10 yards after you are already up to full speed. When converted from time to speed, it is essentially a maximum velocity measurement.',
       why_it_matters = 'Max velocity separates fast athletes from the fastest. In game situations you''re often already moving — this test captures how fast you actually are once acceleration is out of the picture.',
       updated_at = NOW()
 WHERE code = 'FLY10_TIME';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0150_add_fly10_run_in_variants';
  END IF;
  RAISE NOTICE 'Migration 0150 (down): Removed 4 FLY10 run-in metrics and restored FLY10_TIME label.';
END $$;
