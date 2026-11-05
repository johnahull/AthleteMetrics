-- Migration 0180 (PROVISIONAL number, take the next free one at merge; 0179 is held by AM-FEAT-024 PR 1):
-- versioned eval battery templates, and the Foundation / Performance presets.
--
-- Spec: AM-FEAT-024 (Universal Assessment), PR 3, option B1.
--
-- Block layout:
--   A - eval_battery_template_revisions (append-only), eval_battery_templates.current_revision_id,
--       events.eval_template_revision_id
--   B - immutability trigger on the revisions
--   C - seed the global presets Foundation and Performance
--   D - backfill revision 1 for every template that has none, and point current_revision_id at the latest revision
--   E - RAISE NOTICE summary
--
-- Ids are varchar(36) with gen_random_uuid() (production id columns are varchar(36)); no id is derived from another id.
-- Every constraint is named explicitly (<= 63 chars) and matches packages/shared/schema/tables/eval-reports.ts and
-- events.ts, so db:push shows no drift. A db:push database has no trigger: the service never updates or deletes a revision.
--
-- created_by has NO foreign key on purpose. users ON DELETE SET NULL would be an UPDATE of an immutable row, and the
-- trigger would refuse it, which would make deleting a user fail. The id is a historical snapshot, like measurements.
-- A revision can go only together with its template (the FK cascade): the trigger allows a DELETE only once the
-- template row is gone. Deleting an event's revision clears events.eval_template_revision_id (ON DELETE SET NULL);
-- saved reports stay readable because they freeze {templateId, revision, name} themselves.
--
-- Limit of the trigger: it is a row-level BEFORE UPDATE OR DELETE trigger. It does NOT cover a bulk emptying of the table
-- (TRUNCATE) nor a session running with session_replication_role = replica, which skip row triggers. Only a superuser
-- or table owner doing maintenance can do either; nothing in the application does.
--
-- Presets are identified by eval_battery_templates.preset_key ('foundation', 'performance'), a stable key that a rename,
-- an archive or a new template with the same name neither removes nor inherits. The MQI lock keys on it.
--
-- The presets store logical keys (eval-report/template-keys.ts) and literal codes (FLY10_TIME_RI30, JUMP_BROAD,
-- HOP_SL_TRIPLE_L/R have no logical key). They are NOT filtered by site_metrics: applying a template skips a key whose
-- metric is missing or inactive and reports it (skipped), so a metric created later (HEIGHT_IN, WEIGHT_LBS and the
-- triple hop are created in the admin UI on some databases) joins the preset without a new revision.
-- MQI_TOTAL is derived and never an event metric, so the presets carry the eight MQ_* pattern scores (all required);
-- the total follows from them. The MQ_TRANS_* transition scores stay out (Full tier, not part of MQI_TOTAL).

-- ============================================================================
-- Block A - tables and columns
-- ============================================================================
CREATE TABLE IF NOT EXISTS eval_battery_template_revisions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR(36) NOT NULL,
  revision INTEGER NOT NULL,
  metrics JSONB NOT NULL,
  published_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(36),
  CONSTRAINT eval_battery_template_revisions_template_fk FOREIGN KEY (template_id) REFERENCES eval_battery_templates(id) ON DELETE CASCADE,
  CONSTRAINT eval_battery_template_revisions_template_rev_uniq UNIQUE (template_id, revision)
);

