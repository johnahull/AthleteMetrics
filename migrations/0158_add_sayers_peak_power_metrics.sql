-- Migration 0158: Sayers peak power derived metrics (PEAK_POWER_W, PEAK_POWER_REL)
--
-- Spec: AM-FEAT-021 (soccer eval protocol, section 7). Precedent: 0152 (MOMENTUM, AM-FEAT-018).
--
--   PEAK_POWER_W   (W)    = 60.7 * CMJ height (cm) + 45.3 * body mass (kg) - 2055   (Sayers 1999)
--   PEAK_POWER_REL (W/kg) = PEAK_POWER_W / body mass (kg)
--
-- JUMP_CMJ_HOH is stored in inches and WEIGHT_LBS in pounds, so the unit conversions
-- (2.54 cm/in, 0.45359237 kg/lb) are inlined in the formula strings. PEAK_POWER_REL repeats the
-- full PEAK_POWER_W expression (no derived-from-derived dependency, no ordering risk).
--
-- The only jump source is JUMP_CMJ_HOH: the Sayers equation is validated on the restricted
-- (hands-on-hips) counter-movement jump. HF-CMJ, SJ, the single-leg CMJs and the legacy
-- VERTICAL_JUMP are deliberately NOT sources.
--
-- Weight is rarely measured on the jump day, so the sources are matched with 'closest' within
-- 45 days, and anchorMetric makes the derived value exist only on dates with a verified direct
-- JUMP_CMJ_HOH (it is dated to the jump, never to the weight).
--
-- Negative results (a very small jump with a low body mass) are stored as computed.
-- validation_min / validation_max are metadata only (no range rejection for derived values).
-- metric_type 'tracking': no better/worse direction. No benchmark tiers are seeded. The equation
-- was fitted on adults, so youth values are estimates.
--
-- Requires JUMP_CMJ_HOH in site_metrics (RAISE EXCEPTION otherwise). WEIGHT_LBS has no seed in
-- the migrations (it was created through the admin UI in production), so it is created here when
-- missing, with the production attributes; an existing row is never modified. The down migration
-- does not delete WEIGHT_LBS.
--
-- Existing JUMP_CMJ_HOH measurements get no derived rows from this migration: run the existing
-- backfill after deploy, once per code (site admin; the parameters are QUERY STRING parameters,
-- not a JSON body; without metricCode it recalculates every derived metric site-wide, and the route
-- allows 5 bulk recalculations per hour):
--   POST /api/admin/recalculate-derived-metrics?metricCode=PEAK_POWER_W
--   POST /api/admin/recalculate-derived-metrics?metricCode=PEAK_POWER_REL
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Idempotent: ON CONFLICT (code) DO UPDATE (display_order and is_active are not part of the update).

-- JUMP_CMJ_HOH is seeded by earlier migrations; fail loudly if it is missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM site_metrics WHERE code = 'JUMP_CMJ_HOH') THEN
    RAISE EXCEPTION 'Migration 0158 requires the Sayers source metrics; missing site_metrics rows: JUMP_CMJ_HOH';
  END IF;
END $$;

-- WEIGHT_LBS exists in production (created via the admin UI) but has no seed, so a fresh
-- database (db:push + manual migrations) lacks it. Create it with the production attributes;
-- ON CONFLICT DO NOTHING never modifies an existing row.
DO $$
DECLARE
  v_created INTEGER;
BEGIN
  INSERT INTO site_metrics (code, label, category, unit, metric_type, is_derived, is_active, decimal_precision)
  VALUES ('WEIGHT_LBS', 'Weight (lb)', 'Physical', 'lbs', 'tracking', false, true, 3)
  ON CONFLICT (code) DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  IF v_created > 0 THEN
    RAISE NOTICE 'Migration 0158: WEIGHT_LBS was missing and has been created (Weight (lb), Physical, lbs, tracking).';
  END IF;
END $$;

