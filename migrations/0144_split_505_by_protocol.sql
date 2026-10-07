-- Migration 0144: Split 5-0-5 Agility by protocol (metric / yard)
--
-- Spec: AM-FEAT-016 Part 1 (/home/hulla/devel/bta-business/specs/AM-FEAT-016_cod-deficit.md)
-- Plan: .omc/plans/am-feat-016-plan.md (section 2, "0144 structure")
--
-- The 5-0-5 is run in two incompatible protocols:
--   Metric: 10 m approach, 5 m to the turn line, 5 m back, timed over the final 10 m round trip.
--   Yard:   same layout in yards.
-- Times from the two protocols must never be pooled, so each of the four
-- existing 5-0-5 codes is split into a metric and a yard code:
--
--   AGILITY_505     -> AGILITY_505_M     / AGILITY_505_YD
--   AGILITY_505_L   -> AGILITY_505_M_L   / AGILITY_505_YD_L
--   AGILITY_505_R   -> AGILITY_505_M_R   / AGILITY_505_YD_R
--   AGILITY_505_LSI -> AGILITY_505_M_LSI / AGILITY_505_YD_LSI
--
-- ALL existing data is metric-protocol data, so every existing reference is
-- repointed to the _M code. The _YD codes start empty (plus approximate,
-- converted benchmarks).
--
-- Transaction: the runner (scripts/apply-manual-migrations.js) wraps this file
-- in a single transaction together with the manual_migrations insert, so there
-- is NO BEGIN/COMMIT here. Any RAISE EXCEPTION rolls everything back.
--
-- Why not UPDATE site_metrics.code: every child FK points at site_metrics.code
-- and most cascade on delete. So: insert new rows, repoint every child, assert
-- nothing references the old codes, only then delete the old rows.
--
-- Block layout:
--   0 — session-local helper functions (exact-token remapping)
--   A — insert new site_metrics rows (_M copies of the old rows, fresh _YD rows)
--   B — repoint all children (FK-safe order)
--   C — assertion: RAISE unless all 8 new codes exist, or if any old-code reference remains
--   D — delete the 4 old site_metrics rows
--   E — seed approximate YD benchmarks (x0.914) + set items + YD LSI tiers
--   F — summary notice
--
-- Prefix trap: AGILITY_505 is a prefix of AGILITY_505_L/_R/_LSI. All text
-- remapping uses exact tokens (\m ... \M word boundaries; underscore is a word
-- character) so already-migrated codes (AGILITY_505_M_L ...) are never matched
-- and a second run is a no-op.
--
-- Idempotent FOR THE RUNNER (every statement is a no-op once the old codes are
-- gone, and the runner records the migration so it is never applied twice).
-- DO NOT re-run this file by hand. A manual re-run would blindly relabel any
-- retired-code rows written during a failed-deploy window (which may be yard
-- data) as _M, and would overwrite admin edits to the _YD site_metrics rows.
-- Triage retired-code measurements by hand instead, using the import batch and
-- the CSV Units column to decide metric vs yard for each row.
--
-- Organization enablement (product decision, 2026-10-06): every
-- organization_metrics row on an old code is repointed to its _M code AND gets a
-- _YD twin for the same organization with the SAME is_enabled and display_order
-- (custom_label is not copied: it named the metric protocol). ON CONFLICT DO
-- NOTHING, so an existing row is never overridden. A disabled old row yields a
-- disabled twin; an organization with no old rows gets nothing. The down file
-- deletes all _YD organization rows.
--
-- Pending imports: a Dashr preview stored in import_batches.parsed_preview before
-- the deploy would, if committed afterwards, write retired codes into
-- measurements (no FK, orphaned). Such pending batches are EXPIRED (the same
-- terminal status the 30-minute TTL cleanup uses), never remapped: the old
-- parser ignored the CSV Units column, so metric vs yard cannot be inferred.
-- The user re-uploads the file. NOTE: the runner tracks migrations by name, so
-- this only takes effect in environments that have not yet applied 0144.
--
-- Deliberately NOT done: report_snapshots, user_achievements.metadata,
-- completed import_batches, audit_logs (historical).

