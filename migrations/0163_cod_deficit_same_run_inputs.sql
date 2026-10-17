-- Migration 0163: AGILITY_COD_DEFICIT_M_INTERP takes its 10 yd and 20 yd splits from one run
--
-- 0161 documents a known limit: same_date picks the best DASH_10YD and the best DASH_20YD of
-- the date independently, so the interpolated 10 m time could mix two different sprints.
-- Device imports now write calculationMetadata.runId on a drill row and on each of its split
-- rows, and calculationConfig.sameRunInputs makes the calculator take the listed inputs from
-- one run (packages/api/services/same-run-sources.ts).
--
-- The other split formulas (0145 COD deficits) use ONE split (DASH_10M / DASH_10YD) next to
-- the 5-0-5 legs, which are different tests, so they need no flag.
--
-- Existing data: rows already in the database have no run id. Without one, the calculator
-- treats them as one pool and keeps the old best-of-each rule for it, so nothing changes for
-- them until they are re-imported. Existing calculated rows are not touched; run the
-- derived-metric recalc-all to refresh them after a re-import.
--
-- Requires 0161 (the metric). If the row is absent this updates nothing.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT here.
-- Idempotent (jsonb || overwrites the same key).

UPDATE site_metrics
   SET calculation_config = COALESCE(calculation_config, '{}'::jsonb)
                            || '{"sameRunInputs":["DASH_10YD","DASH_20YD"]}'::jsonb
 WHERE code = 'AGILITY_COD_DEFICIT_M_INTERP';
