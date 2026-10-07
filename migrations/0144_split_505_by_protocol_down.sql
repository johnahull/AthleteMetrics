-- Down Migration 0144: reverse the 5-0-5 protocol split
--
-- Restores the four pre-0144 codes (AGILITY_505, _L, _R, _LSI) by repointing
-- every _M code back, and removes the yard (_YD) codes and their benchmarks.
--
-- LOSSY BY NATURE: yard-protocol data cannot be expressed in the old codes
-- (they meant "metric protocol"). Folding it into them would silently pool
-- incompatible times, and deleting it would silently destroy user data. So this
-- file REFUSES to run (RAISE EXCEPTION) if any yard-protocol user data exists:
-- measurements, goals, report_benchmarks, custom_benchmarks, saved report
-- configs or organization-defined metrics on a _YD code.
--
-- MANUAL OVERRIDE (only after a deliberate product decision): export the yard
-- rows (e.g. pg_dump of measurements WHERE metric LIKE 'AGILITY_505_YD%'), then
-- delete or re-label them yourself, and re-run this file. There is intentionally
-- no flag that skips the guard.
--
-- Pure configuration under the yard codes (organization_metrics, event_metrics,
-- peer_percentile_cache, site_metric_explanations, yard site_benchmarks and
-- their benchmark_set_items / organization_benchmarks) is deleted explicitly.
--
-- ORDER: if 0145 (COD deficit) is applied, run 0145_down BEFORE 0144_down: the
-- deficit formulas reference the _M / _YD legs. This file refuses (clear
-- message) while the deficit metrics exist.
--
-- Tracking: the runner skips a migration by name once recorded, and a rollback
-- must not leave the row behind or the next forward deploy would silently skip
-- 0144. The last statement deletes the '0144_split_505_by_protocol' row from
-- manual_migrations (a no-op if the row or the table is absent).
--
-- Transaction supplied by the runner; no BEGIN/COMMIT. Idempotent: once the
-- _M/_YD rows are gone every statement matches nothing.
--
-- Order:
--   0 — helper functions
--   1 — guard (0145 still applied; yard user data)
--   2 — recreate the four old site_metrics rows from the _M rows
--   3 — delete yard configuration + benchmarks
--   4 — repoint children _M -> old codes
--   5 — assertion: nothing references _M / _YD any more
--   6 — delete the _M and _YD site_metrics rows
--   7 — delete the manual_migrations tracking row

-- ============================================================================
-- Block 0 — helpers (pg_temp)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.m505_unmap(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           t,
           '\mAGILITY_505_M_LSI\M', 'AGILITY_505_LSI', 'g'),
           '\mAGILITY_505_M_R\M',   'AGILITY_505_R',   'g'),
           '\mAGILITY_505_M_L\M',   'AGILITY_505_L',   'g'),
           '\mAGILITY_505_M\M',     'AGILITY_505',     'g'),
           '\magility_505_m_lsi\M', 'agility_505_lsi', 'g'),
           '\magility_505_m_r\M',   'agility_505_r',   'g'),
           '\magility_505_m_l\M',   'agility_505_l',   'g'),
           '\magility_505_m\M',     'agility_505',     'g')
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.m505_unmap_arr(a text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT array_agg(pg_temp.m505_unmap(u.x) ORDER BY u.ord)
    FROM unnest(a) WITH ORDINALITY AS u(x, ord)
$fn$;

-- ============================================================================
-- Block 1 — guard: refuse to lose yard-protocol user data
-- ============================================================================
DO $$
DECLARE
  v_cod    INTEGER;
  v_meas   INTEGER;
  v_goals  INTEGER;
  v_rb     INTEGER;
  v_cb     INTEGER;
  v_cfg    INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_cod FROM site_metrics
   WHERE code IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD');
  IF v_cod > 0 THEN
    RAISE EXCEPTION 'Migration 0144 down aborted: migration 0145 (COD deficit) is still applied; run 0145_down (0145_add_cod_deficit_metrics_down.sql) first (its formulas reference the _M / _YD legs)';
  END IF;

  SELECT COUNT(*) INTO v_meas FROM measurements
   WHERE metric IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI')
      OR calculation_metadata::text ~* '\mAGILITY_505_YD(_L|_R|_LSI)?\M';
  SELECT COUNT(*) INTO v_goals FROM goals
   WHERE metric IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');
  SELECT COUNT(*) INTO v_rb FROM report_benchmarks
   WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');
  SELECT COUNT(*) INTO v_cb FROM custom_benchmarks
   WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');
  SELECT
      (SELECT COUNT(*) FROM reports WHERE config::text ~* '\mAGILITY_505_YD(_L|_R|_LSI)?\M')
    + (SELECT COUNT(*) FROM custom_org_metrics
        WHERE coalesce(formula, '') ~* '\mAGILITY_505_YD(_L|_R|_LSI)?\M'
           OR coalesce(array_to_string(dependent_metrics, ','), '') ~* '\mAGILITY_505_YD(_L|_R|_LSI)?\M')
  INTO v_cfg;

  IF v_meas + v_goals + v_rb + v_cb + v_cfg > 0 THEN
    RAISE EXCEPTION 'Migration 0144 down aborted: yard-protocol (_YD) data exists (measurements=%, goals=%, report_benchmarks=%, custom_benchmarks=%, reports/custom metrics=%). The old codes mean metric protocol, so this data cannot be restored without loss. See the header of this file for the manual override.',
      v_meas, v_goals, v_rb, v_cb, v_cfg;
  END IF;
END $$;

-- ============================================================================
-- Block 2 — recreate the four old site_metrics rows from the _M rows
-- (original labels / descriptions / formula as set by 0022, 0107, 0121, 0128)
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, short_description, what_it_measures, why_it_matters,
  available_org_types, sport_associations, validation_min, validation_max,
  decimal_precision, color, icon, is_derived, formula, dependent_metrics,
  calculation_config, auxiliary_input_config, created_by
)
SELECT
  m.old_code, m.label, s.category, s.unit, s.metric_type, s.is_system_default, s.is_active,
  s.display_order, m.description, s.short_description,
  COALESCE(m.what_it_measures, s.what_it_measures), s.why_it_matters,
  s.available_org_types, s.sport_associations, s.validation_min, s.validation_max,
  s.decimal_precision, s.color, s.icon, s.is_derived,
  COALESCE(m.formula, s.formula),
  COALESCE(m.dependent_metrics, s.dependent_metrics),
  s.calculation_config, s.auxiliary_input_config, s.created_by
