-- Migration 0168: HOP_SL_TRIPLE_L / HOP_SL_TRIPLE_R from meters to feet
--
-- The single-leg triple hop for distance was created in the admin UI in meters. Coaches and the benchmark research
-- work in feet, so both legs switch to unit 'ft' and every stored value follows (x 3.28084). 0169 adds the LSI metric
-- and the benchmarks on top of the feet unit.
--
-- Per code (L and R are checked on their own):
--   unit 'm' / 'meter' / 'meters'  convert
--   unit 'ft' / 'feet' / 'foot'    already feet (any case): no conversion, the spelling is normalized to 'ft'
--   row absent                     NOTICE, skipped
--   any other unit (also NULL)     RAISE EXCEPTION: never guess a conversion factor
--
-- Converted: site_metrics (unit, validation_min/max), measurements (value, units), site_benchmarks and custom_benchmarks
-- (benchmark_value, min_value, max_value), report_benchmarks.benchmark_value (eval reports excluded), reports.config -> benchmarks.userDefined[].value
-- (eval reports excluded: their config is immutable), goals (target, baseline, current).
-- Cleared, not converted: peer_percentile_cache rows (p10..p90, mean are in meters; the cache rebuilds itself).
-- Known stale, deliberately left alone: user_achievements.metadata, import_batches jsonb, report_snapshots, frozen eval
-- report config, and calculation_metadata.sourceValues of derived rows built on L/R (refreshed by
-- POST /api/admin/recalculate-derived-metrics, which must be run after this migration).
--
-- BACK UP THE DATABASE FIRST: this rewrites stored measurement values. Rounding to 3 decimals can drift a value by
-- about 0.001 ft on a down/up round trip.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Number is provisional: renumber at merge if another branch lands 0168 first.

DO $$
DECLARE
  v_factor CONSTANT NUMERIC := 3.28084;
  v_code   TEXT;
  v_unit   TEXT;
  v_todo   TEXT[] := ARRAY[]::TEXT[];
  v_n      BIGINT;
BEGIN
  FOREACH v_code IN ARRAY ARRAY['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R'] LOOP
    SELECT unit INTO v_unit FROM site_metrics WHERE code = v_code;
    IF NOT FOUND THEN
      RAISE NOTICE 'Migration 0168: % not found, skipped.', v_code;
    ELSIF lower(v_unit) IN ('ft', 'feet', 'foot') THEN
      RAISE NOTICE 'Migration 0168: % is already in feet, no conversion.', v_code;
      -- Normalize the spelling (e.g. 'Feet') so 0169 and the app see the canonical 'ft'.
      UPDATE site_metrics SET unit = 'ft' WHERE code = v_code AND unit <> 'ft';
      -- Only respell rows that already say feet; a row in any other unit is left alone, never relabeled without a conversion.
      UPDATE measurements SET units = 'ft' WHERE metric = v_code AND lower(units) IN ('ft', 'feet', 'foot') AND units <> 'ft';
    ELSIF v_unit IN ('m', 'meter', 'meters') THEN
      v_todo := v_todo || v_code;
    ELSE
      RAISE EXCEPTION 'Migration 0168: % has unit %, expected m/meter/meters or ft. Refusing to guess a conversion.', v_code, COALESCE(v_unit, 'NULL');
    END IF;
  END LOOP;

  IF cardinality(v_todo) = 0 THEN
    RETURN;
  END IF;

  UPDATE site_metrics
     SET unit = 'ft',
         validation_min = ROUND(validation_min * v_factor, 3),
         validation_max = ROUND(validation_max * v_factor, 3)
   WHERE code = ANY(v_todo);

  UPDATE measurements SET value = ROUND(value * v_factor, 3), units = 'ft' WHERE metric = ANY(v_todo);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Migration 0168: % measurements converted.', v_n;

  UPDATE site_benchmarks
     SET benchmark_value = ROUND(benchmark_value * v_factor, 3),
         min_value = ROUND(min_value * v_factor, 3),
         max_value = ROUND(max_value * v_factor, 3)
   WHERE metric_code = ANY(v_todo);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Migration 0168: % site_benchmarks converted.', v_n;

  UPDATE custom_benchmarks
     SET benchmark_value = ROUND(benchmark_value * v_factor, 3),
         min_value = ROUND(min_value * v_factor, 3),
         max_value = ROUND(max_value * v_factor, 3)
   WHERE metric_code = ANY(v_todo);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Migration 0168: % custom_benchmarks converted.', v_n;

  UPDATE report_benchmarks SET benchmark_value = ROUND(benchmark_value * v_factor, 3)
     WHERE metric_code = ANY(v_todo)
       AND report_id NOT IN (SELECT id FROM reports WHERE report_type = 'eval');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Migration 0168: % report_benchmarks converted.', v_n;

  UPDATE reports r
     SET config = jsonb_set(
           r.config,
           '{benchmarks,userDefined}',
           (SELECT jsonb_agg(
                     CASE WHEN e.value->>'metricCode' = ANY(v_todo) AND jsonb_typeof(e.value->'value') = 'number'
                          THEN jsonb_set(e.value, '{value}', to_jsonb(ROUND((e.value->>'value')::NUMERIC * v_factor, 3)))
                          ELSE e.value END
                     ORDER BY e.ord)
              FROM jsonb_array_elements(r.config->'benchmarks'->'userDefined') WITH ORDINALITY AS e(value, ord))
         )
   WHERE r.report_type <> 'eval'
     AND jsonb_typeof(r.config->'benchmarks'->'userDefined') = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.config->'benchmarks'->'userDefined') AS u(value)
                  WHERE u.value->>'metricCode' = ANY(v_todo) AND jsonb_typeof(u.value->'value') = 'number');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Migration 0168: % report configs converted.', v_n;

  UPDATE goals
     SET target_value = ROUND(target_value * v_factor, 3),
         baseline_value = ROUND(baseline_value * v_factor, 3),
         current_value = ROUND(current_value * v_factor, 3)
   WHERE metric = ANY(v_todo);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Migration 0168: % goals converted.', v_n;

  DELETE FROM peer_percentile_cache WHERE metric_code = ANY(v_todo);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Migration 0168: % peer_percentile_cache rows cleared.', v_n;
END $$;