-- ============================================================================
-- Block 0 — helpers (pg_temp: vanish with the session, nothing persists)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.m505_remap(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           t,
           '\mAGILITY_505_LSI\M', 'AGILITY_505_M_LSI', 'g'),
           '\mAGILITY_505_R\M',   'AGILITY_505_M_R',   'g'),
           '\mAGILITY_505_L\M',   'AGILITY_505_M_L',   'g'),
           '\mAGILITY_505\M',     'AGILITY_505_M',     'g'),
           '\magility_505_lsi\M', 'agility_505_m_lsi', 'g'),
           '\magility_505_r\M',   'agility_505_m_r',   'g'),
           '\magility_505_l\M',   'agility_505_m_l',   'g'),
           '\magility_505\M',     'agility_505_m',     'g')
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.m505_remap_arr(a text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT array_agg(pg_temp.m505_remap(u.x) ORDER BY u.ord)
    FROM unnest(a) WITH ORDINALITY AS u(x, ord)
$fn$;

-- ============================================================================
-- Block A — new site_metrics rows
--
-- A1: _M rows copy the old rows (display_order, colors, icon, explanation
--     columns, validation, etc.) and override label / description / formula.
-- A2: _YD rows are fresh definitions (yard protocol text).
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, short_description, what_it_measures, why_it_matters,
  available_org_types, sport_associations, validation_min, validation_max,
  decimal_precision, color, icon, is_derived, formula, dependent_metrics,
  calculation_config, auxiliary_input_config, created_by
)
SELECT
  m.new_code, m.label, s.category, s.unit, s.metric_type, s.is_system_default, s.is_active,
  s.display_order, m.description, s.short_description,
  COALESCE(m.what_it_measures, s.what_it_measures), s.why_it_matters,
  s.available_org_types, s.sport_associations, s.validation_min, s.validation_max,
  s.decimal_precision, s.color, s.icon, s.is_derived,
  COALESCE(m.formula, s.formula),
  COALESCE(m.dependent_metrics, s.dependent_metrics),
  CASE WHEN m.formula IS NOT NULL
       THEN '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
       ELSE s.calculation_config END,
  s.auxiliary_input_config, s.created_by
FROM site_metrics s
JOIN (VALUES
  ('AGILITY_505',     'AGILITY_505_M',     '5-0-5 Agility (m)',
   '5-0-5 agility test, metric protocol: 10 m approach, 5 m to the turn line, 5 m back, timed over the final 10 m round trip.',
   'The 5-0-5 test measures your ability to decelerate, change direction 180 degrees, and re-accelerate. Metric protocol: a 10 m approach, 5 m to the turn line, plant and turn, then 5 m back. Time is taken over the final 10 m round trip.',
   NULL::text, NULL::text[]),
  ('AGILITY_505_L',   'AGILITY_505_M_L',   '5-0-5 Agility (m, Left)',
   '5-0-5 agility test turning to the left, metric protocol: 10 m approach, 5 m to the turn line, 5 m back, timed over the final 10 m round trip.',
   NULL::text, NULL::text, NULL::text[]),
  ('AGILITY_505_R',   'AGILITY_505_M_R',   '5-0-5 Agility (m, Right)',
   '5-0-5 agility test turning to the right, metric protocol: 10 m approach, 5 m to the turn line, 5 m back, timed over the final 10 m round trip.',
   NULL::text, NULL::text, NULL::text[]),
  ('AGILITY_505_LSI', 'AGILITY_505_M_LSI', '5-0-5 Limb Symmetry Index (m)',
   'Limb Symmetry Index between left- and right-foot 5-0-5 turn times, metric protocol (10 m approach, 5 m to the turn line, 5 m back, timed over the final 10 m round trip). Computed as (faster_leg / slower_leg) × 100. 100% = perfectly symmetric, <90% indicates clinically meaningful asymmetry and elevated lower-limb injury risk per Bishop et al., Hewett et al., and Dos''Santos et al. See cod-research-context.md §9.',
   NULL::text,
   '(min(AGILITY_505_M_L, AGILITY_505_M_R) / max(AGILITY_505_M_L, AGILITY_505_M_R)) * 100',
   ARRAY['AGILITY_505_M_L', 'AGILITY_505_M_R'])
) AS m(old_code, new_code, label, description, what_it_measures, formula, dependent_metrics)
  ON m.old_code = s.code
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  what_it_measures = EXCLUDED.what_it_measures,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  calculation_config = EXCLUDED.calculation_config;

INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, short_description, what_it_measures, why_it_matters,
  decimal_precision, color, icon, validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES
  ('AGILITY_505_YD', '5-0-5 Agility (yd)', 'agility', 's', 'lower_is_better', true, true, 3,
   '5-0-5 agility test, yard protocol: 10 yd approach, 5 yd to the turn line, 5 yd back, timed over the final 10 yd round trip.',
   'How quickly you can stop, turn 180 degrees, and sprint back.',
   'The 5-0-5 test measures your ability to decelerate, change direction 180 degrees, and re-accelerate. Yard protocol: a 10 yd approach, 5 yd to the turn line, plant and turn, then 5 yd back. Time is taken over the final 10 yd round trip.',
   'This test isolates single-leg change of direction ability, revealing asymmetries between legs. It''s essential for sports requiring quick direction changes and reflects injury risk factors.',
   3, 'green', 'Zap', NULL, NULL, false, NULL, NULL, NULL),
  ('AGILITY_505_YD_L', '5-0-5 Agility (yd, Left)', 'agility', 's', 'lower_is_better', true, true, 24,
   '5-0-5 agility test turning to the left, yard protocol: 10 yd approach, 5 yd to the turn line, 5 yd back, timed over the final 10 yd round trip.',
   NULL, NULL, NULL,
   3, 'green', 'Zap', NULL, NULL, false, NULL, NULL, NULL),
  ('AGILITY_505_YD_R', '5-0-5 Agility (yd, Right)', 'agility', 's', 'lower_is_better', true, true, 25,
   '5-0-5 agility test turning to the right, yard protocol: 10 yd approach, 5 yd to the turn line, 5 yd back, timed over the final 10 yd round trip.',
   NULL, NULL, NULL,
   3, 'green', 'Zap', NULL, NULL, false, NULL, NULL, NULL),
  ('AGILITY_505_YD_LSI', '5-0-5 Limb Symmetry Index (yd)', 'agility', '%', 'higher_is_better', true, true, 40,
   'Limb Symmetry Index between left- and right-foot 5-0-5 turn times, yard protocol (10 yd approach, 5 yd to the turn line, 5 yd back, timed over the final 10 yd round trip). Computed as (faster_leg / slower_leg) × 100. 100% = perfectly symmetric, <90% indicates clinically meaningful asymmetry and elevated lower-limb injury risk per Bishop et al., Hewett et al., and Dos''Santos et al. See cod-research-context.md §9.',
   NULL, NULL, NULL,
   1, 'green', 'Activity', 0, 100, true,
   '(min(AGILITY_505_YD_L, AGILITY_505_YD_R) / max(AGILITY_505_YD_L, AGILITY_505_YD_R)) * 100',
   ARRAY['AGILITY_505_YD_L', 'AGILITY_505_YD_R'],
   '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  what_it_measures = EXCLUDED.what_it_measures,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  calculation_config = EXCLUDED.calculation_config,
  is_derived = EXCLUDED.is_derived,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max;

-- ============================================================================
-- Block B — repoint children to the _M codes (all existing data is metric)
-- Every UPDATE is bounded to the four old codes or to a token match, so a
-- second run touches nothing. FK-bound tables first, soft references after.
-- ============================================================================
-- _YD twin FIRST (reads the old-code rows before they are repointed). Same
-- is_enabled / display_order; created_at defaults to now. ON CONFLICT DO NOTHING
-- never overrides an existing row.
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled, display_order)
SELECT om.organization_id,
       CASE om.metric_code
         WHEN 'AGILITY_505'     THEN 'AGILITY_505_YD'
         WHEN 'AGILITY_505_L'   THEN 'AGILITY_505_YD_L'
         WHEN 'AGILITY_505_R'   THEN 'AGILITY_505_YD_R'
         WHEN 'AGILITY_505_LSI' THEN 'AGILITY_505_YD_LSI'
       END,
       om.is_enabled,
       om.display_order
  FROM organization_metrics om
 WHERE om.metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI')