FROM site_metrics s
JOIN (VALUES
  ('AGILITY_505_M', 'AGILITY_505', '5-0-5 Agility',
   '5-0-5 agility test: sprint 5 yards, turn 180 degrees, sprint 5 yards back.',
   'The 5-0-5 test measures your ability to decelerate, change direction 180 degrees, and re-accelerate. You sprint 5 meters, plant and turn, then sprint back through the timing gates.',
   NULL::text, NULL::text[]),
  ('AGILITY_505_M_L', 'AGILITY_505_L', '5-0-5 Agility (Left)',
   '5-0-5 agility test turning to the left.',
   NULL::text, NULL::text, NULL::text[]),
  ('AGILITY_505_M_R', 'AGILITY_505_R', '5-0-5 Agility (Right)',
   '5-0-5 agility test turning to the right.',
   NULL::text, NULL::text, NULL::text[]),
  ('AGILITY_505_M_LSI', 'AGILITY_505_LSI', '5-0-5 Limb Symmetry Index',
   'Limb Symmetry Index between left- and right-foot 5-0-5 turn times. Computed as (faster_leg / slower_leg) × 100. 100% = perfectly symmetric; <90% indicates clinically meaningful asymmetry and elevated lower-limb injury risk per Bishop et al., Hewett et al., and Dos''Santos et al. See cod-research-context.md §9.',
   NULL::text,
   '(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100',
   ARRAY['AGILITY_505_L', 'AGILITY_505_R'])
) AS m(m_code, old_code, label, description, what_it_measures, formula, dependent_metrics)
  ON m.m_code = s.code
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block 3 — remove yard configuration and benchmarks
-- ============================================================================
DELETE FROM benchmark_set_items
 WHERE benchmark_type = 'site'
   AND benchmark_id IN (
     SELECT id FROM site_benchmarks
      WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI')
   );

DELETE FROM organization_benchmarks
 WHERE benchmark_type = 'site'
   AND benchmark_id IN (
     SELECT id FROM site_benchmarks
      WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI')
   );

DELETE FROM site_benchmarks
 WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');

DELETE FROM organization_metrics
 WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');

DELETE FROM event_metrics
 WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');

DELETE FROM peer_percentile_cache
 WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');

DELETE FROM site_metric_explanations
 WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI');

