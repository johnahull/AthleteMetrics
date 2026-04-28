-- Migration 0124: Add paired-input metric support
--
-- Some metrics need a single measurement row that captures TWO inputs and
-- computes a derived stored value. Example: weight-lifting 1RM estimation —
-- coach enters (load, reps) for one set; the system stores `value` = computed
-- 1RM via Epley/Brzycki and preserves both inputs for display.
--
-- This is distinct from the existing derived-metric pattern (cross-row
-- aggregation joined by date). Paired-input metrics are atomic per-event.
--
-- Adds:
--   - measurements.auxiliary_value: nullable numeric for the secondary input
--   - site_metrics.auxiliary_input_config: JSONB describing the auxiliary
--     input semantics, validation, and compute formula
--   - custom_org_metrics.auxiliary_input_config: same shape for org-custom
--     paired-input metrics
--   - Partial index on (metric, user_id, date) WHERE auxiliary_value IS NOT NULL
--     to support best-set / PR queries efficiently
--
-- Application-layer enforcement (NOT a CHECK constraint, since rules depend on
-- a JSONB field of the metrics tables):
--   - if auxiliary_input_config.required is true, auxiliary_value must be set
--   - is_derived and auxiliary_input_config are mutually exclusive
-- These are enforced in measurement-service and the admin metric form.

ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS auxiliary_value numeric(10, 3);

ALTER TABLE site_metrics
  ADD COLUMN IF NOT EXISTS auxiliary_input_config jsonb;

ALTER TABLE custom_org_metrics
  ADD COLUMN IF NOT EXISTS auxiliary_input_config jsonb;

-- Partial index for best-set / PR queries on paired-input metrics.
-- Only indexes rows where auxiliary_value is set, keeping the index small.
CREATE INDEX IF NOT EXISTS idx_measurements_auxiliary_value
  ON measurements (metric, user_id, date)
  WHERE auxiliary_value IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0124: Added paired-input metric support (auxiliary_value column + auxiliary_input_config JSONB on site_metrics and custom_org_metrics)';
END $$;