ALTER TABLE eval_battery_templates ADD COLUMN IF NOT EXISTS current_revision_id VARCHAR(36);
ALTER TABLE events ADD COLUMN IF NOT EXISTS eval_template_revision_id VARCHAR(36);
ALTER TABLE eval_battery_templates ADD COLUMN IF NOT EXISTS preset_key VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS eval_battery_templates_preset_key_uniq ON eval_battery_templates (preset_key) WHERE preset_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eval_battery_templates_current_revision_fk' AND conrelid = 'eval_battery_templates'::regclass) THEN
    ALTER TABLE eval_battery_templates
      ADD CONSTRAINT eval_battery_templates_current_revision_fk
      FOREIGN KEY (current_revision_id) REFERENCES eval_battery_template_revisions(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_eval_template_revision_fk' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_eval_template_revision_fk
      FOREIGN KEY (eval_template_revision_id) REFERENCES eval_battery_template_revisions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS events_eval_template_revision_idx ON events (eval_template_revision_id);

-- ============================================================================
-- Block B - immutability
-- ============================================================================
CREATE OR REPLACE FUNCTION eval_battery_template_revisions_immutable() RETURNS trigger AS $fn$
BEGIN
  -- The one allowed change: the cascade from deleting the template (its row is already gone by then)
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM eval_battery_templates WHERE id = OLD.template_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'eval_battery_template_revisions rows are immutable (% refused)', TG_OP;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS eval_battery_template_revisions_immutable_trg ON eval_battery_template_revisions;
CREATE TRIGGER eval_battery_template_revisions_immutable_trg
  BEFORE UPDATE OR DELETE ON eval_battery_template_revisions
  FOR EACH ROW EXECUTE FUNCTION eval_battery_template_revisions_immutable();

-- ============================================================================
-- Block C - seed the global presets
-- ============================================================================
-- Source: Athlete_Metrics_Universal_Assessment_Spec_v3 (Foundation / Performance tables), with the AM-FEAT-024
-- Decisions applied: acceleration = DASH_10YD; high-speed running = FLY10_TIME_RI30; vertical = CMJ HOH;
-- reactive strength = RSI_105; change of direction = meter 5-0-5 left and right; horizontal = JUMP_BROAD;
-- MQI required in both; triple hop optional (never on by default); EUR is derived from CMJ and SJ, never a template test.
-- Required = pre-loaded on the event (the coach can still remove any test except MQI). Foundation required = the PDF's
-- "Core" and "Core when equipped" tests (height and weight, CMJ, broad jump) and the "Conditional core" 40 yd sprint with
-- 10/20/30 splits (the full spec says "Core if distance, technique and space permit"), plus FLY10_TIME_RI30, the 30-40 yd
-- leg of that same trial. The PDF marks the 5-0-5 "Conditional" ("only after safe cutting and braking demonstrated") and
-- RSI and the squat jump "Optional", so those stay optional: Foundation need not produce all six radar axes.
-- Performance required = every PDF Core / Core-if-competent test; the triple hop ("added if ready") is optional.
DROP TABLE IF EXISTS pg_temp._eval_preset_seed;
CREATE TEMP TABLE _eval_preset_seed (
  preset TEXT NOT NULL,
  metric_key VARCHAR(50) NOT NULL,
  is_required BOOLEAN NOT NULL,
  display_order INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO _eval_preset_seed (preset, metric_key, is_required, display_order) VALUES
  ('Foundation', 'BODY_HEIGHT',        true,  1),
  ('Foundation', 'BODY_WEIGHT',        true,  2),
  ('Foundation', 'DASH_10',            true,  3),
  ('Foundation', 'DASH_20',            true,  4),
  ('Foundation', 'DASH_30',            true,  5),
  ('Foundation', 'DASH_40',            true,  6),
  ('Foundation', 'FLY10_TIME_RI30',    true,  7),
  ('Foundation', 'CMJ_HOH',            true,  8),
  ('Foundation', 'JUMP_BROAD',         true,  9),
  ('Foundation', '505_LEFT',           false, 10),
  ('Foundation', '505_RIGHT',          false, 11),
  ('Foundation', 'SQUAT_JUMP',         false, 12),
  ('Foundation', 'RSI_BILATERAL',      false, 13),
  ('Foundation', 'HOP_SL_TRIPLE_L',    false, 14),
  ('Foundation', 'HOP_SL_TRIPLE_R',    false, 15),
  ('Foundation', 'PATTERN_LIN_ACCEL',  true,  16),
  ('Foundation', 'PATTERN_MAX_VELO',   true,  17),
  ('Foundation', 'PATTERN_DECEL',      true,  18),
  ('Foundation', 'PATTERN_SHUFFLE',    true,  19),
  ('Foundation', 'PATTERN_LATRUN',     true,  20),
  ('Foundation', 'PATTERN_HIPTURN',    true,  21),
  ('Foundation', 'PATTERN_BACKPEDAL',  true,  22),
  ('Foundation', 'PATTERN_JUMP',       true,  23),
  ('Performance', 'BODY_HEIGHT',       true,  1),
  ('Performance', 'BODY_WEIGHT',       true,  2),
  ('Performance', 'DASH_10',           true,  3),
  ('Performance', 'DASH_20',           true,  4),
  ('Performance', 'DASH_30',           true,  5),
  ('Performance', 'DASH_40',           true,  6),
  ('Performance', 'FLY10_TIME_RI30',   true,  7),
  ('Performance', 'CMJ_HOH',           true,  8),
  ('Performance', 'SQUAT_JUMP',        true,  9),
  ('Performance', 'RSI_BILATERAL',     true,  10),
  ('Performance', 'JUMP_BROAD',        true,  11),
  ('Performance', '505_LEFT',          true,  12),
  ('Performance', '505_RIGHT',         true,  13),
  ('Performance', 'HOP_SL_TRIPLE_L',   false, 14),
  ('Performance', 'HOP_SL_TRIPLE_R',   false, 15),
  ('Performance', 'PATTERN_LIN_ACCEL', true,  16),
  ('Performance', 'PATTERN_MAX_VELO',  true,  17),
  ('Performance', 'PATTERN_DECEL',     true,  18),
  ('Performance', 'PATTERN_SHUFFLE',   true,  19),
  ('Performance', 'PATTERN_LATRUN',    true,  20),
  ('Performance', 'PATTERN_HIPTURN',   true,  21),
  ('Performance', 'PATTERN_BACKPEDAL', true,  22),
  ('Performance', 'PATTERN_JUMP',      true,  23);

-- The unique indexes (global name while live, and preset_key) make a rerun, a preset a site admin already created by
-- hand, and an archived or renamed preset all no-ops: the seed never recreates or duplicates a preset.
INSERT INTO eval_battery_templates (organization_id, sport, name, preset_key, description, metrics)
SELECT NULL, 'ALL', p.preset, lower(p.preset),
       CASE p.preset
         WHEN 'Foundation' THEN 'BTA Foundation assessment, default for ages 11-14: simple, safe, reproducible tests. Movement (MQI) is required; the triple hop is optional.'
         ELSE 'BTA Performance assessment, default for high school and up: Foundation plus the higher-demand tests. Movement (MQI) is required; the triple hop is optional.'
       END,
       jsonb_agg(jsonb_build_object('metricKey', p.metric_key, 'isRequired', p.is_required, 'displayOrder', p.display_order) ORDER BY p.display_order)
  FROM _eval_preset_seed p
 GROUP BY p.preset
ON CONFLICT DO NOTHING;

-- A live global Foundation / Performance that exists without the key (made by hand, or seeded by an earlier draft of
-- this migration) takes it, once; a key already held by another row is never reassigned.
UPDATE eval_battery_templates t
   SET preset_key = lower(t.name)
 WHERE t.organization_id IS NULL AND t.archived_at IS NULL AND t.preset_key IS NULL
   AND t.name IN ('Foundation', 'Performance')
   AND NOT EXISTS (SELECT 1 FROM eval_battery_templates o WHERE o.preset_key = lower(t.name));

-- ============================================================================
-- Block D - revision 1 for every template without one, then current_revision_id
-- ============================================================================
INSERT INTO eval_battery_template_revisions (template_id, revision, metrics, created_by)
SELECT t.id, 1, t.metrics, t.created_by
  FROM eval_battery_templates t
 WHERE NOT EXISTS (SELECT 1 FROM eval_battery_template_revisions r WHERE r.template_id = t.id);

UPDATE eval_battery_templates t
   SET current_revision_id = latest.id
  FROM (
    SELECT DISTINCT ON (template_id) id, template_id
      FROM eval_battery_template_revisions
     ORDER BY template_id, revision DESC
  ) latest
 WHERE latest.template_id = t.id AND t.current_revision_id IS NULL;

-- ============================================================================
-- Block E - Summary
-- ============================================================================
DO $$
DECLARE
  v_revisions INTEGER;
  v_without INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_revisions FROM eval_battery_template_revisions;
  SELECT COUNT(*) INTO v_without FROM eval_battery_templates WHERE current_revision_id IS NULL;
  RAISE NOTICE 'Migration 0180 complete: % revisions; % templates without a current revision; presets Foundation and Performance seeded when absent.', v_revisions, v_without;
END $$;
