-- Migration 0135: Add JUMP_CMJ_HOH and repoint POWER_EUR formula
--
-- Background: Migration 0131 seeded POWER_EUR with formula
-- VERTICAL_JUMP / JUMP_SJ_HEIGHT, but VERTICAL_JUMP in this codebase is a
-- hands-free CMJ (with arm swing). EUR's published interpretation thresholds
-- (1.05 / 1.15 / 1.25 — see vertical-jump-research-context.md §2) are
-- calibrated for hands-on-hips (HOH), no-arm-swing CMJ. The protocol mismatch
-- was flagged in 0131 and worked around by raising EUR's validation_max to
-- 2.5; this migration retires that workaround by introducing a dedicated
-- HOH-CMJ base metric and repointing EUR to it.
--
-- Block layout:
--   A — JUMP_CMJ_HOH base metric
--   B — UPDATE POWER_EUR formula, dependent_metrics, validation_max, description
--   C — RAISE NOTICE summary

-- ============================================================================
-- Block A — JUMP_CMJ_HOH base metric
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max
) VALUES (
  'JUMP_CMJ_HOH',
  'Counter-Movement Jump (HOH)',
  'Power',
  'in',
  'higher_is_better',
  true, true,
  61,
  'Counter-Movement Jump with hands-on-hips (HOH) protocol: athlete keeps hands fixed on hips throughout, performs a full counter-movement (~90° knee dip) into an explosive vertical jump with no arm swing. Differs from VERTICAL_JUMP in this codebase, which permits arm swing and is therefore not protocol-compatible with the published EUR thresholds. Pair with JUMP_SJ_HEIGHT (Squat Jump) on the same date to compute POWER_EUR (CMJ ÷ SJ).',
  1, 'red', 'ArrowUp',
  1, 50
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block B — Repoint POWER_EUR formula to JUMP_CMJ_HOH / JUMP_SJ_HEIGHT
--
-- Tightens validation_max from 2.5 → 1.5 (back to spec's calibrated range).
-- Drops the PROTOCOL NOTE caveat from 0131 — no longer applicable.
-- ============================================================================
UPDATE site_metrics SET
  formula = 'JUMP_CMJ_HOH / JUMP_SJ_HEIGHT',
  dependent_metrics = ARRAY['JUMP_CMJ_HOH', 'JUMP_SJ_HEIGHT'],
  validation_max = 1.5,
  description = 'Eccentric Utilization Ratio: JUMP_CMJ_HOH ÷ JUMP_SJ_HEIGHT. Indicates stretch-shortening cycle (SSC) efficiency. Higher EUR = better elastic-energy use during counter-movement. Concentric-dominant athletes (low EUR) need plyometric prescription; reactive-trained athletes (high EUR) need raised SJ floor (concentric strength). Spec interpretation thresholds (calibrated for HOH-CMJ protocol): <1.05 Concentric-dominant; 1.05–1.15 Functional SSC use; 1.15–1.25 Trained reactive; >1.25 Elite reactive. Source: AM-FEAT-012 §5; vertical-jump-research-context.md §2.',
  is_active = true
WHERE code = 'POWER_EUR';

-- ============================================================================
-- Block C — Summary
-- ============================================================================
DO $$
DECLARE
  v_eur_formula TEXT;
  v_eur_max     NUMERIC;
BEGIN
  SELECT formula, validation_max INTO v_eur_formula, v_eur_max
    FROM site_metrics WHERE code = 'POWER_EUR';

  RAISE NOTICE 'Migration 0135 complete: JUMP_CMJ_HOH added; POWER_EUR formula = %, validation_max = %',
    v_eur_formula, v_eur_max;
END $$;