ON CONFLICT (organization_id, metric_code) DO NOTHING;

UPDATE organization_metrics
   SET metric_code = pg_temp.m505_remap(metric_code)
 WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

UPDATE event_metrics
   SET metric_code = pg_temp.m505_remap(metric_code)
 WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

UPDATE goals
   SET metric = pg_temp.m505_remap(metric)
 WHERE metric IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

UPDATE report_benchmarks
   SET metric_code = pg_temp.m505_remap(metric_code)
 WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

UPDATE custom_benchmarks
   SET metric_code = pg_temp.m505_remap(metric_code)
 WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

UPDATE peer_percentile_cache
   SET metric_code = pg_temp.m505_remap(metric_code)
 WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

-- site_benchmarks IN PLACE: ids, benchmark_set_items and organization_benchmarks
-- (which reference site_benchmarks.id, not the metric code) all survive.
UPDATE site_benchmarks
   SET metric_code = pg_temp.m505_remap(metric_code)
 WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

UPDATE site_metric_explanations
   SET metric_code = pg_temp.m505_remap(metric_code)
 WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

-- measurements: only `metric` changes for plain rows; calculated rows also
-- carry the formula string and lowercased sourceValues keys in metadata.
UPDATE measurements
   SET metric = pg_temp.m505_remap(metric)
 WHERE metric IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

UPDATE measurements
   SET calculation_metadata = pg_temp.m505_remap(calculation_metadata::text)::jsonb
 WHERE calculation_metadata IS NOT NULL
   AND calculation_metadata::text ~* '\mAGILITY_505(_L|_R|_LSI)?\M';

-- saved reports / templates (metrics[], compositeIndex.weights keys, userDefined[].metricCode)
UPDATE reports
   SET config = pg_temp.m505_remap(config::text)::jsonb
 WHERE config::text ~* '\mAGILITY_505(_L|_R|_LSI)?\M';

-- organization-defined derived metrics referencing 5-0-5 codes
UPDATE custom_org_metrics
   SET formula = pg_temp.m505_remap(formula),
       dependent_metrics = pg_temp.m505_remap_arr(dependent_metrics),
       calculation_config = pg_temp.m505_remap(calculation_config::text)::jsonb
 WHERE formula ~* '\mAGILITY_505(_L|_R|_LSI)?\M'
    OR array_to_string(dependent_metrics, ',') ~* '\mAGILITY_505(_L|_R|_LSI)?\M'
    OR calculation_config::text ~* '\mAGILITY_505(_L|_R|_LSI)?\M';

-- other site-level derived metrics that consume 5-0-5 codes
UPDATE site_metrics
   SET formula = pg_temp.m505_remap(formula),
       dependent_metrics = pg_temp.m505_remap_arr(dependent_metrics)
 WHERE code NOT IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI')
   AND (formula ~* '\mAGILITY_505(_L|_R|_LSI)?\M'
        OR array_to_string(dependent_metrics, ',') ~* '\mAGILITY_505(_L|_R|_LSI)?\M');

