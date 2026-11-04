-- Down Migration 0178: remove the JUMP_CMJ_HOH age-group tiers
--
-- Deletes by id prefix: site_benchmarks 'cmjhoh-%', benchmark_sets 'set-cmjhoh-%' (and their items). organization_benchmarks
-- has no foreign key to site_benchmarks, so its rows (including those auto-enabled by the up migration) are deleted
-- explicitly. Forgets this migration's manual_migrations row so the next forward deploy re-applies it. Measurements and
-- the JUMP_CMJ_HOH metric itself are not touched.

DELETE FROM organization_benchmarks
 WHERE benchmark_type = 'site' AND benchmark_id LIKE 'cmjhoh-%';

DELETE FROM organization_benchmark_sets WHERE site_set_id LIKE 'set-cmjhoh-%';
DELETE FROM benchmark_set_items WHERE set_id LIKE 'set-cmjhoh-%';
DELETE FROM benchmark_sets WHERE id LIKE 'set-cmjhoh-%';
DELETE FROM site_benchmarks WHERE metric_code = 'JUMP_CMJ_HOH' AND id LIKE 'cmjhoh-%';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0178_seed_cmj_hoh_tiers';
  END IF;
END $$;
