-- Migration 0151: MOMENTUM derived metric (body mass x fly speed)
--
-- Spec: AM-FEAT-018
--
--   MOMENTUM (kg*m/s) = WEIGHT_LBS * 0.45359237 * (9.144 / FLY10_TIME)
--
-- FLY10_TIME is the 20 yd run-in standard (0150); FLY10_TIME_RI* variants are
-- deliberately not sources. Weight is rarely measured on the fly day, so the
-- sources are matched with 'closest' within 45 days, and anchorMetric makes the
-- derived value exist only on dates with a verified direct FLY10_TIME (it is
-- dated to the fly, never to the weight).
--
-- validation_min / validation_max are metadata only (no range rejection for
-- derived values). metric_type 'tracking': no better/worse direction, so no
-- trend arrows or rankings. No benchmark tiers are seeded.
--
-- Requires FLY10_TIME in site_metrics (RAISE EXCEPTION otherwise). WEIGHT_LBS has no seed
-- in the migrations (it was created through the admin UI in production), so it is created
-- here when missing, with the production attributes; an existing row is never modified.
-- The down migration does not delete WEIGHT_LBS.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Idempotent: ON CONFLICT (code) DO UPDATE.

-- FLY10_TIME is seeded by earlier migrations; fail loudly if it is missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM site_metrics WHERE code = 'FLY10_TIME') THEN
    RAISE EXCEPTION 'Migration 0151 requires the MOMENTUM source metrics; missing site_metrics rows: FLY10_TIME';
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
    RAISE NOTICE 'Migration 0151: WEIGHT_LBS was missing and has been created (Weight (lb), Physical, lbs, tracking).';
  END IF;
END $$;

INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES (
  'MOMENTUM',
  'Momentum',
  'Power', 'kg*m/s', 'tracking', true, true,
  60,
  'Momentum: body mass (kg) x 10-yard fly speed (m/s), from body weight in lbs and the FLY10_TIME 20-yard run-in fly. Uses the body weight closest in date to the fly, within 45 days; no value is calculated when no weight is that recent. Dated to the fly. A neutral tracking metric: a heavier athlete scores higher at the same speed, so it is not ranked or tiered.',
  1,
  50, 1500,
  true,
  'weight_lbs * 0.45359237 * 9.144 / fly10_time',
  ARRAY['FLY10_TIME', 'WEIGHT_LBS'],
  '{"dateMatchStrategy":"closest","maxDateDifference":45,"missingSourceBehavior":"skip","anchorMetric":"FLY10_TIME"}'::jsonb
)
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
-- Organization enablement: both sources enabled -> MOMENTUM enabled
-- ============================================================================
-- Each organization that has BOTH FLY10_TIME and WEIGHT_LBS enabled gets MOMENTUM
-- enabled. ON CONFLICT DO NOTHING: an existing row, e.g. an admin's choice, is never
-- overridden. Orgs without both sources get nothing. Likewise is_active is not part of
-- the upsert above, so an admin-deactivated MOMENTUM stays deactivated on a re-run.
-- Do not re-run by hand: it would re-create rows an admin deliberately deleted.
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT om.organization_id, 'MOMENTUM', true
  FROM organization_metrics om
 WHERE om.metric_code IN ('FLY10_TIME', 'WEIGHT_LBS')
   AND om.is_enabled = true
 GROUP BY om.organization_id
HAVING COUNT(DISTINCT om.metric_code) = 2
ON CONFLICT (organization_id, metric_code) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0151 complete: MOMENTUM derived metric (kg*m/s) from WEIGHT_LBS + FLY10_TIME, closest within 45 days anchored on FLY10_TIME; no benchmarks seeded.';
END $$;
