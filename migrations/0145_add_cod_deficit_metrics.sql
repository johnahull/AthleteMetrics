-- Migration 0145: COD deficit derived metrics (metric / yard)
--
-- Spec: AM-FEAT-016 Part 2 (/home/hulla/devel/bta-business/specs/AM-FEAT-016_cod-deficit.md),
-- Resolved Decisions 3-5, 7, 9.
-- Plan: .omc/plans/am-feat-016-plan.md (Step 5)
--
-- COD deficit isolates the 180-degree turn: the faster-leg 5-0-5 time minus the
-- standing 10-unit sprint of the SAME unit system.
--
--   AGILITY_COD_DEFICIT_M  = min(AGILITY_505_M_L,  AGILITY_505_M_R)  - DASH_10M
--   AGILITY_COD_DEFICIT_YD = min(AGILITY_505_YD_L, AGILITY_505_YD_R) - DASH_10YD
--
-- Computed by the derived-metric calculator (same_date, skip when a source is
-- missing). Both legs and the sprint must exist on the same date; an _M source
-- can never pair with a _YD source because dependent_metrics match exact codes.
--
-- validation_min / validation_max (0 / 2.0 s) are set on the columns for manual
-- entry; the calculator does not enforce them on computed values (Decision 9).
--
-- Deliberately NOT done: organization_metrics rows (no auto-enable, matches
-- 0123/0128/0131) and benchmark tiers (none in v1, spec Requirement 5).
--
-- Requires migration 0144 (the _M_L/_M_R/_YD_L/_YD_R leg metrics) and the
-- DASH_10M / DASH_10YD site_metrics rows: this file RAISES EXCEPTION otherwise.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no
-- BEGIN/COMMIT here. Idempotent (ON CONFLICT (code) DO UPDATE).

-- ============================================================================
-- Precondition: 0144 must have run, and the 10 m / 10 yd sprint metrics must exist
-- ============================================================================
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(req.code, ', ' ORDER BY req.code)
    INTO v_missing
    FROM (VALUES
      ('AGILITY_505_M_L'), ('AGILITY_505_M_R'),
      ('AGILITY_505_YD_L'), ('AGILITY_505_YD_R'),
      ('DASH_10M'), ('DASH_10YD')
    ) AS req(code)
   WHERE NOT EXISTS (SELECT 1 FROM site_metrics s WHERE s.code = req.code);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0145 requires migration 0144 (5-0-5 protocol split) and the DASH_10M / DASH_10YD sprint metrics; missing site_metrics rows: %', v_missing;
  END IF;
END $$;

-- ============================================================================
-- The two derived metrics
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES
  ('AGILITY_COD_DEFICIT_M',
   'COD Deficit (m)',
   'agility', 's', 'lower_is_better', true, true,
   41,
   'Change-of-direction deficit, metric protocol: the faster-leg 5-0-5 time (min of left and right, 10 m approach, 5 m to the turn line) minus the standing 10 m sprint. Isolates the cost of the 180-degree turn from straight-line speed. Computed only when the left 5-0-5, right 5-0-5 and 10 m sprint are all recorded on the same date; both legs are required. Lower is better.',
   3, 'green', 'Activity',
   0, 2.0,
   true,
   'min(AGILITY_505_M_L, AGILITY_505_M_R) - DASH_10M',
   ARRAY['AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10M'],
   '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb),

  ('AGILITY_COD_DEFICIT_YD',
   'COD Deficit (yd)',
   'agility', 's', 'lower_is_better', true, true,
   42,
   'Change-of-direction deficit, yard protocol: the faster-leg 5-0-5 time (min of left and right, 10 yd approach, 5 yd to the turn line) minus the standing 10 yd sprint. Isolates the cost of the 180-degree turn from straight-line speed. Computed only when the left 5-0-5, right 5-0-5 and 10 yd sprint are all recorded on the same date; both legs are required. Lower is better.',
   3, 'green', 'Activity',
   0, 2.0,
   true,
   'min(AGILITY_505_YD_L, AGILITY_505_YD_R) - DASH_10YD',
   ARRAY['AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'DASH_10YD'],
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
-- Summary
-- ============================================================================
DO $$
DECLARE
  v_metrics INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_metrics FROM site_metrics WHERE code IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD');

  RAISE NOTICE 'Migration 0145 complete: % COD deficit derived site_metrics rows (AGILITY_COD_DEFICIT_M, AGILITY_COD_DEFICIT_YD); not enabled for any organization, no benchmarks seeded.',
    v_metrics;
END $$;
