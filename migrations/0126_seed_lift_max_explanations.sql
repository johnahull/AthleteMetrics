-- Migration 0126: Seed athlete-facing explanations for the lift-max metrics
--
-- The 10 lift-max metrics seeded in 0125 only set `description`. Migration
-- 0121 established the convention that every site-default metric also
-- populates short_description / what_it_measures / why_it_matters so the
-- "metric explanations on athlete pages" feature (commit 0b296741) renders
-- a useful popover for each. This migration backfills those for the lift
-- metrics so they're not visually second-class on the athlete profile.
--
-- The kg variants share copy with their lbs counterparts since the test
-- protocol is identical — only the unit differs.

-- ============== Bench Press ==============
UPDATE site_metrics SET
  short_description = 'How much weight you can press once — estimated from a sub-maximal set.',
  what_it_measures = 'The bench press 1RM estimate computes your projected one-rep max from a set you actually performed (e.g., 3 reps at 315 lbs) using the Epley formula. You log the weight you lifted and how many reps you completed; the system stores the estimated max.',
  why_it_matters = 'Bench press is the standard upper-body strength benchmark across nearly every sport that values pushing power. Estimating from sub-maximal sets is safer and more frequent than testing a true 1RM — every working set becomes a strength data point.'
WHERE code IN ('BENCH_1RM', 'BENCH_1RM_KG');

-- ============== Back Squat ==============
UPDATE site_metrics SET
  short_description = 'Your projected one-rep max in the back squat — your main lower-body strength number.',
  what_it_measures = 'The back squat 1RM estimate projects your one-rep max from a sub-maximal set using the Epley formula. Coaches enter the load and the number of reps performed; the system computes and stores the estimate.',
  why_it_matters = 'Back squat strength correlates strongly with sprint speed, vertical jump, and change-of-direction performance. Tracking the estimate from regular working sets gives you a continuous strength curve without forcing a true 1RM test every week.'
WHERE code IN ('SQUAT_1RM', 'SQUAT_1RM_KG');

-- ============== Deadlift ==============
UPDATE site_metrics SET
  short_description = 'Your projected one-rep max in the deadlift — total-body pulling strength.',
  what_it_measures = 'The deadlift 1RM estimate projects your one-rep max from a working set using the Epley formula. Log the load and rep count; the system records the implied maximum.',
  why_it_matters = 'Deadlift expresses whole-chain posterior strength — hips, hamstrings, back, grip — and is one of the highest-value strength markers for explosive sport. Tracking estimated 1RM from training sets shows progress without the recovery cost of repeated max tests.'
WHERE code IN ('DEADLIFT_1RM', 'DEADLIFT_1RM_KG');

-- ============== Overhead Press ==============
UPDATE site_metrics SET
  short_description = 'Your projected one-rep max in the strict overhead press — pure shoulder and trunk strength.',
  what_it_measures = 'The overhead press 1RM estimate projects your one-rep max from a working set using the Epley formula. Coaches log the load and reps completed; the system stores the estimate.',
  why_it_matters = 'Overhead press strength reflects shoulder stability, core bracing, and pressing mechanics — all critical for overhead-sport athletes (volleyball, swimming, throwing) and as a general indicator of upper-body health. Estimating from working sets avoids the injury risk of frequent true 1RM attempts.'
WHERE code IN ('OHP_1RM', 'OHP_1RM_KG');

-- ============== Bodyweight: Pull-ups ==============
UPDATE site_metrics SET
  short_description = 'How many strict pull-ups you can complete in a single unbroken set.',
  what_it_measures = 'The pull-ups max test counts the maximum number of consecutive pull-ups performed without dropping from the bar or breaking strict form. No weighted variant — bodyweight only.',
  why_it_matters = 'Pull-ups are a pure relative-strength test: how strong are you per pound of bodyweight? They reveal upper-body pulling capacity and grip endurance without needing any equipment beyond a bar, and improvements track real gains in functional strength.'
WHERE code = 'PULLUPS_MAX';

-- ============== Bodyweight: Push-ups ==============
UPDATE site_metrics SET
  short_description = 'How many strict push-ups you can complete in a single unbroken set.',
  what_it_measures = 'The push-ups max test counts the maximum number of consecutive push-ups performed with strict form (chest to floor or fist height, full lockout) before failure or breaking form. Bodyweight only.',
  why_it_matters = 'Push-ups measure upper-body pushing endurance and bodyweight relative strength. They scale across all athletes regardless of access to equipment, and rep-count progressions correlate with broader strength and conditioning gains.'
WHERE code = 'PUSHUPS_MAX';

DO $$
BEGIN
  RAISE NOTICE 'Migration 0126: Seeded athlete-facing explanations for 10 lift-max site_metrics rows';
END $$;