-- Expire pending imports whose preview still carries a retired code
-- (idempotent: a second run matches nothing; no-op when import_batches is empty).
UPDATE import_batches
   SET status = 'expired'
 WHERE status = 'pending'
   AND parsed_preview::text ~ '\mAGILITY_505(_L|_R|_LSI)?\M';

-- ============================================================================
-- Block C — safety assertion: nothing may still reference an old code.
-- Runs BEFORE the old site_metrics rows are deleted (their ON DELETE CASCADE
-- would otherwise silently remove any straggler).
-- ============================================================================
DO $$
DECLARE
  v_left    INTEGER;
  v_missing TEXT;
BEGIN
  -- All 8 new codes must exist. Block A1 joins the old rows and silently skips
  -- any old code that is missing, so a DB lacking one old row would otherwise
  -- commit with fewer than 8 new codes (and Block D would delete the rest).
  SELECT string_agg(req.code, ', ' ORDER BY req.code)
    INTO v_missing
    FROM (VALUES
      ('AGILITY_505_M'), ('AGILITY_505_M_L'), ('AGILITY_505_M_R'), ('AGILITY_505_M_LSI'),
      ('AGILITY_505_YD'), ('AGILITY_505_YD_L'), ('AGILITY_505_YD_R'), ('AGILITY_505_YD_LSI')
    ) AS req(code)
   WHERE NOT EXISTS (SELECT 1 FROM site_metrics s WHERE s.code = req.code);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0144 aborted: expected all 8 new 5-0-5 site_metrics rows but these are missing (was an old AGILITY_505* row absent?): %', v_missing;
  END IF;

  SELECT
      (SELECT COUNT(*) FROM organization_metrics   WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM event_metrics          WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM goals                  WHERE metric      IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM report_benchmarks      WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM custom_benchmarks      WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM peer_percentile_cache  WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM site_benchmarks        WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM site_metric_explanations WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'))
    + (SELECT COUNT(*) FROM measurements           WHERE metric      IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI')
                                                      OR calculation_metadata::text ~* '\mAGILITY_505(_L|_R|_LSI)?\M')
    + (SELECT COUNT(*) FROM reports                WHERE config::text ~* '\mAGILITY_505(_L|_R|_LSI)?\M')
    + (SELECT COUNT(*) FROM custom_org_metrics     WHERE formula ~* '\mAGILITY_505(_L|_R|_LSI)?\M'
                                                      OR array_to_string(dependent_metrics, ',') ~* '\mAGILITY_505(_L|_R|_LSI)?\M'
                                                      OR calculation_config::text ~* '\mAGILITY_505(_L|_R|_LSI)?\M')
    + (SELECT COUNT(*) FROM site_metrics           WHERE code NOT IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI')
                                                      AND (formula ~* '\mAGILITY_505(_L|_R|_LSI)?\M'
                                                           OR array_to_string(dependent_metrics, ',') ~* '\mAGILITY_505(_L|_R|_LSI)?\M'))
  INTO v_left;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'Migration 0144 aborted: % reference(s) to retired AGILITY_505 codes remain; refusing to delete the old site_metrics rows', v_left;
  END IF;
END $$;

-- ============================================================================
-- Block D — delete the four retired site_metrics rows
-- ============================================================================
DELETE FROM site_metrics
 WHERE code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI');

-- ============================================================================
-- Block E — approximate YD benchmarks
--
-- Every site_benchmarks row on a _M / _M_L / _M_R code gets a yard twin:
--   id            : <source id>-yd
--   tier_group_id : md5(<source tier_group_id>::text || '-yd')::uuid (like 0128)
--   name          : <source name> || ' (Yard, approx.)' (kept within varchar(100))
--   values        : ROUND(x * 0.914, 3)  (yards = 0.914 x metres time; the turn
--                   does not scale proportionally, so these are PROVISIONAL)
-- LSI tiers (_M_LSI) are a unit-free ratio: copied with identical thresholds
-- under new ids / tier_group_id and the YD LSI code.
-- Existing _M rows are never altered. benchmark_set_items are mirrored.
-- ON CONFLICT DO NOTHING: re-runs must not overwrite later recalibration.
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color, coaching_note,
  applicable_org_types,
  gender, age_min, age_max, sport, position, level,
  is_system_default, is_active, display_order,
  benchmark_source, peer_percentile_target, peer_filter_criteria,
  color, icon
)
SELECT
  src.id || '-yd',
  map.yd_code,
  CASE WHEN map.factor <> 1
       THEN LEFT(src.name, 100 - length(' (Yard, approx.)')) || ' (Yard, approx.)'
       ELSE src.name END,
  CASE WHEN map.factor <> 1
       THEN 'Approximate: converted from metric-protocol research (x0.914); recalibrate with BTA data.'
            || CASE WHEN src.description IS NULL OR src.description = '' THEN '' ELSE ' ' || src.description END
       ELSE src.description END,
  src.comparison_operator,
  ROUND(src.benchmark_value * map.factor, 3),
  ROUND(src.min_value * map.factor, 3),
  ROUND(src.max_value * map.factor, 3),
  CASE WHEN src.tier_group_id IS NOT NULL THEN md5(src.tier_group_id::text || '-yd')::uuid END,
  src.tier_order, src.tier_name, src.tier_color, src.coaching_note,
  src.applicable_org_types,
  src.gender, src.age_min, src.age_max, src.sport, src.position, src.level,
  src.is_system_default, src.is_active, src.display_order,
  src.benchmark_source, src.peer_percentile_target, src.peer_filter_criteria,
  src.color, src.icon