-- ============================================================================
-- Block 4 — repoint _M children back to the old codes
-- ============================================================================
UPDATE organization_metrics
   SET metric_code = pg_temp.m505_unmap(metric_code)
 WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE event_metrics
   SET metric_code = pg_temp.m505_unmap(metric_code)
 WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE goals
   SET metric = pg_temp.m505_unmap(metric)
 WHERE metric IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE report_benchmarks
   SET metric_code = pg_temp.m505_unmap(metric_code)
 WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE custom_benchmarks
   SET metric_code = pg_temp.m505_unmap(metric_code)
 WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE peer_percentile_cache
   SET metric_code = pg_temp.m505_unmap(metric_code)
 WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE site_benchmarks
   SET metric_code = pg_temp.m505_unmap(metric_code)
 WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE site_metric_explanations
   SET metric_code = pg_temp.m505_unmap(metric_code)
 WHERE metric_code IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE measurements
   SET metric = pg_temp.m505_unmap(metric)
 WHERE metric IN ('AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI');

UPDATE measurements
   SET calculation_metadata = pg_temp.m505_unmap(calculation_metadata::text)::jsonb
 WHERE calculation_metadata IS NOT NULL
   AND calculation_metadata::text ~* '\mAGILITY_505_M(_L|_R|_LSI)?\M';

UPDATE reports
   SET config = pg_temp.m505_unmap(config::text)::jsonb
 WHERE config::text ~* '\mAGILITY_505_M(_L|_R|_LSI)?\M';

UPDATE custom_org_metrics
   SET formula = pg_temp.m505_unmap(formula),
       dependent_metrics = pg_temp.m505_unmap_arr(dependent_metrics),
       calculation_config = pg_temp.m505_unmap(calculation_config::text)::jsonb
 WHERE formula ~* '\mAGILITY_505_M(_L|_R|_LSI)?\M'
    OR array_to_string(dependent_metrics, ',') ~* '\mAGILITY_505_M(_L|_R|_LSI)?\M'
    OR calculation_config::text ~* '\mAGILITY_505_M(_L|_R|_LSI)?\M';

UPDATE site_metrics
   SET formula = pg_temp.m505_unmap(formula),
       dependent_metrics = pg_temp.m505_unmap_arr(dependent_metrics)
 WHERE code !~ '^AGILITY_505_(M|YD)'
   AND (formula ~* '\mAGILITY_505_M(_L|_R|_LSI)?\M'
        OR array_to_string(dependent_metrics, ',') ~* '\mAGILITY_505_M(_L|_R|_LSI)?\M');

-- ============================================================================
-- Block 5 — assertion: nothing may still reference a _M / _YD code
-- ============================================================================
DO $$
DECLARE
  v_left INTEGER;
BEGIN
  SELECT
      (SELECT COUNT(*) FROM organization_metrics   WHERE metric_code ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM event_metrics          WHERE metric_code ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM goals                  WHERE metric      ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM report_benchmarks      WHERE metric_code ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM custom_benchmarks      WHERE metric_code ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM peer_percentile_cache  WHERE metric_code ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM site_benchmarks        WHERE metric_code ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM site_metric_explanations WHERE metric_code ~ '^AGILITY_505_(M|YD)')
    + (SELECT COUNT(*) FROM measurements           WHERE metric ~ '^AGILITY_505_(M|YD)'
                                                      OR calculation_metadata::text ~* '\mAGILITY_505_(M|YD)(_L|_R|_LSI)?\M')
    + (SELECT COUNT(*) FROM reports                WHERE config::text ~* '\mAGILITY_505_(M|YD)(_L|_R|_LSI)?\M')
    + (SELECT COUNT(*) FROM custom_org_metrics     WHERE coalesce(formula, '') ~* '\mAGILITY_505_(M|YD)(_L|_R|_LSI)?\M'
                                                      OR coalesce(array_to_string(dependent_metrics, ','), '') ~* '\mAGILITY_505_(M|YD)(_L|_R|_LSI)?\M')
    + (SELECT COUNT(*) FROM site_metrics           WHERE code !~ '^AGILITY_505_(M|YD)'
                                                      AND (coalesce(formula, '') ~* '\mAGILITY_505_(M|YD)(_L|_R|_LSI)?\M'
                                                           OR coalesce(array_to_string(dependent_metrics, ','), '') ~* '\mAGILITY_505_(M|YD)(_L|_R|_LSI)?\M'))
  INTO v_left;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'Migration 0144 down aborted: % reference(s) to _M / _YD codes remain; refusing to delete the new site_metrics rows', v_left;
  END IF;
END $$;

-- ============================================================================
-- Block 6 — delete the _M and _YD site_metrics rows
-- ============================================================================
DELETE FROM site_metrics
 WHERE code IN (
   'AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI',
   'AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI'
 );

-- ============================================================================
-- Block 7 — forget that 0144 was applied (see header, "Tracking")
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0144_split_505_by_protocol';
  END IF;
  RAISE NOTICE 'Migration 0144 (down): restored AGILITY_505, _L, _R, _LSI; removed the _M / _YD codes and all yard benchmarks.';
END $$;
