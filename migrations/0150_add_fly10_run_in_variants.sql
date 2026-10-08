-- Migration 0150: FLY10 run-in variants
--
-- Spec: AM-FEAT-017
--
-- The 10-yard fly is only comparable between athletes who used the same run-in.
-- FLY10_TIME stays the 20 yd standard (benchmarks were anchored to it in 0134);
-- the other run-ins get their own metric codes. No benchmark rows are seeded
-- for the new codes (no research basis), so they show a time but no tier.
--
-- Block layout:
--   A - FLY10_TIME label/description/explanation state the 20 yd run-in
--   B - 4 new metrics copying FLY10_TIME's shared fields (explanation text is run-in specific)
--   C - enable the new metrics for every org that has FLY10_TIME enabled
--   D - RAISE NOTICE summary

-- ============================================================================
-- Block A - FLY10_TIME is the 20 yd run-in
-- ============================================================================
UPDATE site_metrics
   SET label = '10-Yard Fly, 20 yd run-in',
       description = 'Time to cover 10 yards after a 20-yard run-in, measuring maximum velocity. Fly times from other run-in distances are separate metrics and are not comparable.',
       short_description = 'How fast you cover 10 yards after a 20-yard run-in.',
       what_it_measures = 'The 10-yard fly measures the time to run 10 yards after a 20-yard run-in. With a run-in this long the athlete is at or near full speed, so it approximates maximum velocity.',
       why_it_matters = 'Fly times are only comparable within one run-in distance; a shorter or longer run-in is a different metric. Repeating the same run-in shows real change in speed over time.',
       updated_at = NOW()
 WHERE code = 'FLY10_TIME';

-- ============================================================================
-- Block B - New run-in variants (shared fields copied from FLY10_TIME)
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, short_description, what_it_measures, why_it_matters,
  validation_min, validation_max, decimal_precision, color, icon
)
SELECT v.code, v.label, base.category, base.unit, base.metric_type, true, true,
       base.display_order,
       'Time to cover 10 yards after a ' || v.run_in || '-yard run-in. A shorter run-in means the athlete is still accelerating, so this time is not comparable to fly times from other run-in distances.',
       'How fast you cover 10 yards after a ' || v.run_in || '-yard run-in.',
       'Time to run 10 yards after a ' || v.run_in || '-yard run-in. How much speed you reach before the timed 10 yards depends on the run-in, so compare only with times from the same run-in distance.',
       'Run-ins differ in how much acceleration they include, so fly times are only comparable within one protocol. Repeating the same run-in shows real change over time.',
       base.validation_min, base.validation_max, base.decimal_precision, base.color, base.icon
  FROM site_metrics base
 CROSS JOIN (VALUES
   ('FLY10_TIME_RI5',  '10-Yard Fly, 5 yd run-in',  5),
   ('FLY10_TIME_RI10', '10-Yard Fly, 10 yd run-in', 10),
   ('FLY10_TIME_RI15', '10-Yard Fly, 15 yd run-in', 15),
   ('FLY10_TIME_RI30', '10-Yard Fly, 30 yd run-in', 30)
 ) AS v(code, label, run_in)
 WHERE base.code = 'FLY10_TIME'
-- color and icon are deliberately not updated, so admin customisations survive a re-run.
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  metric_type = EXCLUDED.metric_type,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  what_it_measures = EXCLUDED.what_it_measures,
  why_it_matters = EXCLUDED.why_it_matters,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  decimal_precision = EXCLUDED.decimal_precision,
  updated_at = NOW();

-- ============================================================================
-- Block C - Enable for orgs that already have FLY10_TIME enabled
-- ============================================================================
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled, display_order)
SELECT om.organization_id, v.code, true, om.display_order
  FROM organization_metrics om
 CROSS JOIN (VALUES ('FLY10_TIME_RI5'), ('FLY10_TIME_RI10'), ('FLY10_TIME_RI15'), ('FLY10_TIME_RI30')) AS v(code)
 WHERE om.metric_code = 'FLY10_TIME' AND om.is_enabled = true
ON CONFLICT (organization_id, metric_code) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0150: FLY10_TIME relabeled to 20 yd run-in; 4 run-in variant metrics seeded.';
END $$;
