-- Down Migration 0150: Remove FLY10 run-in variant metrics
--
-- Refuses to run if any measurement, goal, report benchmark or event metric
-- references a new code, so no data is orphaned or cascade-deleted.
-- Restores the FLY10_TIME label/description from before 0150.

DO $$
DECLARE
  v_codes TEXT[] := ARRAY['FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30'];
  v_measurements INTEGER;
  v_goals INTEGER;
  v_report_benchmarks INTEGER;
  v_event_metrics INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_measurements FROM measurements WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_goals FROM goals WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_report_benchmarks FROM report_benchmarks WHERE metric_code = ANY(v_codes);
  SELECT COUNT(*) INTO v_event_metrics FROM event_metrics WHERE metric_code = ANY(v_codes);

  IF v_measurements + v_goals + v_report_benchmarks + v_event_metrics > 0 THEN
    RAISE EXCEPTION 'Migration 0150 (down) refused: FLY10 run-in metrics are still referenced (% measurements, % goals, % report_benchmarks, % event_metrics). Delete them first if removal is intended.',
      v_measurements, v_goals, v_report_benchmarks, v_event_metrics;
  END IF;
END $$;

-- organization_metrics rows cascade-delete with the site_metrics rows.
DELETE FROM site_metrics
 WHERE code IN ('FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30');

UPDATE site_metrics
   SET label = '10-Yard Fly Time',
       description = 'Time to cover 10 yards after a flying start, measuring maximum velocity.',
       updated_at = NOW()
 WHERE code = 'FLY10_TIME';

DO $$
BEGIN
  RAISE NOTICE 'Migration 0150 (down): Removed 4 FLY10 run-in metrics and restored FLY10_TIME label.';
END $$;
