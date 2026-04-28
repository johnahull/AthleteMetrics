-- Migration 0131: Squat Jump + Eccentric Utilization Ratio (EUR)
--
-- Spec: AM-FEAT-012 (/home/hulla/devel/bta-company/specs/AM-FEAT-012_squat-jump-eur.md)
--
-- Adds JUMP_SJ_HEIGHT base metric (concentric-only jump; no SSC contribution)
-- and POWER_EUR derived metric (CMJ ÷ SJ ratio — SSC efficiency diagnostic).
-- Seeds soccer + volleyball D1 + HS age-grouped benchmarks for SJ.
--
-- Storage convention: JUMP_SJ_HEIGHT in inches (matches codebase convention
-- for other jump metrics — VERTICAL_JUMP, APPROACH_JUMP, BLOCK_JUMP all in
-- inches). Spec source values are in cm; converted using spec's parenthetical
-- inches.
--
-- EUR formula PROTOCOL NOTE: spec assumed CMJ-HOH (hands-on-hips, no arm
-- swing) for the numerator. Codebase's VERTICAL_JUMP is a hands-free CMJ
-- (with arm swing). The resulting EUR ratio will be higher than spec's
-- 1.05/1.15/1.25 interpretation thresholds were calibrated for. Adjust
-- thresholds after BTA collects internal data.
--
-- Block layout:
--   A — JUMP_SJ_HEIGHT base metric
--   B — POWER_EUR derived metric (formula = VERTICAL_JUMP / JUMP_SJ_HEIGHT)
--   C — Soccer SJ benchmark rows (D1 + HS age-grouped)
--   D — Volleyball SJ benchmark rows (D1 + HS age-grouped)
--   E — benchmark_set_items linkages
--   F — RAISE NOTICE summary

