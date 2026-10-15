-- Migration 0156: RSI_105 and single-leg CMJ (JUMP_CMJ_SL_L / JUMP_CMJ_SL_R) metrics; top up the global eval template
--
-- Spec: AM-FEAT-019 (Eval report v2). The eval report and the 'Soccer eval (yards)' template name RSI_105 (bilateral
-- 10/5 RSI, logical key RSI_BILATERAL) and the single-leg CMJ sides (CMJ_SL_LEFT / CMJ_SL_RIGHT), but no migration
-- created those codes, so the 0153 seed skipped them (docs/EVAL_REPORT_FOLLOWUPS.md item 22).
--
-- Block layout:
--   A - site_metrics rows, copied from the source metric's row
--   B - organization enablement: an organization that enables the source gets the new metric enabled
--   C - top up the global 'Soccer eval (yards)' template
--   D - RAISE NOTICE summary
--
-- Owner decision: each new metric has the SAME definition as its source row; only code, label, display_order and the
-- text below differ.
--   RSI_105        <- RSI           (own description, short_description, what_it_measures: RSI's text says drop jumps;
--                                    why_it_matters is copied)
--   JUMP_CMJ_SL_L  <- JUMP_CMJ_HOH  (own description: the HOH text is about the two-leg jump and POWER_EUR)
--   JUMP_CMJ_SL_R  <- JUMP_CMJ_HOH
-- Copied columns (a text column given in the VALUES list below wins): category, unit, metric_type, is_system_default,
-- is_active, short_description, what_it_measures, why_it_matters, available_org_types, sport_associations, validation_min, validation_max, decimal_precision, color,
-- icon, is_derived, formula, dependent_metrics, calculation_config, auxiliary_input_config.
-- A metric whose source row is absent is skipped (NOTICE), never guessed. An existing row is never modified
-- (ON CONFLICT DO NOTHING). JUMP_CMJ_SL_ASYM is not created. No benchmark rows are seeded: the eval report never
-- compares these codes (NO_TIER_CODES in eval-report/tier-match.ts).
--
-- Template top-up (Block C): only the global template (organization_id NULL, name 'Soccer eval (yards)', not archived,
-- metrics a jsonb array). Organization templates are never touched. An entry is added only when its metric exists, is
-- active and not derived, and the template has no entry for it yet (by logical key or by literal code). RSI_BILATERAL is
-- required; CMJ_SL_LEFT and CMJ_SL_RIGHT are optional (the API rejects both sides required: one side per athlete).
-- displayOrder is the 0153 seed's slot (6, 28, 29) when no entry uses it, else one past the template's highest, capped
-- at 9999 (the API maximum). The single-leg sides move together: if either slot 28 or 29 is used, both go after the
-- last entry, Left then Right.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- A second run straight after the first creates and adds nothing.
-- Do not re-run by hand: a manual re-run re-adds template entries and org rows an admin deleted.

-- ============================================================================
-- Block A - site_metrics rows copied from the source rows
-- ============================================================================
-- Inline VALUES (not a temp table) so metric-key-map.test.ts sees the codes in an INSERT INTO site_metrics.
INSERT INTO site_metrics (
  code, label, display_order, description,
  category, unit, metric_type, is_system_default, is_active,
  short_description, what_it_measures, why_it_matters,
  available_org_types, sport_associations, validation_min, validation_max, decimal_precision, color, icon,
  is_derived, formula, dependent_metrics, calculation_config, auxiliary_input_config
)
SELECT n.code, n.label, n.display_order, COALESCE(n.description, src.description),
       src.category, src.unit, src.metric_type, src.is_system_default, src.is_active,
       COALESCE(n.short_description, src.short_description), COALESCE(n.what_it_measures, src.what_it_measures), src.why_it_matters,
       src.available_org_types, src.sport_associations, src.validation_min, src.validation_max, src.decimal_precision, src.color, src.icon,
       src.is_derived, src.formula, src.dependent_metrics, src.calculation_config, src.auxiliary_input_config
  FROM (VALUES
    ('RSI_105', 'RSI', 'RSI Bilateral (10/5 Repeat Hop)', 71,
     'Bilateral Reactive Strength Index via 10/5 Repeat Hop protocol: 10 consecutive maximal two-leg hops; the best 5 ground contacts are used. RSI = jump height ÷ ground contact time. Higher RSI = better elastic energy use and reactive control. Same unit and range as RSI.',
     'How quickly and how high you bounce in ten two-leg hops (the 10/5 test) — spring and stiffness in one number.',
     'The 10/5 repeat hop test: ten consecutive two-leg hops, each as high as you can with as little time on the ground as you can. RSI is jump height divided by ground contact time, from your best five ground contacts.'),
    ('JUMP_CMJ_SL_L', 'JUMP_CMJ_HOH', 'Counter-Movement Jump (Left Leg)', 65,
     'Single-leg Counter-Movement Jump with hands-on-hips (HOH) protocol, left leg: athlete keeps hands fixed on hips throughout, takes off and lands on the left leg only, and performs a full counter-movement into an explosive vertical jump with no arm swing. Same unit and range as JUMP_CMJ_HOH. An eval event tests one side per athlete.',
     NULL, NULL),
    ('JUMP_CMJ_SL_R', 'JUMP_CMJ_HOH', 'Counter-Movement Jump (Right Leg)', 66,
     'Single-leg Counter-Movement Jump with hands-on-hips (HOH) protocol, right leg: athlete keeps hands fixed on hips throughout, takes off and lands on the right leg only, and performs a full counter-movement into an explosive vertical jump with no arm swing. Same unit and range as JUMP_CMJ_HOH. An eval event tests one side per athlete.',
     NULL, NULL)
  ) AS n(code, source_code, label, display_order, description, short_description, what_it_measures)
  JOIN site_metrics src ON src.code = n.source_code
