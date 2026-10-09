-- Migration 0153 (PROVISIONAL number, take the next free one at merge): eval battery templates and
-- per-organization eval report settings.
--
-- Spec: AM-FEAT-019 (Eval report v2), Part 1b and Part 2, phase P2.
--
-- Block layout:
--   A - eval_battery_templates (organization_id NULL = global default shipped by BTA)
--   B - org_eval_report_settings (1:1 per organization)
--   C - seed the global default template 'Soccer eval (yards)'
--   D - RAISE NOTICE summary
--
-- Ids are varchar(36) with gen_random_uuid() (production id columns are varchar(36)); no id is derived
-- from another id. Template metrics store LOGICAL keys (see eval-report/template-keys.ts); the seed
-- (Block C) is a point-in-time snapshot of that resolution. Derived metrics (MQI_TOTAL, 505 LSI, ...) are
-- never event metrics and are not seeded. The seed SKIPS any code that does not exist in site_metrics
-- (RSI_105, MOMENTUM, JUMP_CMJ_SL_*, HEIGHT/WEIGHT on a fresh DB may be absent), so it never references
-- a nonexistent code and never fails; the NOTICE lists every key skipped by name.
--
-- Spec metrics with no site_metrics code yet: ground contact time, flight time, sitting height,
-- RSI_105 (bilateral 10/5), momentum. Ground contact, flight time and sitting height are deliberately NOT
-- seeded (no code exists, and a guessed code could later bind to the wrong metric); add them to the
-- template when real codes land. RSI_105 and MOMENTUM are named codes that will exist later, so they stay. It never inserts a second global copy if one exists (archived or not).

-- ============================================================================
-- Block A - eval_battery_templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS eval_battery_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(36) REFERENCES organizations(id) ON DELETE CASCADE,
  sport VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  metrics JSONB NOT NULL,
  created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS eval_battery_templates_org_idx ON eval_battery_templates (organization_id);

-- One live template per name per organization; NULL organization_id (global) needs its own index
-- because NULLs are distinct in a plain unique index. Archived templates free their name.
CREATE UNIQUE INDEX IF NOT EXISTS eval_battery_templates_org_name_uniq
  ON eval_battery_templates (organization_id, name)
  WHERE organization_id IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS eval_battery_templates_global_name_uniq
  ON eval_battery_templates (name)
  WHERE organization_id IS NULL AND archived_at IS NULL;

