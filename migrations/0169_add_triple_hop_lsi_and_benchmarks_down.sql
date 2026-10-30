-- Migration 0169 (down): remove the triple hop LSI metric, its screening set and the soccer distance tiers
--
-- Removes calculated HOP_SL_TRIPLE_LSI measurements, then the benchmarks, sets, org enablement and the metric.
-- Refuses while any DIRECT (not calculated) LSI measurement exists: those are data, not derived rows.
-- Forgets the manual_migrations row so a later re-apply is not silently skipped.

DO $$
DECLARE
  v_set_ids TEXT[] := ARRAY['set-screening-triple-hop-asymmetry', 'set-soccer-triple-hop-male', 'set-soccer-triple-hop-female'];
BEGIN
  IF EXISTS (SELECT 1 FROM measurements WHERE metric = 'HOP_SL_TRIPLE_LSI' AND is_calculated = false) THEN
    RAISE EXCEPTION 'Migration 0169 (down): direct HOP_SL_TRIPLE_LSI measurements exist, refusing to remove the metric.';
  END IF;

  IF EXISTS (SELECT 1 FROM goals WHERE metric = 'HOP_SL_TRIPLE_LSI')
     OR EXISTS (SELECT 1 FROM report_benchmarks WHERE metric_code = 'HOP_SL_TRIPLE_LSI')
     OR EXISTS (SELECT 1 FROM custom_benchmarks WHERE metric_code = 'HOP_SL_TRIPLE_LSI') THEN
    RAISE EXCEPTION 'Migration 0169 (down): goals, report benchmarks or custom benchmarks reference HOP_SL_TRIPLE_LSI, refusing to remove the metric.';
  END IF;

  DELETE FROM measurements WHERE metric = 'HOP_SL_TRIPLE_LSI' AND is_calculated = true;

  -- Items in any set (also organization sets that picked these tiers), before the benchmarks go
  DELETE FROM benchmark_set_items
   WHERE set_id = ANY(v_set_ids)
      OR (benchmark_type = 'site'
          AND benchmark_id IN (SELECT id FROM site_benchmarks
                                WHERE metric_code = 'HOP_SL_TRIPLE_LSI'
                                   OR id LIKE 'bench-triple-hop-male-%' OR id LIKE 'bench-triple-hop-female-%'));
  DELETE FROM benchmark_sets WHERE id = ANY(v_set_ids);

  DELETE FROM organization_benchmarks
   WHERE benchmark_type = 'site'
     AND benchmark_id IN (SELECT id FROM site_benchmarks
                           WHERE metric_code = 'HOP_SL_TRIPLE_LSI'
                              OR id LIKE 'bench-triple-hop-male-%' OR id LIKE 'bench-triple-hop-female-%');
  DELETE FROM site_benchmarks
   WHERE metric_code = 'HOP_SL_TRIPLE_LSI'
      OR id LIKE 'bench-triple-hop-male-%' OR id LIKE 'bench-triple-hop-female-%';

  DELETE FROM organization_metrics WHERE metric_code = 'HOP_SL_TRIPLE_LSI';
  DELETE FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_LSI';

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0169_add_triple_hop_lsi_and_benchmarks';
  END IF;
END $$;
