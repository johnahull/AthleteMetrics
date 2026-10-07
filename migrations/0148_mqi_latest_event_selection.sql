-- AM-FEAT-015 decision 11: when an athlete is scored in two events on the same day,
-- the MQI totals use the latest event only. A total requires all of its source
-- scores from that same event (calculation_config.sourceSelection = 'latest_event').
-- Idempotent: safe to re-run. Does not edit 0146.

UPDATE site_metrics
SET calculation_config = COALESCE(calculation_config, '{}'::jsonb) || '{"sourceSelection":"latest_event"}'::jsonb,
    updated_at = NOW()
WHERE code IN ('MQI_TOTAL', 'MQ_TRANSITION_TOTAL')
  AND COALESCE(calculation_config->>'sourceSelection', '') <> 'latest_event';