FROM site_benchmarks src
JOIN (VALUES
  ('AGILITY_505_M',     'AGILITY_505_YD',     0.914),
  ('AGILITY_505_M_L',   'AGILITY_505_YD_L',   0.914),
  ('AGILITY_505_M_R',   'AGILITY_505_YD_R',   0.914),
  ('AGILITY_505_M_LSI', 'AGILITY_505_YD_LSI', 1)
) AS map(m_code, yd_code, factor) ON map.m_code = src.metric_code
ON CONFLICT (metric_code, name) DO NOTHING;

INSERT INTO benchmark_set_items (
  id, set_id, benchmark_id, benchmark_type, display_order, custom_label
)
SELECT
  bsi.id || '-yd',
  bsi.set_id,
  bsi.benchmark_id || '-yd',
  'site',
  bsi.display_order,
  bsi.custom_label
FROM benchmark_set_items bsi
JOIN site_benchmarks sb
  ON sb.id = bsi.benchmark_id
 AND bsi.benchmark_type = 'site'
WHERE sb.metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI')
  AND EXISTS (SELECT 1 FROM site_benchmarks yd WHERE yd.id = sb.id || '-yd')
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO NOTHING;

-- ============================================================================
-- Block F — summary
-- ============================================================================
DO $$
DECLARE
  v_metrics    INTEGER;
  v_m_bench    INTEGER;
  v_yd_bench   INTEGER;
  v_yd_items   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_metrics FROM site_metrics WHERE code ~ '^AGILITY_505_(M|YD)';
  SELECT COUNT(*) INTO v_m_bench FROM site_benchmarks WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');
  SELECT COUNT(*) INTO v_yd_bench FROM site_benchmarks WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');
  SELECT COUNT(*) INTO v_yd_items FROM benchmark_set_items WHERE id LIKE '%-yd';

  RAISE NOTICE 'Migration 0144 complete: % 5-0-5 protocol site_metrics rows, % metric-protocol benchmarks (repointed in place), % yard benchmarks seeded, % yard benchmark_set_items.',
    v_metrics, v_m_bench, v_yd_bench, v_yd_items;
END $$;
