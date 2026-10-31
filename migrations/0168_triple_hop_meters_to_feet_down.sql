-- Migration 0168 (down): HOP_SL_TRIPLE_L / HOP_SL_TRIPLE_R from feet back to meters
--
-- Mirror of 0168: a code with unit 'ft' is divided by 3.28084 and gets unit 'm'; a code in any other unit is skipped.
-- Roll back 0169 first: its feet benchmarks would otherwise be converted to meters while its sets still say feet.
-- Values can drift by about 0.001 from rounding. peer_percentile_cache rows are cleared again.
-- Forgets the manual_migrations row so a later re-apply is not silently skipped.

DO $$
DECLARE
  v_factor CONSTANT NUMERIC := 3.28084;
  v_code   TEXT;
  v_unit   TEXT;
  v_todo   TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM manual_migrations WHERE migration_name = '0169_add_triple_hop_lsi_and_benchmarks') THEN
    RAISE EXCEPTION 'Migration 0168 (down): roll back 0169_add_triple_hop_lsi_and_benchmarks first.';
  END IF;

  FOREACH v_code IN ARRAY ARRAY['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R'] LOOP
    SELECT unit INTO v_unit FROM site_metrics WHERE code = v_code;
    IF FOUND AND v_unit = 'ft' THEN
      v_todo := v_todo || v_code;
    ELSE
      RAISE NOTICE 'Migration 0168 (down): % not in ft, skipped.', v_code;
    END IF;
  END LOOP;

  IF cardinality(v_todo) > 0 THEN
    UPDATE site_metrics
       SET unit = 'm',
           validation_min = ROUND(validation_min / v_factor, 3),
           validation_max = ROUND(validation_max / v_factor, 3)
     WHERE code = ANY(v_todo);

    UPDATE measurements SET value = ROUND(value / v_factor, 3), units = 'm' WHERE metric = ANY(v_todo);

    UPDATE site_benchmarks
       SET benchmark_value = ROUND(benchmark_value / v_factor, 3),
           min_value = ROUND(min_value / v_factor, 3),
           max_value = ROUND(max_value / v_factor, 3)
     WHERE metric_code = ANY(v_todo);

    UPDATE custom_benchmarks
       SET benchmark_value = ROUND(benchmark_value / v_factor, 3),
           min_value = ROUND(min_value / v_factor, 3),
           max_value = ROUND(max_value / v_factor, 3)
     WHERE metric_code = ANY(v_todo);

    UPDATE report_benchmarks SET benchmark_value = ROUND(benchmark_value / v_factor, 3)
       WHERE metric_code = ANY(v_todo)
         AND report_id NOT IN (SELECT id FROM reports WHERE report_type = 'eval');

    UPDATE reports r
       SET config = jsonb_set(
             r.config,
             '{benchmarks,userDefined}',
             (SELECT jsonb_agg(
                       CASE WHEN e.value->>'metricCode' = ANY(v_todo) AND jsonb_typeof(e.value->'value') = 'number'
                            THEN jsonb_set(e.value, '{value}', to_jsonb(ROUND((e.value->>'value')::NUMERIC / v_factor, 3)))
                            ELSE e.value END
                       ORDER BY e.ord)
                FROM jsonb_array_elements(r.config->'benchmarks'->'userDefined') WITH ORDINALITY AS e(value, ord))
           )
     WHERE r.report_type <> 'eval'
       AND jsonb_typeof(r.config->'benchmarks'->'userDefined') = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.config->'benchmarks'->'userDefined') AS u(value)
                    WHERE u.value->>'metricCode' = ANY(v_todo) AND jsonb_typeof(u.value->'value') = 'number');

    UPDATE goals
       SET target_value = ROUND(target_value / v_factor, 3),
           baseline_value = ROUND(baseline_value / v_factor, 3),
           current_value = ROUND(current_value / v_factor, 3)
     WHERE metric = ANY(v_todo);

    DELETE FROM peer_percentile_cache WHERE metric_code = ANY(v_todo);
  END IF;

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0168_triple_hop_meters_to_feet';
  END IF;
END $$;
