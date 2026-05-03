-- Down Migration 0127: Restore validationMax to 12 on lift-max metrics
--
-- Reverts the boundary alignment between backend and UI. After this rollback,
-- the backend will once again reject submissions at 13-15 reps even though
-- the UI advertises them as warn-allowed. Use only when fully rolling back
-- the lift-max feature.

UPDATE site_metrics
   SET auxiliary_input_config = jsonb_set(
         auxiliary_input_config,
         '{validationMax}',
         '12'::jsonb,
         true
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
  RAISE NOTICE 'Migration 0127 (down): Restored validationMax to 12 on 8 lift-1RM metrics';
END $$;
