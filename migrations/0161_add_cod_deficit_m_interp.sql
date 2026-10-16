-- Migration 0161: COD deficit, metric 5-0-5 with an interpolated 10 m sprint
--
-- Spec: AM-FEAT-016, Revision 2026-10-13, Change 1
-- (/home/hulla/devel/bta-business/specs/AM-FEAT-016_cod-deficit.md).
-- Plan: .omc/plans/cod-deficit-m-interp-plan.md
--
-- For athletes who run the 5-0-5 on the metric protocol but sprint with yard splits
-- (no DASH_10M), the 10 m time is interpolated linearly between the 10 yd (9.144 m)
-- and 20 yd (18.288 m) splits: (10 - 9.144) / (18.288 - 9.144) = 0.0936.
--
--   AGILITY_COD_DEFICIT_M_INTERP = min(AGILITY_505_M_L, AGILITY_505_M_R)
--                                  - (DASH_10YD + 0.0936 * (DASH_20YD - DASH_10YD))
--
-- Computed by the derived-metric calculator (same_date, skip when a source is
-- missing). AGILITY_COD_DEFICIT_M and AGILITY_COD_DEFICIT_YD (0145) are unchanged.
--
-- Known limit: same_date picks the best DASH_10YD and the best DASH_20YD of the
-- date independently, so the interpolated 10 m time can mix two different reps
-- (typically a few milliseconds of error).
--
-- Existing data: no rows are computed by this file. Rows appear when a source is
-- created or edited, or after an admin runs the derived-metric recalc-all.
--
-- Explanations: athlete-facing text comes from the built-ins
-- (packages/shared/metric-explanations/built-ins.ts), as for 0145. The
-- site_metrics explanation columns are deliberately left NULL here: they would
-- override the built-ins.
--
-- validation_min / validation_max (0 / 2.0 s) apply to manual entry only; the
-- calculator does not enforce them on computed values.
--
-- Organization enablement: enabled (is_enabled = true) for every organization
-- that has all four sources enabled (AGILITY_505_M_L, AGILITY_505_M_R,
-- DASH_10YD, DASH_20YD). ON CONFLICT DO NOTHING: an existing row, e.g. an
-- admin's choice, is never overridden. Do not re-run by hand: it would re-create
-- rows an admin deliberately deleted.
--
-- Deliberately NOT done: benchmark tiers (none until there is data).
--
-- Requires migrations 0144 (the _M_L / _M_R legs) and the DASH_10YD / DASH_20YD
-- site_metrics rows: this file RAISES EXCEPTION otherwise.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no
-- BEGIN/COMMIT here. Idempotent for the runner (ON CONFLICT (code) DO UPDATE,
-- ON CONFLICT DO NOTHING for organization rows).

-- ============================================================================
-- Precondition: the four source metrics must exist
-- ============================================================================
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(req.code, ', ' ORDER BY req.code)
    INTO v_missing
    FROM (VALUES
      ('AGILITY_505_M_L'), ('AGILITY_505_M_R'),
      ('DASH_10YD'), ('DASH_20YD')
    ) AS req(code)
   WHERE NOT EXISTS (SELECT 1 FROM site_metrics s WHERE s.code = req.code);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0161 requires migration 0144 (5-0-5 protocol split) and the DASH_10YD / DASH_20YD sprint metrics; missing site_metrics rows: %', v_missing;
  END IF;
END $$;

-- ============================================================================
-- The derived metric
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES
  ('AGILITY_COD_DEFICIT_M_INTERP',
   'COD Deficit (m, interpolated 10 m)',
   'agility', 's', 'lower_is_better', true, true,
   43,
   'Change-of-direction deficit, metric protocol with an interpolated 10 m sprint: the faster-leg 5-0-5 time (min of left and right, 10 m approach, 5 m to the turn line) minus a 10 m time interpolated from the 10 yd and 20 yd splits (10 yd + 0.0936 x (20 yd - 10 yd)). For athletes with yard splits but no 10 m sprint. Isolates the cost of the 180-degree turn from straight-line speed. Computed only when the left 5-0-5, right 5-0-5, 10 yd split and 20 yd split are all recorded on the same date; both legs are required. Lower is better.',
   3, 'green', 'Activity',
   0, 2.0,
   true,
   'min(AGILITY_505_M_L, AGILITY_505_M_R) - (DASH_10YD + 0.0936 * (DASH_20YD - DASH_10YD))',
   ARRAY['AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10YD', 'DASH_20YD'],
   '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  metric_type = EXCLUDED.metric_type,
  description = EXCLUDED.description,
  decimal_precision = EXCLUDED.decimal_precision,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_derived = EXCLUDED.is_derived,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  calculation_config = EXCLUDED.calculation_config;
  -- is_active is deliberately NOT in the update set: a re-run must not
  -- re-activate a metric a site admin deactivated (inserts are active).

-- ============================================================================
-- Organization enablement: all four sources enabled -> metric enabled
-- ============================================================================
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT om.organization_id, 'AGILITY_COD_DEFICIT_M_INTERP', true
  FROM organization_metrics om
 WHERE om.is_enabled = true
   AND om.metric_code IN ('AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10YD', 'DASH_20YD')
 GROUP BY om.organization_id
HAVING COUNT(DISTINCT om.metric_code) = 4
ON CONFLICT (organization_id, metric_code) DO NOTHING;

-- ============================================================================
-- Summary
-- ============================================================================
DO $$
DECLARE
  v_metrics INTEGER;
  v_orgs    INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_metrics FROM site_metrics WHERE code = 'AGILITY_COD_DEFICIT_M_INTERP';
  SELECT COUNT(*) INTO v_orgs FROM organization_metrics WHERE metric_code = 'AGILITY_COD_DEFICIT_M_INTERP';

  RAISE NOTICE 'Migration 0161 complete: % AGILITY_COD_DEFICIT_M_INTERP site_metrics row; % organization_metrics rows for it (orgs with all four sources enabled); no benchmarks seeded. Run the derived-metric recalc-all to compute existing data.',
    v_metrics, v_orgs;
END $$;
