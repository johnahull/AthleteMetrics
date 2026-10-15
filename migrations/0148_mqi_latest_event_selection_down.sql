-- Revert 0148: remove the sourceSelection key from the two MQI totals (idempotent).
UPDATE site_metrics
SET calculation_config = calculation_config - 'sourceSelection',
    updated_at = NOW()
WHERE code IN ('MQI_TOTAL', 'MQ_TRANSITION_TOTAL')
  AND calculation_config ? 'sourceSelection';