-- ============================================================================
-- Block B - org_eval_report_settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS org_eval_report_settings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  presets JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_selection JSONB,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- Block C - Seed the global default template
-- ============================================================================
DROP TABLE IF EXISTS pg_temp._eval_battery_seed;
CREATE TEMP TABLE _eval_battery_seed (
  metric_key VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL,
  is_required BOOLEAN NOT NULL,
  display_order INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO _eval_battery_seed (metric_key, code, is_required, display_order) VALUES
  -- Required set
  ('BODY_HEIGHT',               'HEIGHT',                   true,   1),
  ('BODY_WEIGHT',               'WEIGHT',                   true,   2),
  ('SQUAT_JUMP',                'JUMP_SJ_HEIGHT',           true,   3),
  ('CMJ_HOH',                   'JUMP_CMJ_HOH',             true,   4),
  ('HANDS_FREE_JUMP',           'VERTICAL_JUMP',            true,   5),
  ('RSI_BILATERAL',             'RSI_105',                  true,   6),
  ('DASH_10',                   'DASH_10YD',                true,   7),
  ('DASH_20',                   'DASH_20YD',                true,  8),
  ('DASH_30',                   'DASH_30YD',                true,  9),
  ('DASH_40',                   'DASH_40YD',                true,  10),
  ('FLY_10',                    'FLY10_TIME',               true,  11),
  ('505_LEFT',                  'AGILITY_505_YD_L',         true,  12),
  ('505_RIGHT',                 'AGILITY_505_YD_R',         true,  13),
  ('PATTERN_LIN_ACCEL',         'MQ_LIN_ACCEL',             true,  14),
  ('PATTERN_MAX_VELO',          'MQ_MAX_VELO',              true,  15),
  ('PATTERN_DECEL',             'MQ_DECEL',                 true,  16),
  ('PATTERN_SHUFFLE',           'MQ_SHUFFLE',               true,  17),
  ('PATTERN_LATRUN',            'MQ_LATRUN',                true,  18),
  ('PATTERN_HIPTURN',           'MQ_HIPTURN',               true,  19),
  ('PATTERN_BACKPEDAL',         'MQ_BACKPEDAL',             true,  20),
  ('PATTERN_JUMP',              'MQ_JUMP',                  true,  21),
  ('TRANSITION_DECEL_CUT',      'MQ_TRANS_DECEL_CUT',       true,  22),
  ('TRANSITION_GAS_BRAKE',      'MQ_TRANS_GAS_BRAKE',       true,  23),
  ('TRANSITION_BACKPEDAL_TURN', 'MQ_TRANS_BACKPEDAL_TURN',  true,  24),
  ('TRANSITION_LAT_LINEAR',     'MQ_TRANS_LAT_LINEAR',      true,  25),
  -- Optional set (off by default; use one single-leg CMJ per athlete, not both)
  ('RSI_LEFT',                  'RSI_L',                    false, 26),
  ('RSI_RIGHT',                 'RSI_R',                    false, 27),
  ('CMJ_SL_LEFT',               'JUMP_CMJ_SL_L',            false, 28),
  ('CMJ_SL_RIGHT',              'JUMP_CMJ_SL_R',            false, 29),
  ('STRENGTH_SQUAT',            'SQUAT_1RM',                false, 30),
  ('STRENGTH_BENCH',            'BENCH_1RM',                false, 31),
  ('STRENGTH_DEADLIFT',         'DEADLIFT_1RM',             false, 32),
  ('STRENGTH_OHP',              'OHP_1RM',                  false, 33),
  ('MOMENTUM',                  'MOMENTUM',                 false, 34);

INSERT INTO eval_battery_templates (organization_id, sport, name, description, metrics)
SELECT NULL, 'SOCCER', 'Soccer eval (yards)',
       'BTA soccer evaluation battery, yard protocol. Optional tests are off by default.',
       jsonb_agg(
         jsonb_build_object('metricKey', b.metric_key, 'isRequired', b.is_required, 'displayOrder', b.display_order)
         ORDER BY b.display_order
       )
  FROM _eval_battery_seed b
  JOIN site_metrics sm ON sm.code = b.code
 -- Any global copy, archived or not: a rerun under a renumbered migration must not add a second one
 WHERE NOT EXISTS (
   SELECT 1 FROM eval_battery_templates WHERE organization_id IS NULL AND name = 'Soccer eval (yards)'
 )
HAVING count(*) > 0;

-- ============================================================================
-- Block C2 - Lookup index for eval reports
-- ============================================================================
-- COPPA deletion/export/merge, the defaults route and the report loader find eval reports by
-- config->>'athleteId' and config->>'eventId'; without this they scan every report row.
CREATE INDEX IF NOT EXISTS reports_eval_athlete_event_idx
  ON reports ((config->>'athleteId'), (config->>'eventId'))
  WHERE report_type = 'eval';

-- ============================================================================
-- Block D - Summary
-- ============================================================================
DO $$
DECLARE
  v_keys INTEGER;
  v_skipped TEXT;
BEGIN
  SELECT COALESCE(jsonb_array_length(metrics), 0) INTO v_keys
    FROM eval_battery_templates
   WHERE organization_id IS NULL AND name = 'Soccer eval (yards)'
   ORDER BY archived_at NULLS FIRST
   LIMIT 1;

  SELECT string_agg(b.metric_key || ' (' || b.code || ')', ', ' ORDER BY b.display_order) INTO v_skipped
    FROM _eval_battery_seed b
   WHERE NOT EXISTS (SELECT 1 FROM site_metrics sm WHERE sm.code = b.code);

  RAISE NOTICE 'Migration 0153 complete: eval_battery_templates, org_eval_report_settings; global template ''Soccer eval (yards)'' has % metrics. Spec metrics with no site_metrics code yet: ground contact time, flight time, sitting height, RSI_105 (bilateral 10/5), momentum. Seed keys skipped for lack of a code: %',
    COALESCE(v_keys, 0), COALESCE(v_skipped, 'none');
END $$;
