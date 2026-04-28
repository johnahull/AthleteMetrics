-- Migration 0127: Raise auxiliary_input_config.validationMax 12 → 15 for lift-max metrics
--
-- The seed in 0125 set validationMax: 12 to match the Epley formula's typical
-- validity ceiling. The UI plan (and the design review's tiered guardrail spec)
-- treats 12 as the END of the silent tier and ALLOWS submit at 13-15 with a
-- soft warning chip. Values above 15 are blocked at the UI level.
--
-- The original validationMax: 12 made the backend reject anything at 13+
-- before the UI's warn tier could be exercised — a contract mismatch between
-- the two halves of the feature. This migration aligns the backend with the
-- UI: validationMax: 15 lets the warn-tier submissions through. The UI keeps
-- 12 as the soft-warn threshold; the backend enforces the hard 15 limit.
--
-- Idempotent: uses jsonb_set with COALESCE so re-running is safe.

UPDATE site_metrics
   SET auxiliary_input_config = jsonb_set(
         auxiliary_input_config,
         '{validationMax}',
         '15'::jsonb,
         true  -- create_missing
       )
 WHERE code IN (
   'BENCH_1RM', 'BENCH_1RM_KG',
   'SQUAT_1RM', 'SQUAT_1RM_KG',
   'DEADLIFT_1RM', 'DEADLIFT_1RM_KG',
   'OHP_1RM', 'OHP_1RM_KG'
 )
   AND auxiliary_input_config IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0127: Raised validationMax 12 → 15 on auxiliary_input_config for 8 lift-1RM metrics (aligns backend with UI tiered guardrails: silent 1-12, warn 13-15, block >15)';
END $$;