-- display_order = current maximum + 1 / + 2 at first apply (kept on a re-run).
-- available_org_types, sport_associations, color and icon are copied from JUMP_CMJ_HOH.
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision,
  validation_min, validation_max, available_org_types, sport_associations, color, icon,
  is_derived, formula, dependent_metrics, calculation_config
)
SELECT n.code, n.label, 'Power', n.unit, 'tracking', true, true,
       (SELECT COALESCE(MAX(display_order), 0) FROM site_metrics) + n.ord, n.description, n.decimal_precision,
       n.validation_min, n.validation_max, src.available_org_types, src.sport_associations, src.color, src.icon,
       true, n.formula, ARRAY['JUMP_CMJ_HOH', 'WEIGHT_LBS'],
       '{"dateMatchStrategy":"closest","maxDateDifference":45,"missingSourceBehavior":"skip","anchorMetric":"JUMP_CMJ_HOH"}'::jsonb
  FROM (VALUES
    ('PEAK_POWER_W', 'Peak Power (Sayers)', 'W', 1,
     'Estimated peak power (watts) from the Sayers equation: 60.7 x jump height (cm) + 45.3 x body mass (kg) - 2055, from the restricted hands-on-hips counter-movement jump (JUMP_CMJ_HOH) and body weight in lbs. The equation is validated on the restricted/HOH CMJ only; it is not valid for HF-CMJ or the other jumps, which are not sources. Uses the body weight closest in date to the jump, within 45 days; no value is calculated when no weight is that recent. Dated to the jump. The equation was fitted on adults, so values for youth athletes are estimates. A negative value means the jump or weight was probably entered wrongly. A neutral tracking metric: a heavier athlete scores higher at the same jump.',
     0, 200, 9000,
     '60.7 * jump_cmj_hoh * 2.54 + 45.3 * weight_lbs * 0.45359237 - 2055'),
    ('PEAK_POWER_REL', 'Relative Peak Power (Sayers)', 'W/kg', 2,
     'Estimated peak power per kilogram of body mass (W/kg): the Sayers peak power (60.7 x jump height (cm) + 45.3 x body mass (kg) - 2055) divided by body mass, from the restricted hands-on-hips counter-movement jump (JUMP_CMJ_HOH) and body weight in lbs. The equation is validated on the restricted/HOH CMJ only; it is not valid for HF-CMJ or the other jumps, which are not sources. Uses the body weight closest in date to the jump, within 45 days; no value is calculated when no weight is that recent. Dated to the jump. The equation was fitted on adults, so values for youth athletes are estimates. A negative value means the jump or weight was probably entered wrongly.',
     1, 10, 100,
     '(60.7 * jump_cmj_hoh * 2.54 + 45.3 * weight_lbs * 0.45359237 - 2055) / (weight_lbs * 0.45359237)')
  ) AS n(code, label, unit, ord, description, decimal_precision, validation_min, validation_max, formula)
  JOIN site_metrics src ON src.code = 'JUMP_CMJ_HOH'
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
  calculation_config = EXCLUDED.calculation_config,
  updated_at = NOW();

-- ============================================================================
-- Organization enablement: both sources enabled -> both Sayers metrics enabled
-- ============================================================================
-- Each organization that has BOTH JUMP_CMJ_HOH and WEIGHT_LBS enabled gets both codes enabled.
-- ON CONFLICT DO NOTHING: an existing row, e.g. an admin's choice, is never overridden. Orgs
-- without both sources get nothing. Likewise is_active is not part of the upsert above, so an
-- admin-deactivated metric stays deactivated on a re-run.
-- Do not re-run by hand: it would re-create rows an admin deliberately deleted.
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT s.organization_id, c.code, true
  FROM (
    SELECT om.organization_id
      FROM organization_metrics om
     WHERE om.metric_code IN ('JUMP_CMJ_HOH', 'WEIGHT_LBS')
       AND om.is_enabled = true
     GROUP BY om.organization_id
    HAVING COUNT(DISTINCT om.metric_code) = 2
  ) s
 CROSS JOIN (VALUES ('PEAK_POWER_W'), ('PEAK_POWER_REL')) AS c(code)
ON CONFLICT (organization_id, metric_code) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0158 complete: PEAK_POWER_W (W) and PEAK_POWER_REL (W/kg) Sayers derived metrics from JUMP_CMJ_HOH + WEIGHT_LBS, closest within 45 days anchored on JUMP_CMJ_HOH; no benchmarks seeded. Run the derived-metric backfill for both codes.';
END $$;
