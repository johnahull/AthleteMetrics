-- Down Migration 0146: Remove Movement Quality Index (MQI) metrics
--
-- Refuses to run if any measurement references an MQ metric (including the
-- calculated totals), so no coach-entered score data is ever orphaned.

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM measurements
   WHERE metric IN (
     'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE',
     'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
     'MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE',
     'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR',
     'MQI_TOTAL', 'MQ_TRANSITION_TOTAL'
   );

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Migration 0146 (down) refused: % measurements reference MQ metrics. Delete them first if removal is intended.', v_count;
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
