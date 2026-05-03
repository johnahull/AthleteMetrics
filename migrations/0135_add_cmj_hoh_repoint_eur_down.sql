-- Down Migration 0135: Reverse JUMP_CMJ_HOH addition + EUR repoint
--
-- Reverses 0135 in dependency-safe order:
--   Step 1 — Restore POWER_EUR to its 0131-original formula, dependents,
--            validation_max, and description (verbatim).
--   Step 2 — Remove JUMP_CMJ_HOH base metric (CONDITIONAL — only if no
--            measurements reference it; parallel to 0131-down's protection
--            of JUMP_SJ_HEIGHT).

-- Step 1 — Restore POWER_EUR to its 0131-original definition.
UPDATE site_metrics SET
  formula = 'VERTICAL_JUMP / JUMP_SJ_HEIGHT',
  dependent_metrics = ARRAY['VERTICAL_JUMP', 'JUMP_SJ_HEIGHT'],
  validation_max = 2.5,
  description = 'Eccentric Utilization Ratio: VERTICAL_JUMP ÷ JUMP_SJ_HEIGHT. Indicates stretch-shortening cycle (SSC) efficiency. Higher EUR = better elastic-energy use during counter-movement. Concentric-dominant athletes (low EUR) need plyometric prescription; reactive-trained athletes (high EUR) need raised SJ floor (concentric strength). PROTOCOL NOTE: codebase VERTICAL_JUMP is hands-free CMJ (with arm swing) — EUR will read higher than HOH-CMJ-protocol thresholds (spec''s 1.05/1.15/1.25). Recalibrate after BTA internal data accumulates. Validation cap raised to 2.5 to accommodate seeded arm-swing-CMJ ratios (Soccer MS implied EUR ≈ 2.06 from VERTICAL_JUMP 13.0 / SJ 6.3).'
WHERE code = 'POWER_EUR';

-- Step 2 — Remove JUMP_CMJ_HOH (only if unused).
DELETE FROM site_metrics
 WHERE code = 'JUMP_CMJ_HOH'
   AND NOT EXISTS (SELECT 1 FROM measurements WHERE metric_code = 'JUMP_CMJ_HOH');

DO $$
BEGIN
  RAISE NOTICE 'Migration 0135 (down): POWER_EUR restored to VERTICAL_JUMP / JUMP_SJ_HEIGHT. JUMP_CMJ_HOH preserved if measurements reference it.';
END $$;
