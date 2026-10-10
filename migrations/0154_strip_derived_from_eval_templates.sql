-- Migration 0154: strip derived metrics from eval battery templates
--
-- Spec: AM-FEAT-019 (Eval report v2). Migration 0153 seeded MOMENTUM as an OPTIONAL test of the global
-- 'Soccer eval (yards)' template, but MOMENTUM is a DERIVED metric (computed from WEIGHT_LBS and FLY10_TIME):
-- nothing is ever entered for it, so it must not be an event metric. The new-event form now lists a
-- template's tests, and MOMENTUM would show up as a test to tick with nothing to enter.
--
-- This removes, from EVERY eval_battery_templates.metrics array (global and organization-owned, archived or
-- not), each entry whose key resolves to a site_metrics code with is_derived = true. Templates with no such
-- entry are not touched (updated_at included). An entry whose code has no site_metrics row (for example
-- MOMENTUM on a database that never ran 0152) is not derived and stays; the API reports it as 'missing'.
--
-- Keys resolve through the same logical-key -> code map the API uses
-- (packages/api/services/eval-report/template-keys.ts, TEMPLATE_METRIC_CODES); a key outside the map is a
-- literal site_metrics code. The map below is a point-in-time copy.
--
-- Fresh databases rely on this migration to undo the MOMENTUM entry that 0153 seeds (0152 creates MOMENTUM as derived
-- before 0153 runs, so the seed includes it).
--
-- Defensive rules: a metrics value that is not a jsonb array is ignored; an entry without a metricKey is kept;
-- a template that would be left with NO entries (evalTemplateMetricsSchema requires at least one) is not rewritten,
-- and the NOTICE counts those.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Idempotent: a second run finds nothing to strip.

DROP TABLE IF EXISTS pg_temp._eval_key_codes;
CREATE TEMP TABLE _eval_key_codes (metric_key VARCHAR(100) PRIMARY KEY, code VARCHAR(100) NOT NULL) ON COMMIT DROP;
INSERT INTO _eval_key_codes (metric_key, code) VALUES
  ('505', 'AGILITY_505_YD'),
  ('DASH_10', 'DASH_10YD'),
  ('DASH_20', 'DASH_20YD'),
  ('DASH_30', 'DASH_30YD'),
  ('DASH_40', 'DASH_40YD'),
  ('FLY_10', 'FLY10_TIME'),
  ('CMJ_HOH', 'JUMP_CMJ_HOH'),
  ('SQUAT_JUMP', 'JUMP_SJ_HEIGHT'),
  ('EUR', 'POWER_EUR'),
  ('RSI_BILATERAL', 'RSI_105'),
  ('CMJ_SL_LEFT', 'JUMP_CMJ_SL_L'),
  ('CMJ_SL_RIGHT', 'JUMP_CMJ_SL_R'),
  ('CMJ_SL_ASYM', 'JUMP_CMJ_SL_ASYM'),
  ('505_LEFT', 'AGILITY_505_YD_L'),
  ('505_RIGHT', 'AGILITY_505_YD_R'),
  ('505_LSI', 'AGILITY_505_YD_LSI'),
  ('COD_DEFICIT', 'AGILITY_COD_DEFICIT_YD'),
  ('T_TEST', 'T_TEST'),
  ('MOMENTUM', 'MOMENTUM'),
  ('MQI', 'MQI_TOTAL'),
  ('BODY_HEIGHT', 'HEIGHT_IN'),
  ('BODY_WEIGHT', 'WEIGHT_LBS'),
  ('HANDS_FREE_JUMP', 'VERTICAL_JUMP'),
  ('RSI_LEFT', 'RSI_L'),
  ('RSI_RIGHT', 'RSI_R'),
  ('STRENGTH_SQUAT', 'SQUAT_1RM'),
  ('STRENGTH_BENCH', 'BENCH_1RM'),
  ('STRENGTH_DEADLIFT', 'DEADLIFT_1RM'),
  ('STRENGTH_OHP', 'OHP_1RM'),
  ('PATTERN_LIN_ACCEL', 'MQ_LIN_ACCEL'),
  ('PATTERN_MAX_VELO', 'MQ_MAX_VELO'),
  ('PATTERN_DECEL', 'MQ_DECEL'),
  ('PATTERN_SHUFFLE', 'MQ_SHUFFLE'),
  ('PATTERN_LATRUN', 'MQ_LATRUN'),
  ('PATTERN_HIPTURN', 'MQ_HIPTURN'),
  ('PATTERN_BACKPEDAL', 'MQ_BACKPEDAL'),
  ('PATTERN_JUMP', 'MQ_JUMP'),
  ('TRANSITION_DECEL_CUT', 'MQ_TRANS_DECEL_CUT'),
  ('TRANSITION_GAS_BRAKE', 'MQ_TRANS_GAS_BRAKE'),
  ('TRANSITION_BACKPEDAL_TURN', 'MQ_TRANS_BACKPEDAL_TURN'),
  ('TRANSITION_LAT_LINEAR', 'MQ_TRANS_LAT_LINEAR')
;

-- Keys of derived metrics (resolved through the map, else literal)
DROP TABLE IF EXISTS pg_temp._eval_derived_keys;
CREATE TEMP TABLE _eval_derived_keys (metric_key VARCHAR(100) PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _eval_derived_keys (metric_key)
SELECT DISTINCT e.value->>'metricKey'
  FROM eval_battery_templates t
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.metrics) = 'array' THEN t.metrics ELSE '[]'::jsonb END) AS e(value)
  JOIN site_metrics sm ON sm.code = COALESCE((SELECT k.code FROM _eval_key_codes k WHERE k.metric_key = e.value->>'metricKey'), e.value->>'metricKey')
 WHERE sm.is_derived = true;

DO $$
DECLARE
  v_templates INTEGER;
  v_emptied INTEGER;
  v_keys TEXT;
BEGIN
  SELECT string_agg(metric_key, ', ' ORDER BY metric_key) INTO v_keys FROM _eval_derived_keys;

  DROP TABLE IF EXISTS pg_temp._eval_strip_targets;
  -- Templates with a derived entry (kept = what would remain)
  CREATE TEMP TABLE _eval_strip_targets ON COMMIT DROP AS
  SELECT t.id,
         (SELECT COALESCE(jsonb_agg(e.value ORDER BY e.ord), '[]'::jsonb)
            FROM jsonb_array_elements(t.metrics) WITH ORDINALITY AS e(value, ord)
           WHERE NOT COALESCE(e.value->>'metricKey' IN (SELECT metric_key FROM _eval_derived_keys), false)) AS kept
    FROM eval_battery_templates t
   WHERE jsonb_typeof(t.metrics) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.metrics) AS e(value)
                  WHERE COALESCE(e.value->>'metricKey' IN (SELECT metric_key FROM _eval_derived_keys), false));

  SELECT COUNT(*) INTO v_emptied FROM _eval_strip_targets WHERE jsonb_array_length(kept) = 0;

  UPDATE eval_battery_templates t
     SET metrics = s.kept, updated_at = NOW()
    FROM _eval_strip_targets s
   WHERE s.id = t.id AND jsonb_array_length(s.kept) > 0;
  GET DIAGNOSTICS v_templates = ROW_COUNT;

  RAISE NOTICE 'Migration 0154 complete: removed derived metrics (%) from % eval battery templates; % left untouched because nothing else would remain.', COALESCE(v_keys, 'none found'), v_templates, v_emptied;
END $$;
