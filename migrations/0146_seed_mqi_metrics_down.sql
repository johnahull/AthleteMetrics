-- Down Migration 0146: Remove Movement Quality Index (MQI) metrics
--
-- Refuses to run if any measurement, goal, report benchmark, event metric or
-- organization metric configuration references an MQ metric (including the
-- calculated totals), so no coach-entered score data, event or org setup is
-- orphaned or cascade-deleted.
--
-- Deleting the site_metrics rows also cascades to site_benchmarks,
-- custom_benchmarks and peer_percentile_cache. MQ metrics are excluded from
-- benchmarks and peer percentiles, so no such rows are expected; any that exist
-- are derived/cache data and are removed with the metric.

DO $$
DECLARE
  v_codes TEXT[] := ARRAY[
    'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE',
    'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
    'MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE',
    'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR',
    'MQI_TOTAL', 'MQ_TRANSITION_TOTAL'
  ];
  v_measurements INTEGER;
  v_goals INTEGER;
  v_report_benchmarks INTEGER;
  v_event_metrics INTEGER;
  v_org_metrics INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_measurements FROM measurements WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_goals FROM goals WHERE metric = ANY(v_codes);
  SELECT COUNT(*) INTO v_report_benchmarks FROM report_benchmarks WHERE metric_code = ANY(v_codes);
  -- event_metrics would be silently cascade-deleted, dropping events' MQ configuration
  SELECT COUNT(*) INTO v_event_metrics FROM event_metrics WHERE metric_code = ANY(v_codes);
  -- organization_metrics would be silently cascade-deleted, dropping orgs' MQ configuration
  SELECT COUNT(*) INTO v_org_metrics FROM organization_metrics WHERE metric_code = ANY(v_codes);

  IF v_measurements + v_goals + v_report_benchmarks + v_event_metrics + v_org_metrics > 0 THEN
    RAISE EXCEPTION 'Migration 0146 (down) refused: MQ metrics are still referenced (% measurements, % goals, % report_benchmarks, % event_metrics, % organization_metrics). Delete them first if removal is intended.',
      v_measurements, v_goals, v_report_benchmarks, v_event_metrics, v_org_metrics;
  END IF;
END $$;

DELETE FROM site_metrics
 WHERE code IN (
   'MQI_TOTAL', 'MQ_TRANSITION_TOTAL',
   'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE',
   'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
   'MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE',
   'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR'
 );

DO $$
BEGIN
  RAISE NOTICE 'Migration 0146 (down): Removed 14 MQ metrics.';
END $$;