-- ============================================================================
-- Block A — JUMP_SJ_HEIGHT base metric
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max
) VALUES (
  'JUMP_SJ_HEIGHT',
  'Squat Jump Height',
  'Power',
  'in',
  'higher_is_better',
  true, true,
  62,
  'Squat Jump (SJ) height: athlete descends to ~90° knee angle, holds for 3-5 seconds to dissipate elastic energy, then jumps with no dip and no arm swing. Hands fixed on hips throughout. Isolates concentric leg power without stretch-shortening cycle (SSC) contribution. Compared with VERTICAL_JUMP via POWER_EUR derived metric to diagnose SSC efficiency vs. concentric-strength deficit.',
  1, 'red', 'ArrowUp',
  0, 50
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  is_active = true;

-- ============================================================================
-- Block B — POWER_EUR derived metric (Eccentric Utilization Ratio)
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES (
  'POWER_EUR',
  'Eccentric Utilization Ratio (EUR)',
  'Power',
  'ratio',
  'higher_is_better',
  true, true,
  63,
  'Eccentric Utilization Ratio: VERTICAL_JUMP ÷ JUMP_SJ_HEIGHT. Indicates stretch-shortening cycle (SSC) efficiency. Higher EUR = better elastic-energy use during counter-movement. Concentric-dominant athletes (low EUR) need plyometric prescription; reactive-trained athletes (high EUR) need raised SJ floor (concentric strength). PROTOCOL NOTE: codebase VERTICAL_JUMP is hands-free CMJ (with arm swing) — EUR will read higher than HOH-CMJ-protocol thresholds (spec''s 1.05/1.15/1.25). Recalibrate after BTA internal data accumulates.',
  2, 'red', 'Activity',
  0.5, 2.0,
  true,
  'VERTICAL_JUMP / JUMP_SJ_HEIGHT',
  ARRAY['VERTICAL_JUMP', 'JUMP_SJ_HEIGHT'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  calculation_config = EXCLUDED.calculation_config,
  is_derived = EXCLUDED.is_derived,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  is_active = true;

-- ============================================================================
-- Block C — Soccer SJ benchmark rows
-- Source values from spec (cm); inches conversion shown in parentheticals.
-- All rows LOW-MODERATE confidence — published female-specific SJ normative
-- data is sparse; values extrapolated from CMJ benchmarks discounted for
-- typical 15-25% SSC contribution.
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  -- D1 women's soccer
  ('d1-soc-sj-d1-avg',
   'JUMP_SJ_HEIGHT', 'Soccer D1 Average',
   '26 cm = 10.2 in. Extrapolated from CMJ-HOH baseline minus typical 15-25% SSC contribution. Confidence: LOW-MODERATE — pending BTA internal data.',
   'gte', 10.200, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', NULL, NULL, true, true, 2),

  ('d1-soc-sj-d1-top25',
   'JUMP_SJ_HEIGHT', 'Soccer D1 Top 25%',
   '30 cm = 11.8 in. Top D1 starters concentric-power baseline. Confidence: LOW — pending BTA internal data.',
   'gte', 11.800, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', NULL, NULL, true, true, 3),

  -- HS age-grouped soccer
  ('hs-ms-soc-sj',
   'JUMP_SJ_HEIGHT', 'HS MS Female Soccer (Ages 11-13) Average',
   '16 cm = 6.3 in. Confidence: LOW — estimated, pending BTA internal data accumulation. Limited published MS-age female SJ norms.',
   'gte', 6.300, 'MS Average', 'gray', 'Female', 'SOCCER', 'HS', 11, 13, true, true, 1),

  ('hs-jv-soc-sj',
   'JUMP_SJ_HEIGHT', 'HS JV Female Soccer (Ages 14-15) Average',
   '19 cm = 7.5 in. Confidence: LOW — extrapolated, pending BTA internal data.',
   'gte', 7.500, 'JV Average', 'gray', 'Female', 'SOCCER', 'HS', 14, 15, true, true, 1),

  ('hs-var-soc-sj-avg',
   'JUMP_SJ_HEIGHT', 'HS Varsity Female Soccer (Ages 16-18) Average',
   '22 cm = 8.7 in. Confidence: LOW — extrapolated, pending BTA internal data.',
   'gte', 8.700, 'Varsity Average', 'gray', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 1),

  ('hs-var-soc-sj-top25',
   'JUMP_SJ_HEIGHT', 'HS Varsity Female Soccer (Ages 16-18) Top 25%',
   '26 cm = 10.2 in. Approaches D1 Average — high-tier HS achievable. Confidence: LOW — extrapolated.',
   'gte', 10.200, 'Varsity Top 25%', 'green', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 2)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block D — Volleyball SJ benchmark rows
-- VB athletes have higher CMJ values than soccer; SJ benchmarks scale up.
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  -- D1 women's volleyball
  ('d1-vb-sj-d1-avg',
   'JUMP_SJ_HEIGHT', 'Volleyball D1 Average',
   '38 cm = 15.0 in. Extrapolated from VB CMJ-HOH baseline minus typical 15-25% SSC contribution. Confidence: LOW-MODERATE — pending BTA internal data.',
   'gte', 15.000, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', NULL, NULL, true, true, 2),

  ('d1-vb-sj-d1-top25',
   'JUMP_SJ_HEIGHT', 'Volleyball D1 Top 25%',
   '44 cm = 17.3 in. Top D1 VB MB/OH concentric-power baseline. Confidence: LOW — pending BTA internal data.',
   'gte', 17.300, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', NULL, NULL, true, true, 3),

  -- HS age-grouped volleyball
  ('hs-ms-vb-sj',
   'JUMP_SJ_HEIGHT', 'HS MS Female Volleyball (Ages 11-13) Average',
   '22 cm = 8.7 in. Confidence: LOW — estimated, pending BTA internal data.',
   'gte', 8.700, 'MS Average', 'gray', 'Female', 'VOLLEYBALL', 'HS', 11, 13, true, true, 1),

  ('hs-jv-vb-sj',
   'JUMP_SJ_HEIGHT', 'HS JV Female Volleyball (Ages 14-15) Average',
   '26 cm = 10.2 in. Confidence: LOW — extrapolated.',
   'gte', 10.200, 'JV Average', 'gray', 'Female', 'VOLLEYBALL', 'HS', 14, 15, true, true, 1),

  ('hs-var-vb-sj-avg',
   'JUMP_SJ_HEIGHT', 'HS Varsity Female Volleyball (Ages 16-18) Average',
   '30 cm = 11.8 in. Confidence: LOW — extrapolated.',
   'gte', 11.800, 'Varsity Average', 'gray', 'Female', 'VOLLEYBALL', 'HS', 16, 18, true, true, 1),

  ('hs-var-vb-sj-top25',
   'JUMP_SJ_HEIGHT', 'HS Varsity Female Volleyball (Ages 16-18) Top 25%',
   '36 cm = 14.2 in. High-tier HS volleyball. Confidence: LOW — extrapolated.',
   'gte', 14.200, 'Varsity Top 25%', 'green', 'Female', 'VOLLEYBALL', 'HS', 16, 18, true, true, 2)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block E — benchmark_set_items linkages
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  -- Soccer
  ('bsi-d1-soc-sj-d1-avg',     'd1-womens-soccer',         'd1-soc-sj-d1-avg',     'site', 60),
  ('bsi-d1-soc-sj-d1-top25',   'd1-womens-soccer',         'd1-soc-sj-d1-top25',   'site', 61),
  ('bsi-hs-ms-soc-sj',         'hs-ms-female-soccer',      'hs-ms-soc-sj',         'site', 60),
  ('bsi-hs-jv-soc-sj',         'hs-jv-female-soccer',      'hs-jv-soc-sj',         'site', 60),
  ('bsi-hs-var-soc-sj-avg',    'hs-varsity-female-soccer', 'hs-var-soc-sj-avg',    'site', 60),
  ('bsi-hs-var-soc-sj-top25',  'hs-varsity-female-soccer', 'hs-var-soc-sj-top25',  'site', 61),
  -- Volleyball
  ('bsi-d1-vb-sj-d1-avg',      'd1-womens-volleyball',         'd1-vb-sj-d1-avg',      'site', 60),
  ('bsi-d1-vb-sj-d1-top25',    'd1-womens-volleyball',         'd1-vb-sj-d1-top25',    'site', 61),
  ('bsi-hs-ms-vb-sj',          'hs-ms-female-volleyball',      'hs-ms-vb-sj',          'site', 60),
  ('bsi-hs-jv-vb-sj',          'hs-jv-female-volleyball',      'hs-jv-vb-sj',          'site', 60),
  ('bsi-hs-var-vb-sj-avg',     'hs-varsity-female-volleyball', 'hs-var-vb-sj-avg',     'site', 60),
  ('bsi-hs-var-vb-sj-top25',   'hs-varsity-female-volleyball', 'hs-var-vb-sj-top25',   'site', 61)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block F — Summary
-- ============================================================================
DO $$
DECLARE
  v_sj_rows  INTEGER;
  v_set_items INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sj_rows FROM site_benchmarks WHERE metric_code = 'JUMP_SJ_HEIGHT';
  SELECT COUNT(*) INTO v_set_items FROM benchmark_set_items WHERE benchmark_id LIKE '%-sj-%' OR benchmark_id LIKE '%-sj';

  RAISE NOTICE 'Migration 0131 complete: JUMP_SJ_HEIGHT + POWER_EUR metrics, % SJ benchmark rows (soccer + VB), % SJ set_items.',
    v_sj_rows, v_set_items;
END $$;
