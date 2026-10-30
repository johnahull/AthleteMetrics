-- Down Migration 0169: remove the 5-10-5 tier benchmarks, sets and set items
--
-- Deletes by id prefix: site_benchmarks 'b5105-%', benchmark_sets 'set-5105-%'. organization_benchmarks has no foreign
-- key to site_benchmarks, so its rows are deleted explicitly. Forgets this migration's manual_migrations row so the next
-- forward deploy re-applies it. Athlete measurements are not touched.

DELETE FROM organization_benchmarks
 WHERE benchmark_type = 'site' AND benchmark_id LIKE 'b5105-%';

DELETE FROM organization_benchmark_sets WHERE site_set_id LIKE 'set-5105-%';
DELETE FROM benchmark_set_items WHERE set_id LIKE 'set-5105-%';
DELETE FROM benchmark_sets WHERE id LIKE 'set-5105-%';
DELETE FROM site_benchmarks WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105-%';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0169_seed_5105_tier_benchmarks';
  END IF;
END $$;
