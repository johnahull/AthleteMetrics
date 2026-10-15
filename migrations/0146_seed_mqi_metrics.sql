-- Migration 0146: Seed Movement Quality Index (MQI) metrics
--
-- Spec: AM-FEAT-015 (MQI capture implementation spec, section 4.1)
--
-- Adds 12 coach-entered ordinal base metrics (0-3 rubric: 3 Efficient,
-- 2 Functional, 1 Compensated, 0 Absent) and 2 derived totals:
--   MQI_TOTAL           = sum of the 8 movement-pattern scores (0-24)
--   MQ_TRANSITION_TOTAL = sum of the 4 transition scores       (0-12)
-- Transition scores are never part of MQI_TOTAL.
--
-- Unit is 'score' for all metrics (measurements.units is NOT NULL).
-- Derived totals use same_date matching with 'skip' for missing sources, so a
-- partial set (e.g. 7 of 8 patterns) produces no total.
--
-- Pattern follows 0131_seed_squat_jump_eur.sql (ON CONFLICT upsert + NOTICE).
--
-- Block layout:
--   A - 12 base ordinal metrics (8 patterns + 4 transitions)
--   B - MQI_TOTAL derived metric
--   C - MQ_TRANSITION_TOTAL derived metric
--   D - RAISE NOTICE summary

-- ============================================================================
-- Block A - Base ordinal metrics
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max
) VALUES
  ('MQ_LIN_ACCEL', 'Linear Acceleration', 'Movement Quality', 'score', 'higher_is_better', true, true, 300,
   'Movement Quality Assessment pattern score (0-3): Linear Acceleration. 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_MAX_VELO', 'Max Velocity', 'Movement Quality', 'score', 'higher_is_better', true, true, 301,
   'Movement Quality Assessment pattern score (0-3): Max Velocity. 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_DECEL', 'Deceleration', 'Movement Quality', 'score', 'higher_is_better', true, true, 302,
   'Movement Quality Assessment pattern score (0-3): Deceleration. 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_SHUFFLE', 'Lateral Shuffle', 'Movement Quality', 'score', 'higher_is_better', true, true, 303,
   'Movement Quality Assessment pattern score (0-3): Lateral Shuffle. 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_LATRUN', 'Lateral Run (crossover)', 'Movement Quality', 'score', 'higher_is_better', true, true, 304,
   'Movement Quality Assessment pattern score (0-3): Lateral Run (crossover). 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_HIPTURN', 'Hip Turn', 'Movement Quality', 'score', 'higher_is_better', true, true, 305,
   'Movement Quality Assessment pattern score (0-3): Hip Turn. 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_BACKPEDAL', 'Backpedal', 'Movement Quality', 'score', 'higher_is_better', true, true, 306,
   'Movement Quality Assessment pattern score (0-3): Backpedal. 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_JUMP', 'Jump', 'Movement Quality', 'score', 'higher_is_better', true, true, 307,
   'Movement Quality Assessment pattern score (0-3): Jump. 3 Efficient, 2 Functional, 1 Compensated, 0 Absent. Coach-scored from video.',
   0, 'blue', 'Activity', 0, 3),
  ('MQ_TRANS_DECEL_CUT', 'Decel → Lateral Cut', 'Movement Quality', 'score', 'higher_is_better', true, true, 310,
   'Movement Quality Assessment transition score (0-3): Deceleration to lateral cut. Optional (Full tier). Not part of MQI_TOTAL.',
   0, 'purple', 'Activity', 0, 3),
  ('MQ_TRANS_GAS_BRAKE', 'Gas ↔ Brake', 'Movement Quality', 'score', 'higher_is_better', true, true, 311,
   'Movement Quality Assessment transition score (0-3): Gas to brake transitions. Optional (Full tier). Not part of MQI_TOTAL.',
   0, 'purple', 'Activity', 0, 3),
  ('MQ_TRANS_BACKPEDAL_TURN', 'Backpedal → Hip Turn → Sprint', 'Movement Quality', 'score', 'higher_is_better', true, true, 312,
   'Movement Quality Assessment transition score (0-3): Backpedal to hip turn to sprint. Optional (Full tier). Not part of MQI_TOTAL.',
   0, 'purple', 'Activity', 0, 3),
  ('MQ_TRANS_LAT_LINEAR', 'Lateral → Linear', 'Movement Quality', 'score', 'higher_is_better', true, true, 313,
   'Movement Quality Assessment transition score (0-3): Lateral to linear. Optional (Full tier). Not part of MQI_TOTAL.',
   0, 'purple', 'Activity', 0, 3)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  decimal_precision = EXCLUDED.decimal_precision,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block B - MQI_TOTAL (8 movement patterns only; transitions excluded)
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES (
  'MQI_TOTAL',
  'Movement Quality Index (MQI)',
  'Movement Quality',
  'score',
  'higher_is_better',
  true, true,
  320,
  'Movement Quality Index: sum of the 8 movement-pattern scores (0-24). Calculated only when all 8 patterns are scored for the same date. Transition scores are not included.',
  0, 'blue', 'Activity',
  0, 24,
  true,
  'MQ_LIN_ACCEL + MQ_MAX_VELO + MQ_DECEL + MQ_SHUFFLE + MQ_LATRUN + MQ_HIPTURN + MQ_BACKPEDAL + MQ_JUMP',
  ARRAY['MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  -- Merge so keys added by later migrations (0148 sourceSelection) survive a re-apply
  calculation_config = COALESCE(site_metrics.calculation_config, '{}'::jsonb) || EXCLUDED.calculation_config,
  is_derived = EXCLUDED.is_derived,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  decimal_precision = EXCLUDED.decimal_precision,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block C - MQ_TRANSITION_TOTAL (4 transitions)
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES (
  'MQ_TRANSITION_TOTAL',
  'MQ Transition Total',
  'Movement Quality',
  'score',
  'higher_is_better',
  true, true,
  321,
  'Sum of the 4 transition scores (0-12). Calculated only when all 4 transitions are scored for the same date. Independent of MQI_TOTAL.',
  0, 'purple', 'Activity',
  0, 12,
  true,
  'MQ_TRANS_DECEL_CUT + MQ_TRANS_GAS_BRAKE + MQ_TRANS_BACKPEDAL_TURN + MQ_TRANS_LAT_LINEAR',
  ARRAY['MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE', 'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  -- Merge so keys added by later migrations (0148 sourceSelection) survive a re-apply
  calculation_config = COALESCE(site_metrics.calculation_config, '{}'::jsonb) || EXCLUDED.calculation_config,
  is_derived = EXCLUDED.is_derived,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  decimal_precision = EXCLUDED.decimal_precision,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block D - Summary
-- ============================================================================
DO $$
DECLARE
  v_base INTEGER;
  v_derived INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_base FROM site_metrics WHERE category = 'Movement Quality' AND is_derived = false;
  SELECT COUNT(*) INTO v_derived FROM site_metrics WHERE category = 'Movement Quality' AND is_derived = true;

  RAISE NOTICE 'Migration 0146 complete: % MQ base metrics, % MQ derived totals (MQI_TOTAL, MQ_TRANSITION_TOTAL).',
    v_base, v_derived;
END $$;
