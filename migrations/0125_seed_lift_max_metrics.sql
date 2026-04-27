-- Migration 0125: Seed weight-lifting max tracking metrics
--
-- Ships the v1 starter set for strength tracking:
--   - 4 weighted lifts × 2 unit systems (lbs / kg) = 8 paired-input 1RM-est metrics
--   - 2 bodyweight count metrics (Pull-ups, Push-ups)
--
-- Paired-input lifts use the auxiliary_input_config JSONB added in 0124:
-- coach enters (load, reps) for one set, the system computes 1RM via Epley
-- (load * (1 + reps / 30)). Validation caps reps at 12 per metric (Epley
-- accuracy degrades above; UI shows tiered warnings 13-15, redirects >15).
--
-- Bodyweight metrics are simple count measurements with no auxiliary input.
--
-- All metrics are higher_is_better, category 'strength', site-default.
-- Display orders 50-59 keep them grouped together below speed/agility (0-31).
-- Idempotent via ON CONFLICT DO NOTHING.

INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max, auxiliary_input_config
) VALUES
  -- ============== Weighted lifts (lbs) ==============
  ('BENCH_1RM', 'Bench Press 1RM Estimate', 'strength', 'lbs', 'higher_is_better', true, true, 50,
   'Estimated one-rep max for the bench press, computed from a sub-maximal set via the Epley formula. Coaches enter weight lifted and reps performed; the system stores the estimate.',
   1, 'red', 'Dumbbell', 1, 1000,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"lbs"}'::jsonb),

  ('SQUAT_1RM', 'Back Squat 1RM Estimate', 'strength', 'lbs', 'higher_is_better', true, true, 51,
   'Estimated one-rep max for the back squat (Epley formula). Orgs that exclusively front-squat or goblet-squat can rename this metric via organization_metrics.custom_label.',
   1, 'red', 'Dumbbell', 1, 1500,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"lbs"}'::jsonb),

  ('DEADLIFT_1RM', 'Deadlift 1RM Estimate', 'strength', 'lbs', 'higher_is_better', true, true, 52,
   'Estimated one-rep max for the deadlift (Epley formula).',
   1, 'red', 'Dumbbell', 1, 1500,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"lbs"}'::jsonb),

  ('OHP_1RM', 'Overhead Press 1RM Estimate', 'strength', 'lbs', 'higher_is_better', true, true, 53,
   'Estimated one-rep max for the overhead press / strict press (Epley formula).',
   1, 'red', 'Dumbbell', 1, 700,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"lbs"}'::jsonb),

  -- ============== Weighted lifts (kg) ==============
  ('BENCH_1RM_KG', 'Bench Press 1RM Estimate (kg)', 'strength', 'kg', 'higher_is_better', true, true, 54,
   'Metric-unit equivalent of BENCH_1RM. Orgs select either lbs or kg variants based on regional convention.',
   1, 'red', 'Dumbbell', 1, 500,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"kg"}'::jsonb),

  ('SQUAT_1RM_KG', 'Back Squat 1RM Estimate (kg)', 'strength', 'kg', 'higher_is_better', true, true, 55,
   'Metric-unit equivalent of SQUAT_1RM.',
   1, 'red', 'Dumbbell', 1, 700,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"kg"}'::jsonb),

  ('DEADLIFT_1RM_KG', 'Deadlift 1RM Estimate (kg)', 'strength', 'kg', 'higher_is_better', true, true, 56,
   'Metric-unit equivalent of DEADLIFT_1RM.',
   1, 'red', 'Dumbbell', 1, 700,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"kg"}'::jsonb),

  ('OHP_1RM_KG', 'Overhead Press 1RM Estimate (kg)', 'strength', 'kg', 'higher_is_better', true, true, 57,
   'Metric-unit equivalent of OHP_1RM.',
   1, 'red', 'Dumbbell', 1, 300,
   '{"label":"Reps","unit":"reps","validationMin":1,"validationMax":12,"required":true,"computeFormula":"load * (1 + reps / 30)","primaryInputLabel":"Weight Lifted","primaryInputUnit":"kg"}'::jsonb),

  -- ============== Bodyweight (count) ==============
  ('PULLUPS_MAX', 'Max Pull-ups', 'strength', 'reps', 'higher_is_better', true, true, 58,
   'Maximum consecutive pull-ups in a single set. Bodyweight only — no auxiliary input.',
   0, 'red', 'Dumbbell', 0, 100,
   NULL),

  ('PUSHUPS_MAX', 'Max Push-ups', 'strength', 'reps', 'higher_is_better', true, true, 59,
   'Maximum consecutive push-ups in a single set. Bodyweight only — no auxiliary input.',
   0, 'red', 'Dumbbell', 0, 500,
   NULL)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0125: Seeded 10 lift-max site_metrics rows (8 weighted 1RM-est metrics + 2 bodyweight count metrics)';
END $$;
