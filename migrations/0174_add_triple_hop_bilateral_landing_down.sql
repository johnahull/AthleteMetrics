-- Migration 0174 (down): remove the bilateral-landing triple hop metrics, the LSI and its screening set
--
-- Refuses while real data references the new metrics: any measurement of HOP_SL_TRIPLE_BL_L / _R, any DIRECT (not calculated)
-- LSI measurement, goals, report / custom benchmarks, report configs or report templates. Only calculated LSI rows are
-- deleted, since they can be recomputed.
-- Forgets the manual_migrations row so a later re-apply is not silently skipped.
-- The stick-landing legs (HOP_SL_TRIPLE_L / _R), their 0169 LSI, sets and tiers are never touched.

DO $$
DECLARE
  v_set_id TEXT := 'set-screening-triple-hop-bl-asymmetry';
  -- Exact codes, not LIKE 'HOP_SL_TRIPLE_BL_%': in LIKE an underscore matches any one character
  v_codes  TEXT[] := ARRAY['HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R', 'HOP_SL_TRIPLE_BL_LSI'];
  v_bench  TEXT[];
BEGIN
  IF EXISTS (SELECT 1 FROM measurements WHERE metric = 'HOP_SL_TRIPLE_BL_LSI' AND is_calculated = false) THEN
    RAISE EXCEPTION 'Migration 0174 (down): direct HOP_SL_TRIPLE_BL_LSI measurements exist, refusing to remove the metric.';
  END IF;

  IF EXISTS (SELECT 1 FROM measurements WHERE metric IN ('HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R')) THEN
    RAISE EXCEPTION 'Migration 0174 (down): HOP_SL_TRIPLE_BL_L / _R measurements exist, refusing to remove the metrics.';
  END IF;

  IF EXISTS (SELECT 1 FROM goals WHERE metric = ANY(v_codes))
     OR EXISTS (SELECT 1 FROM report_benchmarks WHERE metric_code = ANY(v_codes))
     OR EXISTS (SELECT 1 FROM custom_benchmarks WHERE metric_code = ANY(v_codes)) THEN
    RAISE EXCEPTION 'Migration 0174 (down): goals, report benchmarks or custom benchmarks reference the HOP_SL_TRIPLE_BL_* metrics, refusing to remove them.';
  END IF;

  -- Deliberately over-cautious: a plain substring match on the JSON text, so a field that merely mentions a code also blocks
  -- the rollback. Refusing is safer than leaving reports that point at deleted metrics.
  IF EXISTS (SELECT 1 FROM reports WHERE strpos(config::text, 'HOP_SL_TRIPLE_BL_') > 0)
     OR EXISTS (SELECT 1 FROM report_templates WHERE strpos(metrics::text, 'HOP_SL_TRIPLE_BL_') > 0) THEN
    RAISE EXCEPTION 'Migration 0174 (down): reports or report templates reference the HOP_SL_TRIPLE_BL_* metrics, refusing to remove them.';
  END IF;

  DELETE FROM measurements WHERE metric = 'HOP_SL_TRIPLE_BL_LSI' AND is_calculated = true;

  -- Every site benchmark of the three metrics, also tiers an admin added later, plus our own LSI tier ids
  SELECT COALESCE(array_agg(id), ARRAY[]::TEXT[]) INTO v_bench
    FROM site_benchmarks
   WHERE metric_code = ANY(v_codes)
      OR id IN ('bench-triple-hop-bl-lsi-symmetrical', 'bench-triple-hop-bl-lsi-mild', 'bench-triple-hop-bl-lsi-flag');

  -- Items in any set (also organization sets that picked these tiers), before the benchmarks go
  DELETE FROM benchmark_set_items
   WHERE set_id = v_set_id
      OR (benchmark_type = 'site' AND benchmark_id = ANY(v_bench));
  DELETE FROM benchmark_sets WHERE id = v_set_id;

  DELETE FROM organization_benchmarks WHERE benchmark_type = 'site' AND benchmark_id = ANY(v_bench);
  DELETE FROM site_benchmarks WHERE id = ANY(v_bench);

  -- No foreign key on site_metric_explanations.metric_code, so it is not cleaned up by the metric delete
  DELETE FROM site_metric_explanations WHERE metric_code = ANY(v_codes);
  DELETE FROM organization_metrics WHERE metric_code = ANY(v_codes);
  DELETE FROM site_metrics WHERE code = ANY(v_codes);

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0174_add_triple_hop_bilateral_landing';
  END IF;
END $$;
