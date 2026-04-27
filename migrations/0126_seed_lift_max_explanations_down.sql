-- Down Migration 0126: Clear athlete-facing explanations for lift-max metrics
--
-- Sets the three explanation columns back to NULL for the lift-max codes.
-- Idempotent — safe to run even if explanations were already cleared or
-- never populated. Other columns on these rows are untouched.

UPDATE site_metrics
   SET short_description = NULL,
       what_it_measures = NULL,
       why_it_matters = NULL
 WHERE code IN (
   'BENCH_1RM', 'BENCH_1RM_KG',
   'SQUAT_1RM', 'SQUAT_1RM_KG',
   'DEADLIFT_1RM', 'DEADLIFT_1RM_KG',
   'OHP_1RM', 'OHP_1RM_KG',
   'PULLUPS_MAX', 'PUSHUPS_MAX'
 );

DO $$
BEGIN
  RAISE NOTICE 'Migration 0126 (down): Cleared athlete-facing explanations for 10 lift-max site_metrics rows';
END $$;
