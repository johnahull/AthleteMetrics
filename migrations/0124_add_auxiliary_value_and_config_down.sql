-- Down Migration 0124: Remove paired-input metric support
--
-- WARNING: Drops the auxiliary_value column. Any measurements logged with this
-- column populated (1RM estimates from rep-max sets) will lose their secondary
-- input — the computed `value` is preserved but the source `(load, reps)` pair
-- becomes unrecoverable from the row alone. The 1RM seeded metrics in 0125
-- become non-functional after this rollback (no way to capture reps).
--
-- Run only when fully rolling back the lift-max-tracking feature.

DROP INDEX IF EXISTS idx_measurements_auxiliary_value;

ALTER TABLE measurements
  DROP COLUMN IF EXISTS auxiliary_value;

ALTER TABLE site_metrics
  DROP COLUMN IF EXISTS auxiliary_input_config;

ALTER TABLE custom_org_metrics
  DROP COLUMN IF EXISTS auxiliary_input_config;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0124 (down): Removed paired-input metric support';
END $$;