ON CONFLICT (code) DO NOTHING;

-- New code -> source code, for Blocks B and D (the same pairs as above)
DROP TABLE IF EXISTS pg_temp._new_eval_metrics;
CREATE TEMP TABLE _new_eval_metrics (code VARCHAR(50) PRIMARY KEY, source_code VARCHAR(50) NOT NULL) ON COMMIT DROP;
INSERT INTO _new_eval_metrics (code, source_code) VALUES
  ('RSI_105', 'RSI'),
  ('JUMP_CMJ_SL_L', 'JUMP_CMJ_HOH'),
  ('JUMP_CMJ_SL_R', 'JUMP_CMJ_HOH');

-- ============================================================================
-- Block B - Organization enablement
-- ============================================================================
-- An organization with the source metric enabled gets the new metric enabled (the 0152 pattern). ON CONFLICT DO
-- NOTHING: an existing row, e.g. an admin's choice, is never overridden.
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT om.organization_id, n.code, true
  FROM _new_eval_metrics n
  JOIN organization_metrics om ON om.metric_code = n.source_code AND om.is_enabled = true
  JOIN site_metrics sm ON sm.code = n.code
ON CONFLICT (organization_id, metric_code) DO NOTHING;

-- ============================================================================
-- Block C - Top up the global 'Soccer eval (yards)' template
-- ============================================================================
DROP TABLE IF EXISTS pg_temp._eval_topup;
CREATE TEMP TABLE _eval_topup (
  metric_key VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  is_required BOOLEAN NOT NULL,
  display_order INTEGER NOT NULL
) ON COMMIT DROP;

-- (key, code, required, 0153 seed slot); the key -> code map is a point-in-time copy of eval-report/template-keys.ts
INSERT INTO _eval_topup (metric_key, code, is_required, display_order) VALUES
  ('RSI_BILATERAL', 'RSI_105', true, 6),
  ('CMJ_SL_LEFT', 'JUMP_CMJ_SL_L', false, 28),
  ('CMJ_SL_RIGHT', 'JUMP_CMJ_SL_R', false, 29);

DO $$
DECLARE
  t RECORD;
  k RECORD;
  v_order INTEGER;
  v_added INTEGER := 0;
  v_templates INTEGER := 0;
  v_metrics JSONB;
  v_sl_free BOOLEAN;
  v_created TEXT;
  v_skipped TEXT;
BEGIN
  FOR t IN
    SELECT id, metrics FROM eval_battery_templates
     WHERE organization_id IS NULL AND name = 'Soccer eval (yards)' AND archived_at IS NULL
       AND jsonb_typeof(metrics) = 'array'
  LOOP
    v_metrics := t.metrics;
    v_sl_free := NULL;
    FOR k IN
      SELECT u.* FROM _eval_topup u
        JOIN site_metrics sm ON sm.code = u.code AND sm.is_active = true AND sm.is_derived = false
       ORDER BY u.display_order
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_metrics) AS e(value) WHERE e.value->>'metricKey' IN (k.metric_key, k.code)
      );
      -- The single-leg pair is decided once, at its first side: both seed slots free, or both sides go after the last
      -- entry (Left first, as the loop runs in slot order)
      IF k.display_order IN (28, 29) AND v_sl_free IS NULL THEN
        v_sl_free := NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_metrics) AS e(value)
                                  WHERE jsonb_typeof(e.value->'displayOrder') = 'number' AND (e.value->>'displayOrder')::numeric IN (28, 29));
      END IF;
      v_order := CASE
        WHEN (k.display_order IN (28, 29) AND NOT v_sl_free)
          OR (k.display_order NOT IN (28, 29) AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_metrics) AS e(value)
                      WHERE jsonb_typeof(e.value->'displayOrder') = 'number' AND (e.value->>'displayOrder')::numeric = k.display_order))
          THEN LEAST(COALESCE((SELECT MAX((e.value->>'displayOrder')::numeric)::int FROM jsonb_array_elements(v_metrics) AS e(value)
                                WHERE jsonb_typeof(e.value->'displayOrder') = 'number'), 0) + 1, 9999)
        ELSE k.display_order
      END;
      v_metrics := v_metrics || jsonb_build_array(jsonb_build_object('metricKey', k.metric_key, 'isRequired', k.is_required, 'displayOrder', v_order));
      v_added := v_added + 1;
    END LOOP;
    IF v_metrics <> t.metrics THEN
      UPDATE eval_battery_templates SET metrics = v_metrics, updated_at = NOW() WHERE id = t.id;
      v_templates := v_templates + 1;
    END IF;
  END LOOP;

  -- ==========================================================================
  -- Block D - Summary
  -- ==========================================================================
  SELECT string_agg(n.code, ', ' ORDER BY n.code) INTO v_created FROM _new_eval_metrics n WHERE EXISTS (SELECT 1 FROM site_metrics sm WHERE sm.code = n.code);
  SELECT string_agg(n.code || ' (no ' || n.source_code || ' row)', ', ' ORDER BY n.code) INTO v_skipped
    FROM _new_eval_metrics n WHERE NOT EXISTS (SELECT 1 FROM site_metrics sm WHERE sm.code = n.code);

  RAISE NOTICE 'Migration 0156 complete: metrics present: %; skipped for lack of a source row: %; added % entries to % global template(s) ''Soccer eval (yards)''.',
    COALESCE(v_created, 'none'), COALESCE(v_skipped, 'none'), v_added, v_templates;
END $$;
