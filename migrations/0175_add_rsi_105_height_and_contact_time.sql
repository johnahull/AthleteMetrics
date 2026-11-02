-- Migration 0175: RSI_105_HEIGHT (average jump height) and RSI_105_GCT (average ground contact time) for the 10/5 repeat hop
--
-- Coaches running the 10/5 repeat hop want to record the athlete's average jump height and average ground contact time next
-- to RSI_105. They are plain entered metrics, recorded as separate measurements by the same flow as any other metric.
-- RSI_105 is NOT computed from them: the device reports the average of the per-hop RSI values, which is not the average
-- height divided by the average contact time (15.4 in and 0.220 s give 1.78, the device reported 1.74). RSI_105 stays
-- as entered.
--
-- Block layout:
--   A - site_metrics rows, copied from the RSI_105 row where the values carry over
--   B - organization enablement: an organization that enables RSI_105 gets both codes enabled
--   C - RAISE NOTICE summary
--
-- Every column is filled. Copied from RSI_105: category, is_system_default, is_active, available_org_types (NULL there means
-- every org type, and stays NULL), color and sport_associations (falling back to RSI's own seed values, 'orange' and
-- {Soccer}, if the RSI_105 row has none).
-- Written here (NOT copied): code, label, display_order, description, short_description, what_it_measures, why_it_matters,
-- unit, metric_type, validation_min / validation_max, decimal_precision (RSI's ratio values do not carry over),
-- display_format ('decimal') and icon (TrendingUp for height, Timer for contact time).
-- Left NULL on purpose, as for every entered metric: is_derived is false, formula / dependent_metrics / calculation_config /
-- auxiliary_input_config (not derived, not paired input), created_by (seeded by a migration, not a user), updated_at.
--   RSI_105_HEIGHT  inches, higher is better, 1-40, 1 decimal
--   RSI_105_GCT     seconds, lower is better, 0.05-1.0, 3 decimals (millisecond resolution)
-- An admin can widen the validation range in the UI if real values are rejected.
--
-- A metric whose source row (RSI_105, created by 0156) is absent is skipped, never guessed. An existing row is never
-- modified (ON CONFLICT DO NOTHING). No benchmarks are seeded, and neither code is added to the eval report or to the
-- 'Soccer eval (yards)' template: the eval report does not name them.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Do not re-run by hand: a manual re-run re-adds org rows an admin deleted.
-- Number is provisional: renumber at merge if another branch lands 0175 first.

-- ============================================================================
-- Block A - site_metrics rows
-- ============================================================================
-- Inline VALUES (the 0156 / 0174 pattern).
INSERT INTO site_metrics (
  code, label, display_order, description,
  category, unit, metric_type, is_system_default, is_active,
  short_description, what_it_measures, why_it_matters,
  available_org_types, sport_associations, validation_min, validation_max, decimal_precision, display_format, color, icon
)
SELECT n.code, n.label, n.display_order, n.description,
       src.category, n.unit, n.metric_type, src.is_system_default, src.is_active,
       n.short_description, n.what_it_measures, n.why_it_matters,
       src.available_org_types, COALESCE(src.sport_associations, ARRAY['Soccer']), n.validation_min, n.validation_max, n.decimal_precision,
       'decimal', COALESCE(src.color, 'orange'), n.icon
  FROM (VALUES
    ('RSI_105_HEIGHT', 'RSI Bilateral Average Jump Height (10/5 Repeat Hop)', 72,
     'Average jump height, in inches, from the 10/5 repeat hop: 10 consecutive maximal two-leg hops, averaged over the best 5 ground contacts. Recorded next to RSI_105 (the RSI is entered as the device reports it, not calculated from this value).',
     'in', 'higher_is_better', 1::numeric, 40::numeric, 1, 'TrendingUp',
     'How high you bounce on average in the 10/5 repeat hop.',
     'The average height of your best five hops in the 10/5 repeat hop test, ten consecutive two-leg hops each as high as you can with as little time on the ground as you can.',
     'Height and ground contact time together explain an RSI. A higher RSI from higher hops points to power; a higher RSI from shorter ground contacts points to stiffness and reactive control.'),
    ('RSI_105_GCT', 'RSI Bilateral Average Ground Contact Time (10/5 Repeat Hop)', 73,
     'Average ground contact time, in seconds, from the 10/5 repeat hop: 10 consecutive maximal two-leg hops, averaged over the best 5 ground contacts. Recorded next to RSI_105 (the RSI is entered as the device reports it, not calculated from this value). Lower is better.',
     's', 'lower_is_better', 0.05::numeric, 1::numeric, 3, 'Timer',
     'How little time you spend on the ground on each hop in the 10/5 repeat hop.',
     'The average time your feet stay on the ground for your best five hops in the 10/5 repeat hop test. Shorter contacts mean a stiffer, quicker rebound.',
     'Height and ground contact time together explain an RSI. Shorter ground contacts at the same height mean better elastic energy use and reactive control.')
  ) AS n(code, label, display_order, description, unit, metric_type, validation_min, validation_max, decimal_precision, icon,
         short_description, what_it_measures, why_it_matters)
  JOIN site_metrics src ON src.code = 'RSI_105'
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block B - Organization enablement
-- ============================================================================
-- An organization with RSI_105 enabled gets both codes enabled (the 0156 / 0174 pattern). ON CONFLICT DO NOTHING: an
-- existing row, e.g. an admin's choice, is never overridden.
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT om.organization_id, n.code, true
  FROM organization_metrics om
 CROSS JOIN (VALUES ('RSI_105_HEIGHT'), ('RSI_105_GCT')) AS n(code)
  JOIN site_metrics sm ON sm.code = n.code
 WHERE om.metric_code = 'RSI_105' AND om.is_enabled = true
ON CONFLICT (organization_id, metric_code) DO NOTHING;

-- ============================================================================
-- Block C - Summary
-- ============================================================================
DO $$
DECLARE
  v_metrics TEXT;
BEGIN
  SELECT string_agg(code, ', ' ORDER BY code) INTO v_metrics FROM site_metrics WHERE code IN ('RSI_105_HEIGHT', 'RSI_105_GCT');
  RAISE NOTICE 'Migration 0175 complete: metrics present: %.', COALESCE(v_metrics, 'none (RSI_105 not found, skipped)');
END $$;
